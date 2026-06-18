import { Injectable, Logger } from '@nestjs/common';
import { TemperatureRepository, LeanTemperature } from '../repositories/temperature.repository';
import { LocationRepository, LeanLocation } from '../repositories/location.repository';
import { LruCacheService, buildKey } from './lru-cache.service';
import {
  RiskAnalysisQueryDto,
  RiskAnalysisResult,
  RiskEvent,
  RiskType,
  SensorRisk,
} from '../dto/risk-analysis.dto';

interface SensorSample {
  timestamp: Date;
  average_temp: number;
  min_temp: number;
  max_temp: number;
  humidity?: number;
  sensors: Array<{ sensor_id: string; zone: string; temperature: number }>;
}

@Injectable()
export class RiskAnalysisService {
  private readonly logger = new Logger(RiskAnalysisService.name);

  constructor(
    private readonly tempRepo: TemperatureRepository,
    private readonly locationRepo: LocationRepository,
    private readonly cache: LruCacheService,
  ) {}

  async analyze(
    query: RiskAnalysisQueryDto,
  ): Promise<RiskAnalysisResult[]> {
    const cacheKey = this.buildCacheKey(query);
    const cached = this.cache.get<RiskAnalysisResult[]>(cacheKey);
    if (cached) return cached;

    const {
      vehicle_id,
      start_time,
      end_time,
      temp_upper_c = 8,
      temp_lower_c = -25,
      consecutive_count = 3,
      window_minutes = 30,
      fluctuation_c = 8,
      risk_type,
      limit = 50,
    } = query;

    const start = new Date(start_time);
    const end = new Date(end_time);

    const vehicleIds = vehicle_id
      ? [vehicle_id]
      : await this.fetchVehicleIds(start, end);
    const results: RiskAnalysisResult[] = [];

    for (const vid of vehicleIds) {
      const result = await this.analyzeVehicle(
        vid,
        start,
        end,
        temp_lower_c,
        temp_upper_c,
        consecutive_count,
        window_minutes,
        fluctuation_c,
        risk_type,
        limit,
      );
      if (result) results.push(result);
    }

    this.cache.set(cacheKey, results, 60000);
    return results;
  }

  private buildCacheKey(q: RiskAnalysisQueryDto): string {
    return buildKey(
      'risk',
      q.vehicle_id || '*',
      q.start_time,
      q.end_time,
      q.temp_lower_c,
      q.temp_upper_c,
      q.consecutive_count,
      q.window_minutes,
      q.fluctuation_c,
      q.risk_type || '',
      q.limit,
    );
  }

  private async fetchVehicleIds(
    start: Date,
    end: Date,
  ): Promise<string[]> {
    const pipeline: any[] = [
      { $match: { timestamp: { $gte: start, $lte: end } } },
      { $group: { _id: '$vehicle_id' } },
      { $limit: 100 },
    ];
    const rows = await (this.tempRepo as any).temperatureModel
      .aggregate(pipeline)
      .exec();
    return rows.map((r: any) => r._id);
  }

