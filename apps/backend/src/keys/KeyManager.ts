import { KeyConfig, KeyPool } from '../types';
import { ApiKeyService } from './ApiKeyService';
import { PrismaClient } from '@prisma/client';
import { config } from '../config';

export interface ApiKeyWithConfig {
  id: string;
  key: string;
  label?: string;
  rps: number;
  monthlyQuota: number;
  httpProxy?: string;
  active: boolean;
  usageMonth?: string;
  usedCount: number;
  lastUsedAt?: Date;
}

export class KeyManager {
  private engineToApiKey: Map<string, ApiKeyWithConfig | null> = new Map();
  private keyHealth: Map<string, { failures: number; cooldownUntilMs: number | null }> = new Map();
  private keyToBucket: Map<string, { capacity: number; tokens: number; lastRefill: number }> = new Map();
  private apiKeyService?: ApiKeyService;

  // TLB配置更新回调函数
  private tlbConfigUpdateCallback?: (engineName: string) => void;

  private baseCooldownMs = 10_000; // 10s
  private maxCooldownMs = 5 * 60_000; // 5m

  constructor(private prisma?: PrismaClient) {
    if (prisma) {
      this.apiKeyService = new ApiKeyService(prisma);
    }
  }

  /**
   * 设置TLB配置更新回调函数
   * 当API key的RPS值发生变化时，会调用此回调函数通知引擎管理器更新TLB配置
   */
  setTLBConfigUpdateCallback(callback: (engineName: string) => void): void {
    this.tlbConfigUpdateCallback = callback;
  }

  /**
   * 初始化从数据库和环境变量加载 ApiKeys
   */
  async initialize(): Promise<void> {
    // 首先从环境变量/配置文件加载API key到数据库
    await this.initializeFromConfigToDatabase();

    // 然后从数据库加载
    if (this.apiKeyService) {
      await this.initializeFromDatabase();
    }
  }

  /**
   * 从配置文件/环境变量初始化API key到数据库
   */
  private async initializeFromConfigToDatabase(): Promise<void> {
    if (!this.apiKeyService) return;

    try {
      // 从配置中获取keyPools
      if (config.keyPools && config.keyPools.length > 0) {
        for (const keyPool of config.keyPools) {
          if (keyPool.keys && keyPool.keys.length > 0) {
            // 检查key是否有效（不是占位符）
            const validKeys = keyPool.keys.filter(key => {
              if (typeof key === 'string') {
                return key && !key.includes('your') && key.trim() !== '';
              } else {
                // KeyConfig对象，检查key字段
                return key.key && !key.key.includes('your') && key.key.trim() !== '';
              }
            });

            if (validKeys.length > 0) {
              // 使用第一个有效key
              const firstValidKey = validKeys[0];
              const defaultKey = typeof firstValidKey === 'string' ? firstValidKey : firstValidKey.key;

              try {
                // 尝试设置到数据库
                await this.apiKeyService!.setEngineApiKey(keyPool.engine, {
                  key: defaultKey,
                  label: `Auto-generated from environment variables`,
                  rps: 10,
                  monthlyQuota: 10000
                });
                console.log(`✅ Auto-created API key for engine ${keyPool.engine} in database`);
              } catch (error) {
                // 如果已经存在，忽略错误
                console.log(`ℹ️  API key for engine ${keyPool.engine} already exists in database`);
              }
            } else {
              console.log(`⚠️  Engine ${keyPool.engine} has no valid API keys, will be disabled`);
            }
          } else {
            console.log(`⚠️  Engine ${keyPool.engine} has no API keys configured, will be disabled`);
          }
        }
      }

      // 为测试引擎自动创建虚拟API key
      await this.initializeTestEngines();

    } catch (error) {
      console.error('Failed to initialize KeyManager from config to database:', error);
    }
  }

  /**
   * 为测试引擎初始化虚拟API key
   */
  private async initializeTestEngines(): Promise<void> {
    if (!this.apiKeyService) return;

    const testEngines = [
      'test-success',
      'test-fail1',
      'test-fail2'
    ];

    for (const engineName of testEngines) {
      try {
        // 检查是否已经存在
        const existingApiKey = await this.apiKeyService.getEngineApiKey(engineName);
        if (!existingApiKey) {
          // 创建虚拟的API key记录
          await this.apiKeyService.setEngineApiKey(engineName, {
            key: `test-key-${engineName}`,
            label: `Test engine - no real API key required`,
            rps: 100, // 测试引擎可以高频率使用
            monthlyQuota: 100000 // 测试引擎可以大量使用
          });
          console.log(`✅ Created test API key for engine ${engineName}`);
        } else {
          console.log(`ℹ️  Test API key for engine ${engineName} already exists`);
        }
      } catch (error) {
        console.log(`ℹ️  Test API key for engine ${engineName} already exists or failed to create`);
      }
    }
  }

