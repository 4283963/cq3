import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Location, LocationSchema } from './schemas/location.schema';
import { Temperature, TemperatureSchema } from './schemas/temperature.schema';
import { LocationRepository } from './repositories/location.repository';
import { TemperatureRepository } from './repositories/temperature.repository';
import { LruCacheService } from './services/lru-cache.service';
import { LocationService } from './services/location.service';
import { TemperatureService } from './services/temperature.service';
import { TelemetryService } from './services/telemetry.service';
import { RiskAnalysisService } from './services/risk-analysis.service';
import { TelemetryController } from './controllers/telemetry.controller';
import { HistoryController } from './controllers/history.controller';
import { RiskController } from './controllers/risk.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Location.name, schema: LocationSchema },
      { name: Temperature.name, schema: TemperatureSchema },
    ]),
  ],
  controllers: [TelemetryController, HistoryController, RiskController],
  providers: [
    LruCacheService,
    LocationRepository,
    TemperatureRepository,
    LocationService,
    TemperatureService,
    TelemetryService,
    RiskAnalysisService,
  ],
  exports: [
    TelemetryService,
    LocationService,
    TemperatureService,
    LruCacheService,
    RiskAnalysisService,
  ],
})
export class TelemetryModule {}
