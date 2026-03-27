import Redis from 'ioredis';

export type RedisCacheOptions = {
  url: string;
  prefix?: string;
};

export class RedisCache {
  private client: Redis;
  private prefix: string;

  constructor(options: RedisCacheOptions) {
    this.client = new Redis(options.url, { lazyConnect: true, maxRetriesPerRequest: 1 });
    this.prefix = options.prefix || 'rtsearch';
  }

  async connect(): Promise<void> {
    // 检查客户端状态，使用类型断言访问私有属性
    if ((this.client as any).status !== 'ready') {
      await this.client.connect();
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const k = this.k(key);
    const s = await this.client.get(k);
    if (!s) return null;
    try {
      return JSON.parse(s) as T;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const k = this.k(key);
    const s = JSON.stringify(value);
    if (ttlSeconds && ttlSeconds > 0) {
      await this.client.set(k, s, 'EX', ttlSeconds);
    } else {
      await this.client.set(k, s);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(this.k(key));
  }

  async quit(): Promise<void> {
    try { await this.client.quit(); } catch { /* ignore Redis quit errors */ }
  }

  private k(key: string): string {
    return `${this.prefix}:${key}`;
  }
}


