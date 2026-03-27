// Prisma 模型扩展类型定义
// 这些类型补充了 Prisma 生成的基本类型，包含动态字段

import { EngineType } from './base';

export interface ExtendedEngine {
  id: string;
  name: string;
  type: EngineType;
  enabled: boolean;
  priority: number;
  config?: any;
  httpProxy?: string; // 动态字段
  apikey?: {
    id: string;
    key: string;
    type: EngineType;
    label?: string;
    active: boolean;
    rps: number;
    monthlyQuota: number;
  } | null; // 关联的API密钥对象
}



// 引擎记录类型（用于 KeyManager）
export interface EngineRecord {
  engineName: string;
  keys: Array<{
    key: string;
    rps?: number;
    monthlyQuota?: number;
    httpProxy?: string;
  }>;
}

// Clickhouse 查询结果类型
export interface ClickhouseQueryResult {
  json(): Promise<any[]>;
}

// Clickhouse 客户端类型（只定义我们使用的方法）
export interface ClickhouseClientLike {
  query(options: {
    query: string;
    format: string;
    query_params?: Record<string, any>;
  }): Promise<ClickhouseQueryResult>;
}

// 扩展的 ClickhouseWriter 类型（用于访问私有属性）
export interface ClickhouseWriterExtended {
  client: ClickhouseClientLike;
  tableName: string;
  write(record: any): Promise<void>;
  init(): Promise<void>;
}
