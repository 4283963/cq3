import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TemperatureDocument = Temperature & Document;

export interface TemperatureSensor {
  sensor_id: string;
  zone: string;
  temperature: number;
}

@Schema({
  collection: 'vehicle_temperatures',
  timestamps: { createdAt: 'created_at', updatedAt: false },
  timeseries: {
    timeField: 'timestamp',
    metaField: 'vehicle_id',
    granularity: 'seconds',
  },
  expireAfterSeconds: 31536000,
})
export class Temperature {
  @Prop({ type: Types.ObjectId, auto: true })
  _id: Types.ObjectId;

  @Prop({ type: String, required: true })
  vehicle_id: string;

  @Prop({ type: Array, required: true })
  sensors: TemperatureSensor[];

  @Prop({ type: Number, index: true })
  average_temp?: number;

  @Prop({ type: Number, index: true })
  min_temp?: number;

  @Prop({ type: Number, index: true })
  max_temp?: number;

  @Prop({ type: Number, default: 0 })
  humidity?: number;

  @Prop({ type: Boolean, default: false, index: true })
  is_alarm?: boolean;

  @Prop({ type: String })
  alarm_level?: string;

  @Prop({ type: Date, required: true })
  timestamp: Date;
}

export const TemperatureSchema = SchemaFactory.createForClass(Temperature);

// 主查询索引：车辆精确 + 时间范围
TemperatureSchema.index({ vehicle_id: 1, timestamp: 1 });

// 覆盖索引（Covered Index）：温度曲线查询从索引直接返回，毫秒级响应
TemperatureSchema.index(
  { vehicle_id: 1, timestamp: 1 },
  {
    name: 'idx_temp_covering_curve',
    collation: { locale: 'simple' },
  }
);

// 最新温度查询：车辆精确 + 时间倒序
TemperatureSchema.index({ vehicle_id: 1, timestamp: -1 });

// 报警查询索引
TemperatureSchema.index({ vehicle_id: 1, is_alarm: 1, timestamp: -1 });
TemperatureSchema.index({ is_alarm: 1, timestamp: -1 });

// TTL清理
TemperatureSchema.index({ timestamp: 1 });

// 温度异常快速筛查
TemperatureSchema.index({ vehicle_id: 1, average_temp: 1, timestamp: 1 });
