import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsArray,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
  IsNumber,
} from 'class-validator';

@ValidatorConstraint({ name: 'riskTimeRangeLimit', async: false })
class RiskTimeRangeLimitConstraint implements ValidatorConstraintInterface {
  validate(_: any, args: ValidationArguments) {
    const obj = args.object as any;
    if (!obj.start_time || !obj.end_time) return true;
    const start = new Date(obj.start_time).getTime();
    const end = new Date(obj.end_time).getTime();
    const MAX_RANGE_MS = 30 * 24 * 60 * 60 * 1000; // 最大30天
    return end - start <= MAX_RANGE_MS;
  }

  defaultMessage() {
    return '风险分析时间范围不能超过30天';
  }
}

export type RiskType = 'continuous_over_threshold' | 'abnormal_fluctuation';
export type RiskLevel = 'warning' | 'critical';

export interface SensorRisk {
  sensor_id: string;
  zone: string;
  peak_temperature: number;
  samples_count: number;
}

export interface RiskEvent {
  id: string;
  vehicle_id: string;
  risk_type: RiskType;
  risk_level: RiskLevel;
  start_time: Date;
  end_time: Date;
  duration_minutes: number;
  avg_temperature: number;
  peak_temperature: number;
  fluctuation_deg_c?: number;
  sensors: SensorRisk[];
  start_location?: {
    latitude: number;
    longitude: number;
    altitude?: number;
    speed?: number;
  };
  end_location?: {
    latitude: number;
    longitude: number;
    altitude?: number;
    speed?: number;
  };
  description: string;
  threshold: {
    lower_c: number;
    upper_c: number;
  };
}

export interface RiskAnalysisResult {
  vehicle_id: string;
  time_range: { start: string; end: string };
  summary: {
    total_events: number;
    critical_count: number;
    warning_count: number;
    over_threshold_count: number;
    fluctuation_count: number;
    analyzed_samples: number;
  };
  events: RiskEvent[];
  thresholds: {
    temperature_lower_c: number;
    temperature_upper_c: number;
    max_fluctuation_c: number;
    consecutive_count: number;
    window_minutes: number;
  };
}

export class RiskAnalysisQueryDto {
  @ApiProperty({ description: '车辆ID（不传则分析所有车辆）', example: 'VEH-001' })
  @IsOptional()
  @IsString()
  vehicle_id?: string;

  @ApiProperty({ description: '开始时间 ISO8601', example: '2024-01-15T00:00:00.000Z' })
  @IsDateString()
  start_time: string;

  @ApiProperty({
    description: '结束时间 ISO8601（与start_time间隔不超过30天）',
    example: '2024-01-15T23:59:59.999Z',
  })
  @IsDateString()
  @Validate(RiskTimeRangeLimitConstraint)
  end_time: string;

  @ApiPropertyOptional({
    description: '温度上限(摄氏度)，默认8°C（冷链标准）',
    default: 8,
    example: 8,
  })
  @IsOptional()
  @IsNumber()
  temp_upper_c?: number = 8;

  @ApiPropertyOptional({
    description: '温度下限(摄氏度)，默认-25°C（冷链标准）',
    default: -25,
    example: -25,
  })
  @IsOptional()
  @IsNumber()
  temp_lower_c?: number = -25;

  @ApiPropertyOptional({
    description: '连续超标次数阈值，默认3次',
    default: 3,
    example: 3,
  })
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(20)
  consecutive_count?: number = 3;

  @ApiPropertyOptional({
    description: '检测连续超标的时间窗口(分钟)，默认30分钟',
    default: 30,
    example: 30,
  })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(240)
  window_minutes?: number = 30;

  @ApiPropertyOptional({
    description: '异常波动阈值(°C)，短时间内温差超过此值判定为波动异常，默认8°C',
    default: 8,
    example: 8,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(30)
  fluctuation_c?: number = 8;

  @ApiPropertyOptional({
    description: '风险类型筛选：over_threshold / fluctuation，留空返回全部',
    example: null,
  })
  @IsOptional()
  @IsString()
  risk_type?: RiskType;

  @ApiPropertyOptional({
    description: '返回最大事件数，默认50',
    default: 50,
    example: 50,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number = 50;
}
