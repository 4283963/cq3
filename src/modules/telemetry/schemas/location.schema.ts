import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type LocationDocument = Location & Document;

@Schema({
  collection: 'vehicle_locations',
  timestamps: { createdAt: 'created_at', updatedAt: false },
})
export class Location {
  @Prop({ type: Types.ObjectId, auto: true })
  _id: Types.ObjectId;

  @Prop({ type: String, required: true, index: true })
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

  @Prop({ type: Date, required: true, index: true })
  timestamp: Date;
}

export const LocationSchema = SchemaFactory.createForClass(Location);

LocationSchema.index({ vehicle_id: 1, timestamp: -1 });
LocationSchema.index({ timestamp: 1 });