  /**
   * 从配置文件/环境变量初始化API key（已废弃，保留兼容性）
   */
  private async initializeFromConfig(): Promise<void> {
    console.warn('initializeFromConfig is deprecated, use initializeFromConfigToDatabase instead');
    await this.initializeFromConfigToDatabase();
  }

  /**
   * 从数据库初始化API key
   */
  private async initializeFromDatabase(): Promise<void> {
    try {
      const engineApiKeys = await this.apiKeyService!.getAllEngineApiKeys();

      for (const { engine, apiKey } of engineApiKeys) {
        if (apiKey) {
          this.engineToApiKey.set(engine.name, {
            id: apiKey.id,
            key: apiKey.key,
            rps: apiKey.rps,
            monthlyQuota: apiKey.monthlyQuota,
            httpProxy: apiKey.httpProxy || undefined,
            active: apiKey.active,
            usageMonth: apiKey.usageMonth || undefined,
            usedCount: apiKey.usedCount,
            lastUsedAt: apiKey.lastUsedAt || undefined
          });
        } else {
          // 如果数据库中没有API key，但配置中有，保留配置中的
          if (!this.engineToApiKey.has(engine.name)) {
            this.engineToApiKey.set(engine.name, null);
          }
        }
      }
    } catch (error) {
      console.error('Failed to initialize KeyManager from database:', error);
    }
  }

  private usagePersister?: (engine: string, key: string, monthKey: string, delta: number, quota?: number) => void | Promise<void>;

