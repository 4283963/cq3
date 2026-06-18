import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsDateString,
  IsOptional,
  Min,
  Max,
  IsArray,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SensorDto {
  @ApiProperty({ description: '传感器ID', example: 'TEMP-001' })
  @IsString()
  @IsNotEmpty()
  sensor_id: string;

  @ApiProperty({ description: '温区名称', example: '冷藏厢-主仓' })
  @IsString()
  @IsNotEmpty()
  zone: string;

  @ApiProperty({ description: '温度(摄氏度)', example: -18.5 })
  @IsNumber()
  temperature: number;
}

export class LocationItemDto {
  @ApiProperty({ description: '车辆ID', example: 'VEH-001' })
  @IsString()
  @IsNotEmpty()
  vehicle_id: string;

  @ApiProperty({ description: '纬度', example: 39.9042 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @ApiProperty({ description: '经度', example: 116.4074 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  @ApiPropertyOptional({ description: '海拔(米)', example: 50 })
  @IsOptional()
  @IsNumber()
  altitude?: number;

  @ApiPropertyOptional({ description: '速度(km/h)', example: 65 })
  @IsOptional()
  @IsNumber()
  speed?: number;

  @ApiPropertyOptional({ description: '航向(度)', example: 180 })
  @IsOptional()
  @IsNumber()
  heading?: number;

  @ApiPropertyOptional({ description: '卫星数量', example: 12 })
  @IsOptional()
  @IsNumber()
  satellites?: number;

  @ApiProperty({ description: '上报时间戳', example: '2024-01-15T10:30:00.000Z' })
  @IsDateString()
  timestamp: string;
}

export class TemperatureItemDto {
  @ApiProperty({ description: '车辆ID', example: 'VEH-001' })
  @IsString()
  @IsNotEmpty()
  vehicle_id: string;

  @ApiProperty({ description: '传感器数组', type: [SensorDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => SensorDto)
  sensors: SensorDto[];

  @ApiPropertyOptional({ description: '湿度(%)', example: 60 })
  @IsOptional()
  @IsNumber()
  humidity?: number;

  @ApiProperty({ description: '上报时间戳', example: '2024-01-15T10:30:00.000Z' })
  @IsDateString()
  timestamp: string;
}

export class TelemetryItemDto {
  @ApiPropertyOptional({ description: '位置数据', type: LocationItemDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocationItemDto)
  location?: LocationItemDto;

  @ApiPropertyOptional({ description: '温度数据', type: TemperatureItemDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => TemperatureItemDto)
  temperature?: TemperatureItemDto;
}

export class BulkTelemetryDto {
  @ApiProperty({ description: '批量遥测数据数组', type: [TelemetryItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => TelemetryItemDto)
  records: TelemetryItemDto[];
}
