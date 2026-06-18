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
    page: number = 1,
    pageSize: number = 1000,
  ): Promise<LeanLocation[]> {
    const skip = (page - 1) * pageSize;
    return this.locationModel
      .find({
        vehicle_id: vehicleId,
        timestamp: { $gte: startTime, $lte: endTime },
      })
      .sort({ timestamp: 1 })
      .skip(skip)
      .limit(pageSize)
      .select('-__v -created_at')
      .lean()
      .exec() as unknown as LeanLocation[];
  }

  async findLatestByVehicle(vehicleId: string): Promise<LeanLocation | null> {
    return this.locationModel
      .findOne({ vehicle_id: vehicleId })
      .sort({ timestamp: -1 })
      .select('-__v -created_at')
      .lean()
      .exec() as unknown as LeanLocation | null;
  }

  async countByVehicleAndTimeRange(
    vehicleId: string,
    startTime: Date,
    endTime: Date,
  ): Promise<number> {
    return this.locationModel
      .countDocuments({
        vehicle_id: vehicleId,
        timestamp: { $gte: startTime, $lte: endTime },
      })
      .exec();
  }
}
