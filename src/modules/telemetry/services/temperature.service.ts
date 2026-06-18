import { Injectable, Logger } from '@nestjs/common';
import { TemperatureRepository } from '../repositories/temperature.repository';
import { TemperatureItemDto } from '../dto/telemetry.dto';

@Injectable()
export class TemperatureService {
  private readonly logger = new Logger(TemperatureService.name);

  constructor(private readonly temperatureRepository: TemperatureRepository) {}

  async bulkProcess(temperatures: TemperatureItemDto[]): Promise<number> {
    if (temperatures.length === 0) return 0;

    const docs = temperatures.map((dto) => {
      const temps = dto.sensors.map((s) => s.temperature);
      const avgTemp = temps.reduce((a, b) => a + b, 0) / temps.length;
      const minTemp = Math.min(...temps);
      const maxTemp = Math.max(...temps);
      const isAlarm = this.checkAlarm(minTemp, maxTemp);

      return {
        vehicle_id: dto.vehicle_id,
        sensors: dto.sensors,
        average_temp: Number(avgTemp.toFixed(2)),
        min_temp: minTemp,
        max_temp: maxTemp,
        humidity: dto.humidity,
        is_alarm: isAlarm.isAlarm,
        alarm_level: isAlarm.level,
        timestamp: new Date(dto.timestamp),
      };
    });

    const batchSize = 500;
    let totalInserted = 0;

    for (let i = 0; i < docs.length; i += batchSize) {
      const batch = docs.slice(i, i + batchSize);
      const result = await this.temperatureRepository.bulkInsert(batch);
      totalInserted += result.insertedCount;
    }

    this.logger.log(`成功处理 ${totalInserted} 条温度数据`);
    return totalInserted;
  }

  async getHistory(
    vehicleId: string,
    startTime: string,
    endTime: string,
    page: number = 1,
    pageSize: number = 1000,
  ) {
    const start = new Date(startTime);
    const end = new Date(endTime);

    const [data, total] = await Promise.all([
      this.temperatureRepository.findByVehicleAndTimeRange(
        vehicleId,
        start,
        end,
        page,
        pageSize,
      ),
      this.temperatureRepository.countByVehicleAndTimeRange(vehicleId, start, end),
    ]);

    return {
      data,
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: Math.ceil(total / pageSize),
      },
    };
  }

  async getLatest(vehicleId: string) {
    return this.temperatureRepository.findLatestByVehicle(vehicleId);
  }

  async getAlarms(
    vehicleId?: string,
    startTime?: string,
    endTime?: string,
    page: number = 1,
    pageSize: number = 100,
  ) {
    return this.temperatureRepository.findAlarms(
      vehicleId,
      startTime ? new Date(startTime) : undefined,
      endTime ? new Date(endTime) : undefined,
      page,
      pageSize,
    );
  }

  private checkAlarm(minTemp: number, maxTemp: number) {
    const LOWER_LIMIT = -25;
    const UPPER_LIMIT = 8;
    const CRITICAL_DEVIATION = 5;

    const outOfRange = minTemp < LOWER_LIMIT || maxTemp > UPPER_LIMIT;
    const criticalDeviation = maxTemp - minTemp > CRITICAL_DEVIATION;

    if (criticalDeviation) {
      return { isAlarm: true, level: 'critical' };
    }
    if (outOfRange) {
      return { isAlarm: true, level: 'warning' };
    }
    return { isAlarm: false, level: null };
  }
}
