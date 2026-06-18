import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Location, LocationSchema } from './schemas/location.schema';
import { Temperature, TemperatureSchema } from './schemas/temperature.schema';
import { LocationRepository } from './repositories/location.repository';
import { TemperatureRepository } from './repositories/temperature.repository';
import { LocationService } from './services/location.service';
import { TemperatureService } from './services/temperature.service';
import { TelemetryService } from './services/telemetry.service';
import { TelemetryController } from './controllers/telemetry.controller';
import { HistoryController } from './controllers/history.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Location.name, schema: LocationSchema },
      { name: Temperature.name, schema: TemperatureSchema },
    ]),
  ],
  controllers: [TelemetryController, HistoryController],
  providers: [
    LocationRepository,
    TemperatureRepository,
    LocationService,
    TemperatureService,
    TelemetryService,
  ],
  exports: [TelemetryService, LocationService, TemperatureService],
})
export class TelemetryModule {}
