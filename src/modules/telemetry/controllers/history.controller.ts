import {
  Controller,
  Get,
  Query,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { TelemetryService } from '../services/telemetry.service';
import { HistoryQueryDto } from '../dto/history-query.dto';

@ApiTags('History 历史查询')
@Controller('history')
export class HistoryController {
  private readonly logger = new Logger(HistoryController.name);

  constructor(private readonly telemetryService: TelemetryService) {}

  @Get('vehicle')
  @ApiOperation({
    summary: '查询指定车辆的历史轨迹和温度曲线（毫秒级响应）',
    description:
      '【优化版】按车辆ID和时间范围查询完整的行驶轨迹（GPS点序列）和温度变化曲线。\n' +
      '性能优化：Seek游标分页（无count全表扫）、MongoDB聚合框架统计、复合覆盖索引、LRU缓存、最大7天范围保护。\n' +
      '翻页方式：把本次响应的 track.next_cursor 或 temperature_curve.next_cursor 作为下次的 cursor 参数即可。',
  })
  @ApiQuery({ name: 'vehicle_id', description: '车辆ID', example: 'VEH-001' })
  @ApiQuery({
    name: 'start_time',
    description: '开始时间 ISO8601',
    example: '2024-01-15T00:00:00.000Z',
  })
  @ApiQuery({
    name: 'end_time',
    description: '结束时间 ISO8601（与start_time间隔不超过7天）',
    example: '2024-01-15T23:59:59.999Z',
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    description:
      'Seek分页游标，传上一页响应的 next_cursor（ISO时间戳）。不传则从start_time开始。',
    example: null,
  })
  @ApiQuery({
    name: 'page_size',
    required: false,
    description: '每页条数，默认500，最大2000',
    example: 500,
  })
  @ApiResponse({
    status: 200,
    description:
      '查询成功。响应字段 query_perf.db_query_ms 可查看数据库查询耗时，from_cache=true 表示本次走了LRU缓存。',
  })
  async getVehicleHistory(@Query() query: HistoryQueryDto) {
    return this.telemetryService.getVehicleHistory(
      query.vehicle_id,
      query.start_time,
      query.end_time,
      query.page_size,
      query.cursor || null,
    );
  }
}
