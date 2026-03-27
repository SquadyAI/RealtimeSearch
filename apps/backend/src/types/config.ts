// 配置相关类型定义
import type { EngineName } from './base';

export type ServiceConfig = {
  port: number;
  host: string;
  defaultEngines: EngineName[];
  defaultTranslateEngines: EngineName[];
  engineDirectory: string;
  requestTimeoutMs: number;
  httpProxy?: string;
  tlbEnabled?: boolean;
  tlbDefaultRPS?: number;
  tlbEnableHotSwap?: boolean;
  tlbTokenReturnDelayMs?: number;
  tlbMaxRetries?: number;
  engineMaxTokens?: Record<string, number>;
  engineRefillRate?: Record<string, number>; // 每个引擎的令牌补充速率
  keyPools: KeyPool[];
  maxItems: number;
  enableRaw?: boolean;
  clickhouse?: {
    url: string;
    database?: string;
    username?: string;
    password?: string;
    tls?: boolean;
  };
  redis?: {
    url: string;
    ttlSeconds?: number;
    engineTtlSeconds?: number;
    prefix?: string;
  };
  fallbackEngine?: EngineName;
  fallbackTranslateEngine?: EngineName;
  serviceApiKeys?: string[];
  adminApiKeys?: string[];
  authJwtSecret: string;
  authJwtExpires?: string | number;
  authAllowSignup?: boolean;
  authRequireLogin?: boolean;
  hedgeEnabled?: boolean;
  hedgeDelayMs?: number;
  hedgeMaxEngines?: number;
  translateHedgeEnabled?: boolean;
  translateHedgeDelayMs?: number;
  translateHedgeMaxEngines?: number;
  translateRoutingGroups?: Record<string, EngineName[]>;
  searchRoutingGroups?: Record<string, EngineName[]>;
  users?: {
    admin: {
      username: string;
      password: string;
      role: 'admin';
    };
    regular: {
      username: string;
      password: string;
      role: 'user';
    };
  };
};

export interface MutableServiceConfig extends ServiceConfig {
  defaultEngines: EngineName[];
  defaultTranslateEngines: EngineName[];
  engineMaxTokens: Record<string, number>;
}

export type KeyPool = {
  engine: EngineName;
  keys: (string | KeyConfig)[];
};

export type KeyConfig = {
  key: string;
  rps?: number;
  monthlyQuota?: number;
  httpProxy?: string;
  label?: string;
};

export type PerEngineProxyMap = Record<string, string | undefined>;
