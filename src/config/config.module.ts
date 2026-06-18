import { Module } from '@nestjs/common';

@Module({
  providers: [
    {
      provide: 'CONFIG',
      useValue: {
        mongodb: {
          uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/cold-chain',
        },
        port: parseInt(process.env.PORT || '3000', 10),
      },
    },
  ],
  exports: ['CONFIG'],
})
export class ConfigModule {
  constructor() {
    console.log('📋 配置模块已加载');
  }
}
