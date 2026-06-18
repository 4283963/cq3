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
})
export class Temperature {
  @Prop({ type: Types.ObjectId, auto: true })
  _id: Types.ObjectId;

  @Prop({ type: String, required: true, index: true })
  vehicle_id: string;

  @Prop({ type: Array, required: true })
  sensors: TemperatureSensor[];

  @Prop({ type: Number })
  average_temp?: number;

  @Prop({ type: Number })
  min_temp?: number;

  @Prop({ type: Number })
  max_temp?: number;

  @Prop({ type: Number, default: 0 })
  humidity?: number;

  @Prop({ type: Boolean, default: false })
  is_alarm?: boolean;

  @Prop({ type: String })
  alarm_level?: string;

  @Prop({ type: Date, required: true, index: true })
  timestamp: Date;
}

export const TemperatureSchema = SchemaFactory.createForClass(Temperature);

TemperatureSchema.index({ vehicle_id: 1, timestamp: -1 });
TemperatureSchema.index({ timestamp: 1 });
TemperatureSchema.index({ vehicle_id: 1, is_alarm: 1 });
