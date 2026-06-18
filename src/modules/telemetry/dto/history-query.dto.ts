import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsOptional,
  IsInt,
  Min,
  Max,
} from 'class-validator';

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
  end_time: string;

  @ApiPropertyOptional({ description: '页码', default: 1, example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: '每页数量', default: 1000, example: 1000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  page_size?: number = 1000;
}
