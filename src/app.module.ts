import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './config/database.module';
import { TelemetryModule } from './modules/telemetry/telemetry.module';

@Module({
  imports: [ConfigModule, DatabaseModule, TelemetryModule],
})
export class AppModule {}
