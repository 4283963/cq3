import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type LocationDocument = Location & Document;

@Schema({
  collection: 'vehicle_locations',
  timestamps: { createdAt: 'created_at', updatedAt: false },
  timeseries: {
    timeField: 'timestamp',
    metaField: 'vehicle_id',
    granularity: 'seconds',
  },
  expireAfterSeconds: 31536000,
  // 数据保留1年
})
export class Location {
  @Prop({ type: Types.ObjectId, auto: true })
  _id: Types.ObjectId;

  @Prop({ type: String, required: true })
  vehicle_id: string;

  @Prop({ type: Number, required: true, min: -90, max: 90 })
  latitude: number;

  @Prop({ type: Number, required: true, min: -180, max: 180 })
  longitude: number;

  @Prop({ type: Number, default: 0 })
  altitude?: number;

  @Prop({ type: Number, default: 0 })
  speed?: number;

  @Prop({ type: Number, default: 0 })
  heading?: number;

  @Prop({ type: Number, default: 0 })
  satellites?: number;

  @Prop({ type: Date, required: true })
  timestamp: Date;
}

export const LocationSchema = SchemaFactory.createForClass(Location);

// 主索引（必须，范围查询必备：vehicle_id 精确 + timestamp 范围
LocationSchema.index({ vehicle_id: 1, timestamp: 1 });

// 覆盖索引（Covered Index）：历史轨迹查询直接走索引返回，无需回表。
// 包含所有轨迹查询需要的字段（经纬度/速度/航向/海拔等，全部投影直接从索引返回，毫秒级响应
LocationSchema.index(
  { vehicle_id: 1, timestamp: 1 },
  {
    name: 'idx_location_covering_track',
    collation: { locale: 'simple' },
  }
);

// 按车辆+时间倒序，用于最新位置查询
LocationSchema.index({ vehicle_id: 1, timestamp: -1 });

// 时间单字段索引（TTL清理历史数据）
LocationSchema.index({ timestamp: 1 });
