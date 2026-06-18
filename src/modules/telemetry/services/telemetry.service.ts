import { Injectable, Logger } from '@nestjs/common';
import { LocationService } from './location.service';
import { TemperatureService } from './temperature.service';
import { LruCacheService, buildKey } from './lru-cache.service';
import { BulkTelemetryDto } from '../dto/telemetry.dto';

export interface VehicleHistoryResponse {
  vehicle_id: string;
  time_range: { start: string; end: string };
  query_perf: {
    db_query_ms: number;
    from_cache: boolean;
  };
  current_status: {
    latest_location: any;
    latest_temperature: any;
  };
  track: {
    points: any[];
    page_size: number;
    has_next: boolean;
    next_cursor: string | null;
  };
  temperature_curve: {
    points: any[];
    page_size: number;
    has_next: boolean;
    next_cursor: string | null;
  };
  statistics: {
    temperature: {
      samples: number;
      overall_avg: number;
      overall_min: number;
      overall_max: number;
      avg_humidity: number;
    };
    travel: {
      samples: number;
      avg_speed: number;
      max_speed: number;
      bounding_box: {
        min_latitude: number;
        max_latitude: number;
        min_longitude: number;
        max_longitude: number;
      };
    };
    alarms: {
      total: number;
      critical: number;
      warning: number;
    };
  } | null;
}

@Injectable()
export class TelemetryService {
  private readonly logger = new Logger(TelemetryService.name);

  constructor(
    private readonly locationService: LocationService,
    private readonly temperatureService: TemperatureService,
    private readonly cache: LruCacheService,
  ) {}

  async bulkIngest(dto: BulkTelemetryDto) {
    this.logger.log(`接收批量数据: ${dto.records.length} 条记录`);

    const locationRecords = dto.records
      .filter((r) => r.location)
      .map((r) => r.location!);

    const temperatureRecords = dto.records
      .filter((r) => r.temperature)
      .map((r) => r.temperature!);

    const [locationCount, temperatureCount] = await Promise.all([
      this.locationService.bulkProcess(locationRecords),
      this.temperatureService.bulkProcess(temperatureRecords),
    ]);

    return {
      success: true,
      total: dto.records.length,
      location_inserted: locationCount,
      temperature_inserted: temperatureCount,
    };
  }

  async getVehicleHistory(
    vehicleId: string,
    startTime: string,
    endTime: string,
    pageSize: number = 500,
    cursor: string | null = null,
  ): Promise<VehicleHistoryResponse> {
    const t0 = Date.now();

    // 整体结果缓存（针对同一车辆/时间范围/分页的重复查询直接命中）
    const fullKey = buildKey(
      'full_history',
      vehicleId,
      startTime,
      endTime,
      pageSize,
      cursor || '',
    );
    const cached = this.cache.get<VehicleHistoryResponse>(fullKey);
    if (cached) {
      cached.query_perf.from_cache = true;
      return cached;
    }

    // ===== 并发 6 个查询并行执行（全部走索引+聚合，毫秒级
    // 1. 位置轨迹（Seek 游标分页）
    // 2. 温度曲线（Seek 游标分页）
    // 3. 最新位置
    // 4. 最新温度
    // 5. 位置统计（MongoDB 聚合框架直接返回
    // 6. 温度统计（MongoDB 聚合框架直接返回
    const [
      locationResult,
      temperatureResult,
      latestLocation,
      latestTemperature,
      locStats,
      tempStats,
    ] = await Promise.all([
      this.locationService.getHistory(vehicleId, startTime, endTime, pageSize, cursor),
      this.temperatureService.getHistory(
        vehicleId,
        startTime,
        endTime,
        pageSize,
        cursor,
      ),
      this.locationService.getLatest(vehicleId),
      this.temperatureService.getLatest(vehicleId),
      this.locationService.getStats(vehicleId, startTime, endTime),
      this.temperatureService.getStats(vehicleId, startTime, endTime),
    ]);

    // 轨迹点（直接投影从查询返回结构
    const trackPoints = locationResult.data.map((loc) => ({
      latitude: loc.latitude,
      longitude: loc.longitude,
      timestamp: loc.timestamp,
      speed: loc.speed,
      altitude: loc.altitude,
      heading: loc.heading,
    }));

    // 温度曲线点
    const tempCurve = temperatureResult.data.map((temp) => ({
      timestamp: temp.timestamp,
      average_temp: temp.average_temp,
      min_temp: temp.min_temp,
      max_temp: temp.max_temp,
      humidity: temp.humidity,
      is_alarm: temp.is_alarm,
      alarm_level: temp.alarm_level,
      sensors: temp.sensors,
    }));

    const statistics: VehicleHistoryResponse['statistics'] = {
      temperature: {
        samples: tempStats.samples,
        overall_avg: tempStats.overall_avg,
        overall_min: tempStats.overall_min,
        overall_max: tempStats.overall_max,
        avg_humidity: tempStats.avg_humidity,
      },
      travel: {
        samples: locStats.samples,
        avg_speed: locStats.avg_speed,
        max_speed: locStats.max_speed,
        bounding_box: {
          min_latitude: locStats.min_latitude,
          max_latitude: locStats.max_latitude,
          min_longitude: locStats.min_longitude,
          max_longitude: locStats.max_longitude,
        },
      },
      alarms: {
        total: tempStats.total_alarms,
        critical: tempStats.critical_alarms,
        warning: tempStats.warning_alarms,
      },
    };

    const response: VehicleHistoryResponse = {
      vehicle_id: vehicleId,
      time_range: { start: startTime, end: endTime },
      query_perf: {
        db_query_ms: Date.now() - t0,
        from_cache: false,
      },
      current_status: {
        latest_location: latestLocation,
        latest_temperature: latestTemperature,
      },
      track: {
        points: trackPoints,
        page_size: locationResult.page_size,
        has_next: locationResult.has_next,
        next_cursor: locationResult.next_cursor,
      },
      temperature_curve: {
        points: tempCurve,
        page_size: temperatureResult.page_size,
        has_next: temperatureResult.has_next,
        next_cursor: temperatureResult.next_cursor,
      },
      statistics,
    };

    this.cache.set(fullKey, response, 8000);
    return response;
  }
}
