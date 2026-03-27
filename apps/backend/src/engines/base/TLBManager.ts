import { TokenBucket } from './TokenBucket';

export interface TLBToken {
  engineId: string;
  bucket: TokenBucket;
  createdAt: number;
}

export interface TLBConfig {
  defaultRPS?: number; // 默认RPS，如果没有配置的话
  enableHotSwap?: boolean; // 是否启用热插拔
  maxRetries?: number; // 最大重试次数
}

export class TLBManager {
  private tokenBuckets: Map<string, TokenBucket> = new Map();
  private config: Required<TLBConfig>;
  private engineRPS: Map<string, number> = new Map();

  constructor(config: TLBConfig = {}) {
    this.config = {
      defaultRPS: 1, // 默认每秒1个令牌
      enableHotSwap: true,
      maxRetries: 3,
      ...config
    };
  }

  // 注册引擎及其令牌桶配置
  registerEngine(engineId: string, maxTokens: number, refillRate?: number): void {
    const bucket = new TokenBucket({
      maxTokens,
      refillRate: refillRate || this.config.defaultRPS // 使用指定速率或默认速率
    });
    this.tokenBuckets.set(engineId, bucket);
    this.engineRPS.set(engineId, refillRate || this.config.defaultRPS);

    console.log(`🪣 TLB注册引擎: ${engineId}, 桶容量=${maxTokens}, 补充速率=${refillRate || this.config.defaultRPS}/秒`);
  }

  // 注销引擎
  unregisterEngine(engineId: string): void {
    this.tokenBuckets.delete(engineId);
    this.engineRPS.delete(engineId);
    console.log(`🗑️ TLB注销引擎: ${engineId}`);
  }

  // 更新引擎最大令牌数
  updateEngineMaxTokens(engineId: string, newMaxTokens: number): void {
    const bucket = this.tokenBuckets.get(engineId);
    if (bucket) {
      bucket.updateMaxTokens(newMaxTokens);
      console.log(`🔄 TLB更新引擎桶容量: ${engineId} -> ${newMaxTokens}`);
    }
  }

  // 更新引擎补充速率
  updateEngineRefillRate(engineId: string, newRefillRate: number): void {
    const bucket = this.tokenBuckets.get(engineId);
    if (bucket) {
      bucket.updateRefillRate(newRefillRate);
      this.engineRPS.set(engineId, newRefillRate);
      console.log(`🔄 TLB更新引擎补充速率: ${engineId} -> ${newRefillRate}/秒`);
    }
  }

  // 获取可用的令牌桶
  getAvailableTokenBuckets(excludeEngines: Set<string> = new Set()): string[] {
    const available: string[] = [];
    for (const [engineId, bucket] of this.tokenBuckets) {
      if (!excludeEngines.has(engineId) && bucket.getAvailableTokens() > 0) {
        available.push(engineId);
      }
    }
    return available;
  }

  // 智能抽取一个可用令牌（改进负载均衡）
  drawRandomToken(excludeEngines: Set<string> = new Set()): TLBToken | null {
    const available = this.getAvailableTokenBuckets(excludeEngines);
    if (available.length === 0) {
      return null;
    }

    // 改进：使用加权随机选择，令牌数量多的引擎有更高概率被选中
    const weightedEngines: Array<{ engineId: string; weight: number }> = [];

    for (const engineId of available) {
      const bucket = this.tokenBuckets.get(engineId);
      if (bucket) {
        const availableTokens = bucket.getAvailableTokens();
        // 令牌数量越多，权重越高，但设置上限避免过度倾斜
        const weight = Math.min(availableTokens, 5);
        weightedEngines.push({ engineId, weight });
      }
    }

    if (weightedEngines.length === 0) {
      return null;
    }

    // 按权重随机选择
    const totalWeight = weightedEngines.reduce((sum, engine) => sum + engine.weight, 0);
    let randomWeight = Math.random() * totalWeight;

    for (const { engineId, weight } of weightedEngines) {
      randomWeight -= weight;
      if (randomWeight <= 0) {
        const bucket = this.tokenBuckets.get(engineId)!;

        // 尝试消费令牌
        if (bucket.tryConsume()) {
          console.log(`🎯 TLB智能选择: 引擎 ${engineId} (权重: ${weight}) 被选中`);
          return {
            engineId,
            bucket,
            createdAt: Date.now()
          };
        }
        break;
      }
    }

    // 如果加权选择失败，回退到简单随机选择
    const randomIndex = Math.floor(Math.random() * available.length);
    const engineId = available[randomIndex];
    const bucket = this.tokenBuckets.get(engineId)!;

    if (bucket.tryConsume()) {
      console.log(`🎲 TLB回退选择: 引擎 ${engineId} 被随机选中`);
      return {
        engineId,
        bucket,
        createdAt: Date.now()
      };
    }

    return null;
  }

  // 为指定引擎抽取令牌
  drawTokenForEngine(engineId: string): TLBToken | null {
    const bucket = this.tokenBuckets.get(engineId);
    if (!bucket) {
      return null;
    }

    // 直接尝试消费令牌，如果成功则返回令牌对象
    if (bucket.tryConsume()) {
      return {
        engineId,
        bucket,
        createdAt: Date.now()
      };
    }

    return null;
  }