  private async analyzeVehicle(
    vehicleId: string,
    start: Date,
    end: Date,
    tempLowerC: number,
    tempUpperC: number,
    consecutiveCount: number,
    windowMinutes: number,
    fluctuationC: number,
    riskType: RiskType | undefined,
    limit: number,
  ): Promise<RiskAnalysisResult | null> {
    const pageSize = 5000;
    let cursor: string | null = null;
    const allSamples: SensorSample[] = [];

    while (true) {
      const page = await this.tempRepo.findByVehicleAndTimeRange(
        vehicleId,
        start,
        end,
        pageSize,
        cursor,
      );
      for (const t of page.data) {
        allSamples.push({
          timestamp: t.timestamp,
          average_temp: t.average_temp ?? 0,
          min_temp: t.min_temp ?? 0,
          max_temp: t.max_temp ?? 0,
          humidity: t.humidity,
          sensors: t.sensors,
        });
      }
      if (!page.has_next || !page.next_cursor) break;
      cursor = page.next_cursor;
    }

    if (allSamples.length === 0) return null;

    const events: RiskEvent[] = [];

    if (!riskType || riskType === 'continuous_over_threshold') {
      const overEvents = this.detectContinuousOverThreshold(
        allSamples,
        vehicleId,
        tempLowerC,
        tempUpperC,
        consecutiveCount,
        windowMinutes,
      );
      events.push(...overEvents);
    }

    if (!riskType || riskType === 'abnormal_fluctuation') {
      const fluctEvents = this.detectAbnormalFluctuation(
        allSamples,
        vehicleId,
        fluctuationC,
        tempLowerC,
        tempUpperC,
      );
      events.push(...fluctEvents);
    }

    events.sort((a, b) => a.start_time.getTime() - b.start_time.getTime());

    const finalEvents = events.slice(0, limit);
    await this.enrichWithLocations(vehicleId, finalEvents);

    return {
      vehicle_id: vehicleId,
      time_range: { start: start.toISOString(), end: end.toISOString() },
      summary: {
        total_events: events.length,
        critical_count: events.filter((e) => e.risk_level === 'critical').length,
        warning_count: events.filter((e) => e.risk_level === 'warning').length,
        over_threshold_count: events.filter(
          (e) => e.risk_type === 'continuous_over_threshold',
        ).length,
        fluctuation_count: events.filter(
          (e) => e.risk_type === 'abnormal_fluctuation',
        ).length,
        analyzed_samples: allSamples.length,
      },
      events: finalEvents,
      thresholds: {
        temperature_lower_c: tempLowerC,
        temperature_upper_c: tempUpperC,
        max_fluctuation_c: fluctuationC,
        consecutive_count: consecutiveCount,
        window_minutes: windowMinutes,
      },
    };
  }

  private detectContinuousOverThreshold(
    samples: SensorSample[],
    vehicleId: string,
    tempLowerC: number,
    tempUpperC: number,
    consecutiveCount: number,
    windowMinutes: number,
  ): RiskEvent[] {
    const events: RiskEvent[] = [];
    const windowMs = windowMinutes * 60 * 1000;
    const isOver = (s: SensorSample) =>
      s.average_temp < tempLowerC || s.average_temp > tempUpperC;

    let i = 0;
    while (i < samples.length) {
      if (!isOver(samples[i])) {
        i++;
        continue;
      }
      let j = i;
      while (
        j < samples.length &&
        isOver(samples[j]) &&
        samples[j].timestamp.getTime() - samples[i].timestamp.getTime() <=
          windowMs
      ) {
        j++;
      }
      const streak = j - i;
      if (streak >= consecutiveCount) {
        const eventSamples = samples.slice(i, j);
        events.push(
          this.buildOverThresholdEvent(
            vehicleId,
            eventSamples,
            tempLowerC,
            tempUpperC,
          ),
        );
        i = j;
      } else {
        i++;
      }
    }

    return this.mergeCloseEvents(events, 'continuous_over_threshold');
  }

