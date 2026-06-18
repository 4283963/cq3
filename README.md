# 特种药品冷链运输后端API系统

## 项目概述

基于 NestJS + MongoDB 构建的冷链运输车辆遥测数据监控系统，支持：
- 货运车辆定时批量上报 GPS 位置和车厢温度数据
- 查询指定车辆历史行驶轨迹和温度变化曲线
- 温度异常自动报警检测

## 技术栈

- **框架**: NestJS 10.x
- **数据库**: MongoDB (Mongoose 8.x)
- **验证**: class-validator + class-transformer
- **文档**: Swagger (@nestjs/swagger)

## 目录结构

```
src/
├── main.ts                      # 应用入口
├── app.module.ts                # 根模块
├── config/
│   ├── config.module.ts         # 配置模块
│   └── database.module.ts       # MongoDB连接模块
└── modules/
    └── telemetry/               # 遥测数据业务模块
        ├── telemetry.module.ts  # 模块装配
        ├── schemas/             # 持久层 - Mongoose Schema
        │   ├── location.schema.ts       # 位置数据模型 (独立集合)
        │   └── temperature.schema.ts    # 温度数据模型 (独立集合)
        ├── repositories/        # 持久层 - Repository
        │   ├── location.repository.ts
        │   └── temperature.repository.ts
        ├── services/            # 服务层 - 业务逻辑
        │   ├── location.service.ts
        │   ├── temperature.service.ts
        │   └── telemetry.service.ts     # 聚合服务
        ├── controllers/         # 控制器层 - HTTP接口
        │   ├── telemetry.controller.ts  # 批量上报接口
        │   └── history.controller.ts    # 历史查询接口
        └── dto/                 # 数据传输对象
            ├── telemetry.dto.ts         # 上报数据DTO
            └── history-query.dto.ts     # 查询参数DTO
```

## 核心设计

### 1. 数据分离存储
- **位置数据**: 存放在 `vehicle_locations` 集合，索引：`{vehicle_id, timestamp}`
- **温度数据**: 存放在 `vehicle_temperatures` 集合，索引：`{vehicle_id, timestamp}` + 报警索引

### 2. 层次清晰
- **Controllers**: 只处理 HTTP 请求和响应
- **Services**: 业务逻辑处理（数据转换、报警检测、统计计算）
- **Repositories**: 数据访问层（CRUD、批量操作、查询）
- **Schemas**: Mongoose 数据模型定义

### 3. 大数据优化
- 批量接口使用 `bulkWrite` + 分批处理（每批500条）
- `ordered: false` 无序写入提升性能
- 查询使用 `.lean()` 返回纯对象减少开销
- 复合索引优化时间范围查询

## API接口

### 1. 批量上报传感器数据
```
POST /api/telemetry/bulk
Content-Type: application/json

{
  "records": [
    {
      "location": {
        "vehicle_id": "VEH-001",
        "latitude": 39.9042,
        "longitude": 116.4074,
        "speed": 65,
        "timestamp": "2024-01-15T10:30:00.000Z"
      },
      "temperature": {
        "vehicle_id": "VEH-001",
        "sensors": [
          { "sensor_id": "TEMP-001", "zone": "冷藏厢-主仓", "temperature": -18.5 }
        ],
        "timestamp": "2024-01-15T10:30:00.000Z"
      }
    }
  ]
}
```

### 2. 查询车辆历史轨迹与温度曲线
```
GET /api/history/vehicle?vehicle_id=VEH-001&start_time=2024-01-15T00:00:00.000Z&end_time=2024-01-15T23:59:59.999Z
```

返回包含：
- `track.points`: GPS轨迹点序列
- `temperature_curve.points`: 温度变化曲线
- `statistics`: 温度/速度/报警统计
- `current_status`: 最新位置和温度

### 3. API文档
启动后访问: `http://localhost:3000/api/docs`

## 快速启动

```bash
# 安装依赖
npm install

# 启动MongoDB (本地)
# 或配置 MONGODB_URI 环境变量

# 开发模式启动
npm run start:dev

# 生产构建
npm run build
npm run start:prod
```

## 配置

通过环境变量配置（参考 .env.example）：
- `MONGODB_URI`: MongoDB连接串，默认 `mongodb://localhost:27017/cold-chain`
- `PORT`: 服务端口，默认 3000
