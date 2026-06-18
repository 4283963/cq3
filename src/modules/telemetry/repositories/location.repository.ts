import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Location, LocationDocument } from '../schemas/location.schema';

export interface LeanLocation {
  _id: any;
  vehicle_id: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  speed?: number;
  heading?: number;
  satellites?: number;
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

export interface LocationStats {
  samples: number;
  avg_speed: number;
  max_speed: number;
  min_latitude: number;
  max_latitude: number;
  min_longitude: number;
  max_longitude: number;
}

@Injectable()
export class LocationRepository {
  private readonly logger = new Logger(LocationRepository.name);

  constructor(
    @InjectModel(Location.name)
    private readonly locationModel: Model<LocationDocument>,
  ) {}

  async bulkInsert(locations: Partial<Location>[]): Promise<BulkWriteSummary> {
    this.logger.debug(`批量插入 ${locations.length} 条位置数据`);
    const operations = locations.map((loc) => ({
      insertOne: { document: loc },
    }));
    const result = await this.locationModel.bulkWrite(operations as any, {
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

  async insertOne(location: Partial<Location>): Promise<LocationDocument> {
    const created = new this.locationModel(location);
    return created.save();
  }

  async findByVehicleAndTimeRange(
    vehicleId: string,
    startTime: Date,
    endTime: Date,
    pageSize: number = 500,
    cursor: string | null = null,
  ): Promise<SeekPaginatedResult<LeanLocation>> {
    // Seek 游标分页（无 count 全表扫描、无 skip 深分页）
    // 利用复合索引 {vehicle_id:1, timestamp:1} 直接定位起始点，O(logN)
    const query: any = {
      vehicle_id: vehicleId,
      timestamp: { $gte: startTime, $lte: endTime },
    };

    if (cursor) {
      query.timestamp.$gt = new Date(cursor);
    }

    // 多取1条来判断 has_next，避免 countDocuments 全表扫描
    const limit = pageSize + 1;

    const raw = await this.locationModel
      .find(query)
      .sort({ timestamp: 1 })
      .limit(limit)
      // 明确投影：只取查询需要的字段，强制走覆盖索引
      .select({
        _id: 1,
        vehicle_id: 1,
        latitude: 1,
        longitude: 1,
        altitude: 1,
        speed: 1,
        heading: 1,
        satellites: 1,
        timestamp: 1,
      })
      // hint 强制命中复合索引，避免优化器误判
      .hint({ vehicle_id: 1, timestamp: 1 })
      .lean()
      .exec() as unknown as LeanLocation[];

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

  async findLatestByVehicle(vehicleId: string): Promise<LeanLocation | null> {
    return this.locationModel
      .findOne({ vehicle_id: vehicleId })
      .sort({ timestamp: -1 })
      .select({
        _id: 1,
        vehicle_id: 1,
        latitude: 1,
        longitude: 1,
        altitude: 1,
        speed: 1,
        heading: 1,
        satellites: 1,
        timestamp: 1,
      })
      .hint({ vehicle_id: 1, timestamp: -1 })
      .lean()
      .exec() as unknown as LeanLocation | null;
  }

  async aggregateStats(
    vehicleId: string,
    startTime: Date,
    endTime: Date,
  ): Promise<LocationStats> {
    // MongoDB 聚合框架直接在数据库层计算，无需把数据拉到 Node
    // 单次聚合 O(匹配索引扫描) → O(1) 返回统计结果
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
          avg_speed: { $avg: '$speed' },
          max_speed: { $max: '$speed' },
          min_latitude: { $min: '$latitude' },
          max_latitude: { $max: '$latitude' },
          min_longitude: { $min: '$longitude' },
          max_longitude: { $max: '$longitude' },
        },
      },
    ];

    const result = await this.locationModel
      .aggregate(pipeline)
      .hint({ vehicle_id: 1, timestamp: 1 })
      .exec();

    if (!result || result.length === 0) {
      return {
        samples: 0,
        avg_speed: 0,
        max_speed: 0,
        min_latitude: 0,
        max_latitude: 0,
        min_longitude: 0,
        max_longitude: 0,
      };
    }

    const r = result[0];
    return {
      samples: r.samples || 0,
      avg_speed: Number((r.avg_speed || 0).toFixed(2)),
      max_speed: r.max_speed || 0,
      min_latitude: r.min_latitude || 0,
      max_latitude: r.max_latitude || 0,
      min_longitude: r.min_longitude || 0,
      max_longitude: r.max_longitude || 0,
    };
  }
}
