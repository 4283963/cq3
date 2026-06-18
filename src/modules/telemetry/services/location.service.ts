import { Injectable, Logger } from '@nestjs/common';
import { LocationRepository } from '../repositories/location.repository';
import { LocationItemDto } from '../dto/telemetry.dto';

@Injectable()
export class LocationService {
  private readonly logger = new Logger(LocationService.name);

  constructor(private readonly locationRepository: LocationRepository) {}

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
    }

    this.logger.log(`成功处理 ${totalInserted} 条位置数据`);
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
      this.locationRepository.findByVehicleAndTimeRange(
        vehicleId,
        start,
        end,
        page,
        pageSize,
      ),
      this.locationRepository.countByVehicleAndTimeRange(vehicleId, start, end),
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
    return this.locationRepository.findLatestByVehicle(vehicleId);
  }
}
