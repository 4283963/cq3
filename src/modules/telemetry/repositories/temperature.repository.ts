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
    page: number = 1,
    pageSize: number = 1000,
  ): Promise<LeanTemperature[]> {
    const skip = (page - 1) * pageSize;
    return this.temperatureModel
      .find({
        vehicle_id: vehicleId,
        timestamp: { $gte: startTime, $lte: endTime },
      })
      .sort({ timestamp: 1 })
      .skip(skip)
      .limit(pageSize)
      .select('-__v -created_at')
      .lean()
      .exec() as unknown as LeanTemperature[];
  }

  async findLatestByVehicle(vehicleId: string): Promise<LeanTemperature | null> {
    return this.temperatureModel
      .findOne({ vehicle_id: vehicleId })
      .sort({ timestamp: -1 })
      .select('-__v -created_at')
      .lean()
      .exec() as unknown as LeanTemperature | null;
  }

  async countByVehicleAndTimeRange(
    vehicleId: string,
    startTime: Date,
    endTime: Date,
  ): Promise<number> {
    return this.temperatureModel
      .countDocuments({
        vehicle_id: vehicleId,
        timestamp: { $gte: startTime, $lte: endTime },
      })
      .exec();
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
      .lean()
      .exec() as unknown as LeanTemperature[];
  }
}
