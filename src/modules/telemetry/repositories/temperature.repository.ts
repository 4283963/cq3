import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Temperature, TemperatureDocument, TemperatureSensor } from '../schemas/temperature.schema';

export interface LeanTemperature {
  _id: any;
  vehicle_id: string;
  sensors: TemperatureSensor[];
  average_temp?: number;
  min_temp?: number;
  max_temp?: number;
  humidity?: number;
  is_alarm?: boolean;
  alarm_level?: string;
  timestamp: Date;
}

export interface BulkWriteSummary {
  insertedCount: number;
  matchedCount: number;
  modifiedCount: number;
  deletedCount: number;
  upsertedCount: number;
}

export interface SeekPaginatedResult<T> {
  data: T[];
  next_cursor: string | null;
  has_next: boolean;
  page_size: number;
}

export interface TemperatureStats {
  samples: number;
  overall_avg: number;
  overall_min: number;
  overall_max: number;
  avg_humidity: number;
  total_alarms: number;
  critical_alarms: number;
  warning_alarms: number;
}

@Injectable()
export class TemperatureRepository {
  private readonly logger = new Logger(TemperatureRepository.name);

  constructor(
    @InjectModel(Temperature.name)
    private readonly temperatureModel: Model<TemperatureDocument>,
  ) {}

  async bulkInsert(temperatures: Partial<Temperature>[]): Promise<BulkWriteSummary> {
    this.logger.debug(`批量插入 ${temperatures.length} 条温度数据`);
    const operations = temperatures.map((temp) => ({
      insertOne: { document: temp },
    }));
    const result = await this.temperatureModel.bulkWrite(operations as any, {
      ordered: false,
    });
    return {
      insertedCount: result.insertedCount,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      deletedCount: result.deletedCount,
      upsertedCount: result.upsertedCount,
    };
  }

  async insertOne(temperature: Partial<Temperature>): Promise<TemperatureDocument> {
    const created = new this.temperatureModel(temperature);
    return created.save();
  }

  async findByVehicleAndTimeRange(
    vehicleId: string,
    startTime: Date,
    endTime: Date,
    pageSize: number = 500,
    cursor: string | null = null,
  ): Promise<SeekPaginatedResult<LeanTemperature>> {
    const query: any = {
      vehicle_id: vehicleId,
      timestamp: { $gte: startTime, $lte: endTime },
    };

    if (cursor) {
      query.timestamp.$gt = new Date(cursor);
    }

    const limit = pageSize + 1;

    const raw = await this.temperatureModel
      .find(query)
      .sort({ timestamp: 1 })
      .limit(limit)
      .select({
        _id: 1,
        vehicle_id: 1,
        sensors: 1,
        average_temp: 1,
        min_temp: 1,
        max_temp: 1,
        humidity: 1,
        is_alarm: 1,
        alarm_level: 1,
        timestamp: 1,
      })
      .hint({ vehicle_id: 1, timestamp: 1 })
      .lean()
      .exec() as unknown as LeanTemperature[];

    const hasNext = raw.length > pageSize;
    const data = hasNext ? raw.slice(0, pageSize) : raw;
    const lastItem = data.length > 0 ? data[data.length - 1] : null;

    return {
      data,
      has_next: hasNext,
      next_cursor: hasNext && lastItem ? lastItem.timestamp.toISOString() : null,
      page_size: pageSize,
    };
  }

  async findLatestByVehicle(vehicleId: string): Promise<LeanTemperature | null> {
    return this.temperatureModel
      .findOne({ vehicle_id: vehicleId })
      .sort({ timestamp: -1 })
      .select({
        _id: 1,
        vehicle_id: 1,
        sensors: 1,
        average_temp: 1,
        min_temp: 1,
        max_temp: 1,
        humidity: 1,
        is_alarm: 1,
        alarm_level: 1,
        timestamp: 1,
      })
      .hint({ vehicle_id: 1, timestamp: -1 })
      .lean()
      .exec() as unknown as LeanTemperature | null;
  }

  async findAlarms(
    vehicleId?: string,
    startTime?: Date,
    endTime?: Date,
    page: number = 1,
    pageSize: number = 100,
  ): Promise<LeanTemperature[]> {
    const query: any = { is_alarm: true };
    if (vehicleId) query.vehicle_id = vehicleId;
    if (startTime || endTime) {
      query.timestamp = {};
      if (startTime) query.timestamp.$gte = startTime;
      if (endTime) query.timestamp.$lte = endTime;
    }
    const skip = (page - 1) * pageSize;
    return this.temperatureModel
      .find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(pageSize)
      .select('-__v -created_at')
      .hint(vehicleId ? { vehicle_id: 1, is_alarm: 1, timestamp: -1 } : { is_alarm: 1, timestamp: -1 })
      .lean()
      .exec() as unknown as LeanTemperature[];
  }

  async aggregateStats(
    vehicleId: string,
    startTime: Date,
    endTime: Date,
  ): Promise<TemperatureStats> {
    // 使用聚合框架一次性完成所有统计：
    // $match 命中复合索引，只扫描必要区间
    // $group 完成所有 avg/max/min/sum/count，数据库层 O(n)
    // 最后 Node 层不用再遍历数据
    const pipeline: any[] = [
      {
        $match: {
          vehicle_id: vehicleId,
          timestamp: { $gte: startTime, $lte: endTime },
        },
      },
      {
        $group: {
          _id: null,
          samples: { $sum: 1 },
          overall_avg: { $avg: '$average_temp' },
          overall_min: { $min: '$min_temp' },
          overall_max: { $max: '$max_temp' },
          avg_humidity: { $avg: '$humidity' },
          total_alarms: {
            $sum: { $cond: [{ $eq: ['$is_alarm', true] }, 1, 0] },
          },
          critical_alarms: {
            $sum: { $cond: [{ $eq: ['$alarm_level', 'critical'] }, 1, 0] },
          },
          warning_alarms: {
            $sum: { $cond: [{ $eq: ['$alarm_level', 'warning'] }, 1, 0] },
          },
        },
      },
    ];

    const result = await this.temperatureModel
      .aggregate(pipeline)
      .hint({ vehicle_id: 1, timestamp: 1 })
      .exec();

    if (!result || result.length === 0) {
      return {
        samples: 0,
        overall_avg: 0,
        overall_min: 0,
        overall_max: 0,
        avg_humidity: 0,
        total_alarms: 0,
        critical_alarms: 0,
        warning_alarms: 0,
      };
    }

    const r = result[0];
    return {
      samples: r.samples || 0,
      overall_avg: Number((r.overall_avg || 0).toFixed(2)),
      overall_min: r.overall_min ?? 0,
      overall_max: r.overall_max ?? 0,
      avg_humidity: Number((r.avg_humidity || 0).toFixed(2)),
      total_alarms: r.total_alarms || 0,
      critical_alarms: r.critical_alarms || 0,
      warning_alarms: r.warning_alarms || 0,
    };
  }
}
