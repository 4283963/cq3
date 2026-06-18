import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { TelemetryService } from '../services/telemetry.service';
import { BulkTelemetryDto } from '../dto/telemetry.dto';

@ApiTags('Telemetry 遥测数据')
@Controller('telemetry')
export class TelemetryController {
  private readonly logger = new Logger(TelemetryController.name);

  constructor(private readonly telemetryService: TelemetryService) {}

  @Post('bulk')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: '批量接收车辆传感器数据',
    description:
      '车辆设备批量上报GPS位置和车厢温度数据，支持在一次请求中混合包含位置和/或温度数据。针对大数据量场景采用批量写入优化。',
  })
  @ApiBody({ type: BulkTelemetryDto })
  @ApiResponse({
    status: 201,
    description: '数据接收成功',
    schema: {
      example: {
        success: true,
        total: 100,
        location_inserted: 100,
        temperature_inserted: 100,
      },
    },
  })
  @ApiResponse({ status: 400, description: '请求参数校验失败' })
  async bulkIngest(@Body() dto: BulkTelemetryDto) {
    const hasAnyData = dto.records.some(
      (r) => r.location || r.temperature,
    );
    if (!hasAnyData) {
      throw new BadRequestException(
        '至少需要包含一条有效的位置或温度数据',
      );
    }

    return this.telemetryService.bulkIngest(dto);
  }
}