  private nowMs(): number { return Date.now(); }
  private monthKeyOf(d: Date): string {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  private healthKey(engine: string, key: string): string { return `${engine}::${key}`; }

  private refillBucket(apiKey: ApiKeyWithConfig) {
    if (!apiKey.rps || apiKey.rps <= 0) return;
    const cap = apiKey.rps;
    const now = this.nowMs();
    const b = this.keyToBucket.get(apiKey.key) || { capacity: cap, tokens: cap, lastRefill: now };
    const elapsed = Math.max(0, now - b.lastRefill);
    const refill = (elapsed / 1000) * cap;
    b.tokens = Math.min(b.capacity, b.tokens + refill);
    b.lastRefill = now;
    this.keyToBucket.set(apiKey.key, b);
  }

  private async hasCapacity(apiKey: ApiKeyWithConfig, engine: string): Promise<boolean> {
    // Check if key is active
    if (!apiKey.active) return false;

    // Respect cooldown
    const h = this.keyHealth.get(this.healthKey(engine, apiKey.key));
    const now = this.nowMs();
    if (h && h.cooldownUntilMs && h.cooldownUntilMs > now) return false;

    // RPS check
    if (apiKey.rps && apiKey.rps > 0) {
      this.refillBucket(apiKey);
      const b = this.keyToBucket.get(apiKey.key)!;
      if (b.tokens < 1) return false;
    }

    // Monthly quota check
    if (apiKey.monthlyQuota && apiKey.monthlyQuota > 0) {
      const currentMonth = this.monthKeyOf(new Date());

      // Check if we need to reset monthly usage
      if (apiKey.usageMonth !== currentMonth) {
        if (this.apiKeyService) {
          await this.apiKeyService.resetApiKeyMonthlyUsage(apiKey.id);
        }
        apiKey.usageMonth = currentMonth;
        apiKey.usedCount = 0;
        // Update local cache
        this.engineToApiKey.set(engine, apiKey);
      }

      if (apiKey.usedCount >= apiKey.monthlyQuota) return false;
    }

    return true;
  }

  private async consume(apiKey: ApiKeyWithConfig, engine: string) {
    // RPS consumption
    if (apiKey.rps && apiKey.rps > 0) {
      const b = this.keyToBucket.get(apiKey.key)!;
      b.tokens = Math.max(0, b.tokens - 1);
      this.keyToBucket.set(apiKey.key, b);
    }

    // Monthly quota consumption
    if (apiKey.monthlyQuota && apiKey.monthlyQuota > 0) {
      const currentMonth = this.monthKeyOf(new Date());

      if (apiKey.usageMonth !== currentMonth) {
        apiKey.usageMonth = currentMonth;
        apiKey.usedCount = 0;
      }

      apiKey.usedCount += 1;
      // Update local cache
      this.engineToApiKey.set(engine, apiKey);

      // Update database
      if (this.apiKeyService) {
        await this.apiKeyService.updateApiKeyUsage(apiKey.id, 1);
      }

      this.usagePersister?.(engine, apiKey.key, currentMonth, 1, apiKey.monthlyQuota);
    }
  }

  async getNextKey(engine: string): Promise<{ key: string; proxy?: string; apiKeyId?: string } | undefined> {
    const apiKey = this.engineToApiKey.get(engine);
    if (!apiKey) return undefined;

    if (await this.hasCapacity(apiKey, engine)) {
      await this.consume(apiKey, engine);
      return {
        key: apiKey.key,
        proxy: apiKey.httpProxy,
        apiKeyId: apiKey.id
      };
    }

    return undefined;
  }

  /**
   * 设置引擎的 ApiKey（通过数据库）
   */
  async setEngineApiKey(engine: string, data: { key: string; label?: string; rps?: number; monthlyQuota?: number; httpProxy?: string }): Promise<boolean> {
    if (!this.apiKeyService) return false;

    try {
      // 获取旧的RPS值，用于判断是否需要更新TLB配置
      const oldApiKey = this.engineToApiKey.get(engine);
      const oldRps = oldApiKey?.rps;

      const apiKey = await this.apiKeyService.setEngineApiKey(engine, data);

      // 更新本地缓存
      this.engineToApiKey.set(engine, {
        id: apiKey.id,
        key: apiKey.key,
        rps: apiKey.rps,
        monthlyQuota: apiKey.monthlyQuota,
        httpProxy: apiKey.httpProxy || undefined,
        active: apiKey.active,
        usageMonth: apiKey.usageMonth || undefined,
        usedCount: apiKey.usedCount,
        lastUsedAt: apiKey.lastUsedAt || undefined
      });

      // 如果RPS值发生变化，通知TLB配置更新
      if (oldRps !== apiKey.rps && this.tlbConfigUpdateCallback) {
        console.log(`KeyManager: RPS changed for engine ${engine} from ${oldRps} to ${apiKey.rps}, updating TLB config`);
        this.tlbConfigUpdateCallback(engine);
      }

      return true;
    } catch (error) {
      console.error('Failed to set engine API key:', error);
      return false;
    }
  }

  /**
   * 删除引擎的 ApiKey
   */
  async removeEngineApiKey(engine: string): Promise<boolean> {
    if (!this.apiKeyService) return false;

    try {
      const success = await this.apiKeyService.removeEngineApiKey(engine);
      if (success) {
        this.engineToApiKey.set(engine, null);
      }
      return success;
    } catch (error) {
      console.error('Failed to remove engine API key:', error);
      return false;
    }
  }

  /**
   * 获取引擎的 ApiKey 信息
   */
  getEngineApiKey(engine: string): ApiKeyWithConfig | null {
    return this.engineToApiKey.get(engine) || null;
  }

  /**
   * 获取所有引擎的 ApiKey 信息
   */
  getAllEngineApiKeys(): Array<{ engine: string; apiKey: ApiKeyWithConfig | null }> {
    const result: Array<{ engine: string; apiKey: ApiKeyWithConfig | null }> = [];
    for (const [engine, apiKey] of this.engineToApiKey.entries()) {
      result.push({ engine, apiKey });
    }
    return result;
  }

  // 保持向后兼容的旧方法（已弃用）
  setKeys(engine: string, keys: (string | any)[]): void {
    console.warn('setKeys method is deprecated, use setEngineApiKey instead');
  }

  addKey(engine: string, key: string | any): void {
    console.warn('addKey method is deprecated, use setEngineApiKey instead');
  }

  removeKey(engine: string, key: string): void {
    console.warn('removeKey method is deprecated, use removeEngineApiKey instead');
  }

  hydrateFromRecords(records: { engineName: string; keys: (string | any)[] }[]): void {
    console.warn('hydrateFromRecords method is deprecated, use database initialization instead');
  }

  setEngineProxy(engine: string, proxyUrl?: string) {
    console.warn('setEngineProxy method is deprecated, use setEngineApiKey with httpProxy instead');
  }

  getEngineProxy(engine: string): string | undefined {
    const apiKey = this.engineToApiKey.get(engine);
    return apiKey?.httpProxy;
  }

  markKeyFailure(engine: string, key: string): void {
    const id = this.healthKey(engine, key);
    const h = this.keyHealth.get(id) || { failures: 0, cooldownUntilMs: null };
    const failures = h.failures + 1;
    const backoff = Math.min(this.baseCooldownMs * Math.pow(2, failures - 1), this.maxCooldownMs);
    this.keyHealth.set(id, { failures, cooldownUntilMs: Date.now() + backoff });
  }

  markKeySuccess(engine: string, key: string): void {
    const id = this.healthKey(engine, key);
    this.keyHealth.set(id, { failures: 0, cooldownUntilMs: null });
  }

  /**
   * 重新加载数据库中的 ApiKeys
   */
  async reloadFromDatabase(): Promise<void> {
    if (this.apiKeyService) {
      await this.initialize();
    }
  }
}


