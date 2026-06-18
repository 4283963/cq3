import { Module, Inject } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      useFactory: (config: any) => {
        console.log('🔌 正在连接MongoDB:', config.mongodb.uri);
        return {
          uri: config.mongodb.uri,
          maxPoolSize: 100,
          retryAttempts: 5,
          retryDelay: 1000,
        };
      },
      inject: ['CONFIG'],
    }),
  ],
})
export class DatabaseModule {}