  private buildOverThresholdEvent(
    vehicleId: string,
    samples: SensorSample[],
    tempLowerC: number,
    tempUpperC: number,
  ): RiskEvent {
    const temps = samples.map((s) => s.average_temp);
    const avgTemp = temps.reduce((a, b) => a + b, 0) / temps.length;
    const peakTemp = Math.max(...samples.map((s) => s.max_temp ?? 0));
    const sensorMap = new Map<string, { zone: string; peak: number; count: number }>();

    for (const s of samples) {
      for (const sensor of s.sensors) {
        const existing = sensorMap.get(sensor.sensor_id) || {
          zone: sensor.zone,
          peak: -Infinity,
          count: 0,
        };
        existing.peak = Math.max(existing.peak, sensor.temperature);
        existing.count++;
        sensorMap.set(sensor.sensor_id, existing);
      }
    }

    const sensors: SensorRisk[] = Array.from(sensorMap.entries()).map(
      ([id, info]) => ({
        sensor_id: id,
        zone: info.zone,
        peak_temperature: info.peak,
        samples_count: info.count,
      }),
    );

    const start = samples[0].timestamp;
    const end = samples[samples.length - 1].timestamp;
    const duration = Math.max(
      Math.round((end.getTime() - start.getTime()) / 60000),
      1,
    );

    const isCritical = samples.some(
      (s) => s.average_temp > tempUpperC + 3 || s.average_temp < tempLowerC - 3,
    );

    const exceedType =
      avgTemp > tempUpperC ? '高于上限' : '低于下限';

    return {
      id: `${vehicleId}-over-${start.getTime()}`,
      vehicle_id: vehicleId,
      risk_type: 'continuous_over_threshold',
      risk_level: isCritical ? 'critical' : 'warning',
      start_time: start,
      end_time: end,
      duration_minutes: duration,
      avg_temperature: Number(avgTemp.toFixed(2)),
      peak_temperature: peakTemp,
      sensors,
      description: `${samples.length}次温度连续${exceedType}，持续约${duration}分钟。平均温度${avgTemp.toFixed(
        2,
      )}°C，峰值${peakTemp}°C`,
      threshold: { lower_c: tempLowerC, upper_c: tempUpperC },
    };
  }

  private detectAbnormalFluctuation(
    samples: SensorSample[],
    vehicleId: string,
    fluctuationC: number,
    tempLowerC: number,
    tempUpperC: number,
  ): RiskEvent[] {
    const events: RiskEvent[] = [];
    const windowMs = 15 * 60 * 1000;

    let i = 0;
    while (i < samples.length) {
      let maxDiff = 0;
      let peakIdx = i;
      for (let j = i + 1; j < samples.length; j++) {
        const span = samples[j].timestamp.getTime() - samples[i].timestamp.getTime();
        if (span > windowMs) break;
        const diff = Math.abs(samples[j].average_temp - samples[i].average_temp);
        if (diff > maxDiff) {
          maxDiff = diff;
          peakIdx = j;
        }
      }
      if (maxDiff >= fluctuationC) {
        const windowSamples = samples.slice(i, peakIdx + 1);
        events.push(
          this.buildFluctuationEvent(
            vehicleId,
            windowSamples,
            maxDiff,
            tempLowerC,
            tempUpperC,
            fluctuationC,
          ),
        );
        i = peakIdx + 1;
      } else {
        i++;
      }
    }

    return this.mergeCloseEvents(events, 'abnormal_fluctuation');
  }

  private buildFluctuationEvent(
    vehicleId: string,
    samples: SensorSample[],
    maxDiff: number,
    tempLowerC: number,
    tempUpperC: number,
    fluctuationThreshold: number,
  ): RiskEvent {
    const temps = samples.map((s) => s.average_temp);
    const peakTemp = Math.max(...temps);
    const minTemp = Math.min(...temps);
    const avgTemp = temps.reduce((a, b) => a + b, 0) / temps.length;

    const sensorMap = new Map<string, { zone: string; peak: number; count: number }>();
    for (const s of samples) {
      for (const sensor of s.sensors) {
        const existing = sensorMap.get(sensor.sensor_id) || {
          zone: sensor.zone,
          peak: -Infinity,
          count: 0,
        };
        existing.peak = Math.max(existing.peak, sensor.temperature);
        existing.count++;
        sensorMap.set(sensor.sensor_id, existing);
      }
    }
    const sensors: SensorRisk[] = Array.from(sensorMap.entries()).map(
      ([id, info]) => ({
        sensor_id: id,
        zone: info.zone,
        peak_temperature: info.peak,
        samples_count: info.count,
      }),
    );

    const start = samples[0].timestamp;
    const end = samples[samples.length - 1].timestamp;
    const duration = Math.max(
      Math.round((end.getTime() - start.getTime()) / 60000),
      1,
    );

    const isCritical = maxDiff >= fluctuationThreshold * 1.5;

    return {
      id: `${vehicleId}-fluct-${start.getTime()}`,
      vehicle_id: vehicleId,
      risk_type: 'abnormal_fluctuation',
      risk_level: isCritical ? 'critical' : 'warning',
      start_time: start,
      end_time: end,
      duration_minutes: duration,
      avg_temperature: Number(avgTemp.toFixed(2)),
      peak_temperature: peakTemp,
      fluctuation_deg_c: Number(maxDiff.toFixed(2)),
      sensors,
      description: `温度异常波动，${duration}分钟内温差达${maxDiff.toFixed(
        2,
      )}°C (${minTemp}°C → ${peakTemp}°C)，可能存在断链或冷柜门未关风险`,
      threshold: { lower_c: tempLowerC, upper_c: tempUpperC },
    };
  }

