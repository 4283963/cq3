import { Injectable, Logger } from '@nestjs/common';
import { LocationService } from './location.service';
import { TemperatureService } from './temperature.service';
import { BulkTelemetryDto } from '../dto/telemetry.dto';

@Injectable()
export class TelemetryService {
  private readonly logger = new Logger(TelemetryService.name);

  constructor(
    private readonly locationService: LocationService,
    private readonly temperatureService: TemperatureService,
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
    page: number = 1,
    pageSize: number = 1000,
  ) {
    const [locationResult, temperatureResult, latestLocation, latestTemperature] =
      await Promise.all([
        this.locationService.getHistory(vehicleId, startTime, endTime, page, pageSize),
        this.temperatureService.getHistory(vehicleId, startTime, endTime, page, pageSize),
        this.locationService.getLatest(vehicleId),
        this.temperatureService.getLatest(vehicleId),
      ]);

    const trackPoints = locationResult.data.map((loc) => ({
      latitude: loc.latitude,
      longitude: loc.longitude,
      timestamp: loc.timestamp,
      speed: loc.speed,
      altitude: loc.altitude,
      heading: loc.heading,
    }));

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

    const stats = this.calculateStats(
      temperatureResult.data,
      locationResult.data,
    );

    return {
      vehicle_id: vehicleId,
      time_range: { start: startTime, end: endTime },
      current_status: {
        latest_location: latestLocation,
        latest_temperature: latestTemperature,
      },
      track: {
        points: trackPoints,
        pagination: locationResult.pagination,
      },
      temperature_curve: {
        points: tempCurve,
        pagination: temperatureResult.pagination,
      },
      statistics: stats,
    };
  }

  private calculateStats(tempData: any[], locData: any[]) {
    if (tempData.length === 0) {
      return null;
    }

    const avgTemps = tempData.map((t) => t.average_temp).filter((v) => v != null);
    const speeds = locData.map((l) => l.speed).filter((v) => v != null);
    const alarmCount = tempData.filter((t) => t.is_alarm).length;
    const criticalCount = tempData.filter((t) => t.alarm_level === 'critical').length;

    return {
      temperature: {
        overall_avg: avgTemps.length
          ? Number((avgTemps.reduce((a, b) => a + b, 0) / avgTemps.length).toFixed(2))
          : 0,
        overall_min: avgTemps.length ? Math.min(...avgTemps) : 0,
        overall_max: avgTemps.length ? Math.max(...avgTemps) : 0,
        samples: tempData.length,
      },
      travel: {
        avg_speed: speeds.length
          ? Number((speeds.reduce((a, b) => a + b, 0) / speeds.length).toFixed(2))
          : 0,
        max_speed: speeds.length ? Math.max(...speeds) : 0,
        samples: locData.length,
      },
      alarms: {
        total: alarmCount,
        critical: criticalCount,
        warning: alarmCount - criticalCount,
      },
    };
  }
}
