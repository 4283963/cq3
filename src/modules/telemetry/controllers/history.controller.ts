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
    summary: '查询指定车辆的历史轨迹和温度曲线',
    description:
      '按车辆ID和时间范围查询完整的行驶轨迹（GPS点序列）和温度变化曲线，附带当前最新状态和统计数据。支持分页。',
  })
  @ApiQuery({ name: 'vehicle_id', description: '车辆ID', example: 'VEH-001' })
  @ApiQuery({
    name: 'start_time',
    description: '开始时间 ISO8601',
    example: '2024-01-15T00:00:00.000Z',
  })
  @ApiQuery({
    name: 'end_time',
    description: '结束时间 ISO8601',
    example: '2024-01-15T23:59:59.999Z',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: '页码，默认1',
    example: 1,
  })
  @ApiQuery({
    name: 'page_size',
    required: false,
    description: '每页条数，默认1000，最大10000',
    example: 1000,
  })
  @ApiResponse({
    status: 200,
    description: '查询成功，返回轨迹、温度曲线和统计信息',
  })
  async getVehicleHistory(@Query() query: HistoryQueryDto) {
    return this.telemetryService.getVehicleHistory(
      query.vehicle_id,
      query.start_time,
      query.end_time,
      query.page,
      query.page_size,
    );
  }
}