  private mergeCloseEvents(events: RiskEvent[], _type: RiskType): RiskEvent[] {
    if (events.length < 2) return events;
    const merged: RiskEvent[] = [];
    let prev = events[0];
    for (let i = 1; i < events.length; i++) {
      const cur = events[i];
      const gap = cur.start_time.getTime() - prev.end_time.getTime();
      if (gap < 10 * 60 * 1000) {
        prev = {
          ...prev,
          end_time: cur.end_time,
          duration_minutes: Math.max(
            Math.round((cur.end_time.getTime() - prev.start_time.getTime()) / 60000),
            1,
          ),
          peak_temperature: Math.max(prev.peak_temperature, cur.peak_temperature),
          description: `${prev.description}；${cur.description}`,
          sensors: this.mergeSensors(prev.sensors, cur.sensors),
        };
      } else {
        merged.push(prev);
        prev = cur;
      }
    }
    merged.push(prev);
    return merged;
  }

  private mergeSensors(a: SensorRisk[], b: SensorRisk[]): SensorRisk[] {
    const map = new Map<string, SensorRisk>();
    for (const s of [...a, ...b]) {
      const existing = map.get(s.sensor_id) || {
        ...s,
        peak_temperature: -Infinity,
        samples_count: 0,
      };
      existing.peak_temperature = Math.max(
        existing.peak_temperature,
        s.peak_temperature,
      );
      existing.samples_count += s.samples_count;
      map.set(s.sensor_id, existing);
    }
    return Array.from(map.values());
  }

  private async enrichWithLocations(
    vehicleId: string,
    events: RiskEvent[],
  ): Promise<void> {
    for (const ev of events) {
      const [startLoc, endLoc] = await Promise.all([
        this.findNearestLocation(vehicleId, ev.start_time),
        this.findNearestLocation(vehicleId, ev.end_time),
      ]);
      if (startLoc) {
        ev.start_location = {
          latitude: startLoc.latitude,
          longitude: startLoc.longitude,
          altitude: startLoc.altitude,
          speed: startLoc.speed,
        };
      }
      if (endLoc) {
        ev.end_location = {
          latitude: endLoc.latitude,
          longitude: endLoc.longitude,
          altitude: endLoc.altitude,
          speed: endLoc.speed,
        };
      }
    }
  }

  private async findNearestLocation(
    vehicleId: string,
    targetTime: Date,
  ): Promise<LeanLocation | null> {
    const before = await this.locationRepo.findByVehicleAndTimeRange(
      vehicleId,
      new Date(targetTime.getTime() - 5 * 60 * 1000),
      targetTime,
      1,
      null,
    );
    if (before && before.data.length > 0) {
      return before.data[before.data.length - 1];
    }
    const after = await this.locationRepo.findByVehicleAndTimeRange(
      vehicleId,
      targetTime,
      new Date(targetTime.getTime() + 5 * 60 * 1000),
      1,
      null,
    );
    return after.data[0] || null;
  }
}
