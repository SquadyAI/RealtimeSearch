// 基础类型定义 - 所有引擎通用的类型

// 引擎类型枚举
export enum EngineType {
  SEARCH = 'search',
  TRANSLATE = 'translate'
}

// 基础引擎名称类型
export type EngineName = string;

// 基础引擎接口
export interface BaseEngine<TArgs, TResult> {
  name: string;
}

// 基础引擎尝试记录类型
export interface BaseEngineAttempt {
  engine: EngineName;
  startedAt: number;
  endedAt?: number;
  ok: boolean;
  errorMessage?: string;
  skipped?: boolean;
}

// 基础结果类型
export interface BaseResult {
  provider: string;
  raw?: unknown;
  latencyMs?: number;
}

// 基础日志记录类型
export interface BaseLogRecord {
  timestamp: string;
  requestId: string;
  selectedEngines: EngineName[];
  usedEngine?: EngineName;
  latencyMs?: number;
  clientIp?: string;
  userAgent?: string;
  userId?: string;
  username?: string;
  attempts: BaseEngineAttempt[];
  error?: string;
}

// 基础请求选项类型
export interface BaseRequestOptions {
  engines?: string[];
  clientIp?: string;
  userId?: string;
  username?: string;
  requestId?: string;
  httpProxy?: string;
  routingKey?: string;
}

// 基础引擎加载器接口
export interface BaseEngineLoader<TEngine> {
  getEngine(name: string): TEngine | undefined;
  listEngineNames(): string[];
}

// 基础缓存接口
export interface CacheInterface {
  get(key: string): Promise<any>;
  set(key: string, value: any, ttlSeconds?: number): Promise<void>;
}

// TLB配置接口
export interface TLBConfig {
  defaultRPS?: number;
  enableHotSwap?: boolean;
  maxRetries?: number;
}

// 基础管理器配置
export interface BaseManagerConfig {
  requestTimeoutMs: number;
  enableRaw?: boolean;
  cache?: CacheInterface;
  cacheTtlSeconds?: number;
  engineCacheTtlSeconds?: number;
  fallbackEngineName?: string;
  hedgeEnabled?: boolean;
  hedgeDelayMs?: number;
  hedgeMaxEngines?: number;
  tlbEnabled?: boolean;
  tlbConfig?: TLBConfig;
}
