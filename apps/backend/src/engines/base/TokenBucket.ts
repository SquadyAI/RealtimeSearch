export interface TokenBucketConfig {
  maxTokens: number; // 桶容量（最大令牌数）
  refillRate?: number; // 令牌补充速率（每秒产生的令牌数），默认为 1
  refillIntervalMs?: number; // 补充检查间隔，默认为 100ms（更精确的补充）
}

export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly config: Required<TokenBucketConfig>;

  constructor(config: TokenBucketConfig) {
    this.config = {
      refillRate: 1, // 默认每秒产生1个令牌
      refillIntervalMs: 100, // 每100ms检查一次补充，更精确
      ...config
    };
    this.tokens = this.config.maxTokens; // 初始时桶是满的
    this.lastRefill = Date.now();
  }

  // 尝试获取一个令牌
  tryConsume(): boolean {
    // 先补充令牌
    this.refill();

    // 检查是否有可用令牌
    if (this.tokens >= 1) {
      this.tokens--;
      return true;
    }
    return false;
  }


  // 获取可用令牌数量（实时补充）
  getAvailableTokens(): number {
    this.refill();
    return this.tokens;
  }

  // 获取当前令牌数量（不进行补充）
  getCurrentTokens(): number {
    return this.tokens;
  }

  // 真正的令牌桶补充算法
  private refill(): void {
    const now = Date.now();
    const timePassed = now - this.lastRefill;

    // 如果时间间隔太小，不进行补充（避免频繁计算）
    if (timePassed < this.config.refillIntervalMs) {
      return;
    }

    // 计算应该补充的令牌数
    // 基于实际经过的时间计算补充量
    const elapsedSeconds = timePassed / 1000;
    const tokensToAdd = elapsedSeconds * this.config.refillRate;

    // 补充令牌，但不超过桶容量
    this.tokens = Math.min(this.tokens + tokensToAdd, this.config.maxTokens);

    // 更新最后补充时间
    this.lastRefill = now;

    // 调试日志（可选）
    if (tokensToAdd > 0) {
      console.log(`🪣 TokenBucket补充: +${tokensToAdd.toFixed(2)}令牌, 当前: ${this.tokens.toFixed(2)}/${this.config.maxTokens}`);
    }
  }

  // 更新最大令牌数配置
  updateMaxTokens(newMaxTokens: number): void {
    this.config.maxTokens = newMaxTokens;
    // 如果当前令牌数超过新的最大值，调整到最大值
    if (this.tokens > newMaxTokens) {
      this.tokens = newMaxTokens;
    }
  }

  // 更新补充速率
  updateRefillRate(newRefillRate: number): void {
    this.config.refillRate = newRefillRate;
  }

  // 获取当前最大令牌数配置
  getMaxTokens(): number {
    return this.config.maxTokens;
  }

  // 获取当前补充速率
  getRefillRate(): number {
    return this.config.refillRate;
  }

  // 获取桶状态信息（用于调试）
  getBucketStatus(): {
    currentTokens: number;
    maxTokens: number;
    refillRate: number;
    lastRefill: number;
    timeSinceLastRefill: number;
  } {
    const now = Date.now();
    return {
      currentTokens: this.tokens,
      maxTokens: this.config.maxTokens,
      refillRate: this.config.refillRate,
      lastRefill: this.lastRefill,
      timeSinceLastRefill: now - this.lastRefill
    };
  }
}