  // 故障转移：尝试从指定引擎列表中获取令牌，支持保底机制
  drawTokenWithFailover(engines: string[]): { token: TLBToken | null; usedFallback: boolean } {
    console.log(`TLB: drawTokenWithFailover called with engines: ${engines.join(', ')}`);

    // 首先尝试从指定引擎列表中获取令牌
    for (const engineId of engines) {
      console.log(`TLB: Trying engine ${engineId}`);
      const token = this.drawTokenForEngine(engineId);
      if (token) {
        console.log(`TLB: Successfully drew token for engine ${engineId}`);
        return { token, usedFallback: false };
      } else {
        console.log(`TLB: Failed to draw token for engine ${engineId}`);
      }
    }

    // 如果指定引擎都没有可用令牌，使用保底机制：随机选择
    console.log(`TLB: All specified engines failed, trying fallback`);
    const fallbackToken = this.drawRandomToken();
    if (fallbackToken) {
      console.log(`TLB: Fallback token drawn for engine ${fallbackToken.engineId}`);
    } else {
      console.log(`TLB: No fallback token available`);
    }
    return { token: fallbackToken, usedFallback: true };
  }

  // 智能故障转移：记录失败并尝试其他引擎
  drawTokenWithSmartFailover(
    engines: string[],
    failedEngines: Set<string> = new Set()
  ): { token: TLBToken | null; usedFallback: boolean } {
    console.log(`TLB: drawTokenWithSmartFailover called with engines: ${engines.join(', ')}, failed: ${Array.from(failedEngines).join(', ')}`);

    // 首先尝试从指定引擎列表中获取令牌（排除已失败的引擎）
    for (const engineId of engines) {
      if (failedEngines.has(engineId)) {
        console.log(`TLB: Skipping failed engine ${engineId}`);
        continue; // 跳过已失败的引擎
      }

      console.log(`TLB: Trying engine ${engineId}`);
      const token = this.drawTokenForEngine(engineId);
      if (token) {
        console.log(`TLB: Successfully drew token for engine ${engineId}`);
        return { token, usedFallback: false };
      } else {
        console.log(`TLB: Failed to draw token for engine ${engineId}`);
      }
    }

    // 如果指定引擎都没有可用令牌，使用保底机制：从所有可用引擎中随机选择（排除失败的引擎）
    console.log(`TLB: All specified engines failed, trying smart fallback`);
    const fallbackToken = this.drawRandomToken(failedEngines);
    if (fallbackToken) {
      console.log(`TLB: Smart fallback token drawn for engine ${fallbackToken.engineId}`);
    } else {
      console.log(`TLB: No smart fallback token available`);
    }
    return { token: fallbackToken, usedFallback: true };
  }


  // 获取引擎统计信息
  getEngineStats(): Record<string, { rps: number; availableTokens: number; maxTokens: number; refillRate: number }> {
    const stats: Record<string, { rps: number; availableTokens: number; maxTokens: number; refillRate: number }> = {};

    for (const [engineId, bucket] of this.tokenBuckets) {
      stats[engineId] = {
        rps: this.engineRPS.get(engineId) || 0,
        availableTokens: bucket.getAvailableTokens(),
        maxTokens: bucket.getMaxTokens(),
        refillRate: bucket.getRefillRate()
      };
    }

    return stats;
  }

  // 更新引擎RPS
  updateEngineRPS(engineId: string, rps: number): void {
    this.engineRPS.set(engineId, rps);
    // 同时更新令牌桶的补充速率
    this.updateEngineRefillRate(engineId, rps);
  }

  // 热插拔：动态添加引擎
  hotSwapAddEngine(engineId: string, maxTokens: number, refillRate?: number): void {
    if (this.config.enableHotSwap) {
      this.registerEngine(engineId, maxTokens, refillRate);
    }
  }

  // 热插拔：动态移除引擎
  hotSwapRemoveEngine(engineId: string): void {
    if (this.config.enableHotSwap) {
      this.unregisterEngine(engineId);
    }
  }

  // 检查引擎是否可用
  isEngineAvailable(engineId: string): boolean {
    const bucket = this.tokenBuckets.get(engineId);
    return bucket ? bucket.getAvailableTokens() > 0 : false;
  }

  // 获取所有注册的引擎
  getRegisteredEngines(): string[] {
    return Array.from(this.tokenBuckets.keys());
  }

  // 获取指定引擎的令牌桶（用于智能选择）
  getTokenBucket(engineId: string): TokenBucket | undefined {
    return this.tokenBuckets.get(engineId);
  }

  // 获取所有引擎的令牌桶状态快照（用于监控和调试）
  getTokenBucketsSnapshot(): Record<string, { availableTokens: number; maxTokens: number; refillRate: number }> {
    const snapshot: Record<string, { availableTokens: number; maxTokens: number; refillRate: number }> = {};

    for (const [engineId, bucket] of this.tokenBuckets) {
      snapshot[engineId] = {
        availableTokens: bucket.getAvailableTokens(),
        maxTokens: bucket.getMaxTokens(),
        refillRate: bucket.getRefillRate()
      };
    }

    return snapshot;
  }

  // 获取所有引擎的详细状态（用于调试）
  getAllEnginesDetailedStatus(): Record<string, any> {
    const status: Record<string, any> = {};

    for (const [engineId, bucket] of this.tokenBuckets) {
      status[engineId] = {
        ...bucket.getBucketStatus(),
        rps: this.engineRPS.get(engineId) || 0
      };
    }

    return status;
  }
}