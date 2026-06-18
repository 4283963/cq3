import { Injectable, Logger } from '@nestjs/common';
import {
  TemperatureRepository,
  LeanTemperature,
  SeekPaginatedResult,
  TemperatureStats,
} from '../repositories/temperature.repository';
import { TemperatureItemDto } from '../dto/telemetry.dto';
import { LruCacheService, buildKey } from './lru-cache.service';

@Injectable()
export class TemperatureService {
  private readonly logger = new Logger(TemperatureService.name);

  constructor(
    private readonly temperatureRepository: TemperatureRepository,
    private readonly cache: LruCacheService,
  ) {}

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
      for (const doc of batch) {
        this.cache.del(buildKey('temp_latest', doc.vehicle_id));
      }
    }

    this.logger.log(`成功处理 ${totalInserted} 条温度数据`);
    return totalInserted;
  }

  async getHistory(
    vehicleId: string,
    startTime: string,
    endTime: string,
    pageSize: number = 500,
    cursor: string | null = null,
  ): Promise<SeekPaginatedResult<LeanTemperature>> {
    const cacheKey = buildKey(
      'temp_hist',
      vehicleId,
      startTime,
      endTime,
      pageSize,
      cursor || '',
    );
    const cached = this.cache.get<SeekPaginatedResult<LeanTemperature>>(cacheKey);
    if (cached) return cached;

    const start = new Date(startTime);
    const end = new Date(endTime);
    const result = await this.temperatureRepository.findByVehicleAndTimeRange(
      vehicleId,
      start,
      end,
      pageSize,
      cursor,
    );
    this.cache.set(cacheKey, result, 5000);
    return result;
  }

  async getLatest(vehicleId: string): Promise<LeanTemperature | null> {
    const cacheKey = buildKey('temp_latest', vehicleId);
    const cached = this.cache.get<LeanTemperature | null>(cacheKey);
    if (cached !== undefined && cached !== null) return cached;

    const result = await this.temperatureRepository.findLatestByVehicle(vehicleId);
    if (result) {
      this.cache.set(cacheKey, result, 3000);
    }
    return result;
  }

  async getStats(
    vehicleId: string,
    startTime: string,
    endTime: string,
  ): Promise<TemperatureStats> {
    const cacheKey = buildKey('temp_stats', vehicleId, startTime, endTime);
    const cached = this.cache.get<TemperatureStats>(cacheKey);
    if (cached) return cached;

    const start = new Date(startTime);
    const end = new Date(endTime);
    const stats = await this.temperatureRepository.aggregateStats(
      vehicleId,
      start,
      end,
    );
    this.cache.set(cacheKey, stats, 15000);
    return stats;
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
