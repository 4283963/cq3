import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsOptional,
  IsInt,
  Min,
  Max,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

@ValidatorConstraint({ name: 'timeRangeLimit', async: false })
class TimeRangeLimitConstraint implements ValidatorConstraintInterface {
  validate(_: any, args: ValidationArguments) {
    const obj = args.object as any;
    if (!obj.start_time || !obj.end_time) return true;
    const start = new Date(obj.start_time).getTime();
    const end = new Date(obj.end_time).getTime();
    const MAX_RANGE_MS = 7 * 24 * 60 * 60 * 1000; // 最大7天
    return end - start <= MAX_RANGE_MS;
  }

  defaultMessage() {
    return '查询时间范围不能超过7天，过大范围请分段查询';
  }
}

export class HistoryQueryDto {
  @ApiProperty({ description: '车辆ID', example: 'VEH-001' })
  @IsString()
  @IsNotEmpty()
  vehicle_id: string;

  @ApiProperty({ description: '开始时间', example: '2024-01-15T00:00:00.000Z' })
  @IsDateString()
  start_time: string;

  @ApiProperty({ description: '结束时间', example: '2024-01-15T23:59:59.999Z' })
  @IsDateString()
  @Validate(TimeRangeLimitConstraint)
  end_time: string;

  @ApiPropertyOptional({
    description:
      '游标（Seek分页用，来自上次响应的 next_cursor；不传则从 startTime 开始）',
    example: null,
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    description: '每页条数，默认500，最大2000',
    default: 500,
    example: 500,
  })
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(2000)
  page_size?: number = 500;
}
