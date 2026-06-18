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
import { RiskAnalysisService } from '../services/risk-analysis.service';
import { RiskAnalysisQueryDto } from '../dto/risk-analysis.dto';

@ApiTags('Risk 断链风险分析')
@Controller('risk')
export class RiskController {
  private readonly logger = new Logger(RiskController.name);

  constructor(private readonly riskService: RiskAnalysisService) {}

  @Get('analysis')
  @ApiOperation({
    summary: '冷链断链风险分析（连续超标+温度异常波动）',
    description:
      '按时间范围分析车辆历史温度数据，识别两类断链风险事件：\n' +
      '1. continuous_over_threshold - 连续超标：指定时间窗口内连续N次温度超阈值（默认30分钟内连续3次，默认阈值-25°C~8°C）\n' +
      '2. abnormal_fluctuation - 异常波动：15分钟内温度快速波动超过阈值（默认8°C，可能冷柜门未关或制冷异常）\n\n' +
      '每个风险事件返回：风险类型、严重级别、起止时间、持续时长、平均/峰值温度、各传感器明细、风险发生时的车辆GPS位置等。',
  })
  @ApiQuery({
    name: 'vehicle_id',
    required: false,
    description: '车辆ID（不传则分析该时间段内所有车辆，最多100辆）',
    example: 'VEH-001',
  })
  @ApiQuery({
    name: 'start_time',
    description: '开始时间 ISO8601',
    example: '2024-01-15T00:00:00.000Z',
  })
  @ApiQuery({
    name: 'end_time',
    description: '结束时间 ISO8601（与start_time间隔不超过30天）',
    example: '2024-01-15T23:59:59.999Z',
  })
  @ApiQuery({
    name: 'temp_upper_c',
    required: false,
    description: '温度上限(°C)，默认8°C',
    example: 8,
  })
  @ApiQuery({
    name: 'temp_lower_c',
    required: false,
    description: '温度下限(°C)，默认-25°C',
    example: -25,
  })
  @ApiQuery({
    name: 'consecutive_count',
    required: false,
    description: '连续超标次数阈值，默认3次',
    example: 3,
  })
  @ApiQuery({
    name: 'window_minutes',
    required: false,
    description: '连续超标检测窗口(分钟)，默认30分钟',
    example: 30,
  })
  @ApiQuery({
    name: 'fluctuation_c',
    required: false,
    description: '异常波动温差阈值(°C)，默认8°C',
    example: 8,
  })
  @ApiQuery({
    name: 'risk_type',
    required: false,
    description:
      '筛选风险类型：continuous_over_threshold（连续超标）/ abnormal_fluctuation（异常波动），留空返回全部',
    example: null,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: '单辆车返回最大风险事件数，默认50',
    example: 50,
  })
  @ApiResponse({
    status: 200,
    description:
      '分析完成。summary中给出事件总数/分级统计，events为详细风险列表。',
  })
  async analyze(@Query() query: RiskAnalysisQueryDto) {
    return this.riskService.analyze(query);
  }
}
