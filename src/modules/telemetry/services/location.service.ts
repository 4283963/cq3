import { Injectable, Logger } from '@nestjs/common';
import { LocationRepository, LeanLocation, SeekPaginatedResult, LocationStats } from '../repositories/location.repository';
import { LocationItemDto } from '../dto/telemetry.dto';
import { LruCacheService, buildKey } from './lru-cache.service';

@Injectable()
export class LocationService {
  private readonly logger = new Logger(LocationService.name);

  constructor(
    private readonly locationRepository: LocationRepository,
    private readonly cache: LruCacheService,
  ) {}

  async bulkProcess(locations: LocationItemDto[]): Promise<number> {
    if (locations.length === 0) return 0;

    const docs = locations.map((dto) => ({
      vehicle_id: dto.vehicle_id,
      latitude: dto.latitude,
      longitude: dto.longitude,
      altitude: dto.altitude,
      speed: dto.speed,
      heading: dto.heading,
      satellites: dto.satellites,
      timestamp: new Date(dto.timestamp),
    }));

    const batchSize = 500;
    let totalInserted = 0;

    for (let i = 0; i < docs.length; i += batchSize) {
      const batch = docs.slice(i, i + batchSize);
      const result = await this.locationRepository.bulkInsert(batch);
      totalInserted += result.insertedCount;
      // 写入后使该车辆的最新位置缓存失效
      for (const doc of batch) {
        this.cache.del(buildKey('loc_latest', doc.vehicle_id));
      }
    }

    this.logger.log(`成功处理 ${totalInserted} 条位置数据`);
    return totalInserted;
  }

  async getHistory(
    vehicleId: string,
    startTime: string,
    endTime: string,
    pageSize: number = 500,
    cursor: string | null = null,
  ): Promise<SeekPaginatedResult<LeanLocation>> {
    const cacheKey = buildKey(
      'loc_hist',
      vehicleId,
      startTime,
      endTime,
      pageSize,
      cursor || '',
    );
    const cached = this.cache.get<SeekPaginatedResult<LeanLocation>>(cacheKey);
    if (cached) return cached;

    const start = new Date(startTime);
    const end = new Date(endTime);
    const result = await this.locationRepository.findByVehicleAndTimeRange(
      vehicleId,
      start,
      end,
      pageSize,
      cursor,
    );

    this.cache.set(cacheKey, result, 5000);
    return result;
  }

  async getLatest(vehicleId: string): Promise<LeanLocation | null> {
    const cacheKey = buildKey('loc_latest', vehicleId);
    const cached = this.cache.get<LeanLocation | null>(cacheKey);
    // 注意：缓存里可能存 null（该车辆没数据），要区分 miss 和 hit(null)
    if (cached !== undefined && cached !== null) return cached;

    const result = await this.locationRepository.findLatestByVehicle(vehicleId);
    if (result) {
      this.cache.set(cacheKey, result, 3000);
    }
    return result;
  }

  async getStats(
    vehicleId: string,
    startTime: string,
    endTime: string,
  ): Promise<LocationStats> {
    const cacheKey = buildKey('loc_stats', vehicleId, startTime, endTime);
    const cached = this.cache.get<LocationStats>(cacheKey);
    if (cached) return cached;

    const start = new Date(startTime);
    const end = new Date(endTime);
    const stats = await this.locationRepository.aggregateStats(
      vehicleId,
      start,
      end,
    );
    this.cache.set(cacheKey, stats, 15000);
    return stats;
  }
}
