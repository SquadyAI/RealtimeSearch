import { RedisCache } from './RedisCache';

export interface BlacklistedToken {
  token: string;
  userId: string;
  username: string;
  reason: 'logout' | 'revoked' | 'expired' | 'security';
  blacklistedAt: Date;
  expiresAt?: Date;
}

export class TokenBlacklist {
  private redis: RedisCache;
  private readonly prefix = 'blacklist';
  private readonly defaultTtl = 7 * 24 * 60 * 60; // 7天，与JWT过期时间保持一致

  constructor(redis: RedisCache) {
    this.redis = redis;
  }

  /**
   * 将token加入黑名单
   */
  async blacklistToken(
    token: string, 
    userId: string, 
    username: string, 
    reason: BlacklistedToken['reason'] = 'logout',
    customTtl?: number
  ): Promise<void> {
    const blacklistedToken: BlacklistedToken = {
      token: this.hashToken(token), // 存储token的哈希值，不存储明文
      userId,
      username,
      reason,
      blacklistedAt: new Date(),
      expiresAt: customTtl ? new Date(Date.now() + customTtl * 1000) : undefined
    };

    const ttl = customTtl || this.defaultTtl;
    const key = `${this.prefix}:${blacklistedToken.token}`;
    
    await this.redis.set(key, blacklistedToken, ttl);
    
    // 同时维护用户的黑名单token列表
    const userKey = `${this.prefix}:user:${userId}`;
    const userTokens = await this.redis.get<string[]>(userKey) || [];
    userTokens.push(blacklistedToken.token);
    await this.redis.set(userKey, userTokens, ttl);
  }

  /**
   * 检查token是否在黑名单中
   */
  async isBlacklisted(token: string): Promise<boolean> {
    const hashedToken = this.hashToken(token);
    const key = `${this.prefix}:${hashedToken}`;
    
    const blacklistedToken = await this.redis.get<BlacklistedToken>(key);
    return blacklistedToken !== null;
  }

  /**
   * 从黑名单中移除token（用于紧急恢复）
   */
  async removeFromBlacklist(token: string): Promise<boolean> {
    const hashedToken = this.hashToken(token);
    const key = `${this.prefix}:${hashedToken}`;
    
    const blacklistedToken = await this.redis.get<BlacklistedToken>(key);
    if (!blacklistedToken) {
      return false;
    }

    // 删除主记录
    await this.redis.del(key);
    
    // 从用户列表中移除
    const userKey = `${this.prefix}:user:${blacklistedToken.userId}`;
    const userTokens = await this.redis.get<string[]>(userKey) || [];
    const filteredTokens = userTokens.filter(t => t !== hashedToken);
    
    if (filteredTokens.length === 0) {
      await this.redis.del(userKey);
    } else {
      await this.redis.set(userKey, filteredTokens, this.defaultTtl);
    }
    
    return true;
  }

  /**
   * 获取用户的所有黑名单token
   */
  async getUserBlacklistedTokens(userId: string): Promise<BlacklistedToken[]> {
    const userKey = `${this.prefix}:user:${userId}`;
    const hashedTokens = await this.redis.get<string[]>(userKey) || [];
    
    const tokens: BlacklistedToken[] = [];
    for (const hashedToken of hashedTokens) {
      const key = `${this.prefix}:${hashedToken}`;
      const token = await this.redis.get<BlacklistedToken>(key);
      if (token) {
        tokens.push(token);
      }
    }
    
    return tokens;
  }

  /**
   * 清理过期的黑名单记录
   */
  async cleanupExpired(): Promise<number> {
    // Redis会自动清理过期的key，这里主要用于统计
    // 如果需要手动清理，可以遍历所有黑名单key并检查过期时间
    return 0;
  }

  /**
   * 获取黑名单统计信息
   */
  async getStats(): Promise<{
    totalBlacklisted: number;
    recentBlacklisted: number;
    byReason: Record<string, number>;
  }> {
    // 这里可以实现统计逻辑，但需要Redis支持
    // 暂时返回基础信息
    return {
      totalBlacklisted: 0,
      recentBlacklisted: 0,
      byReason: {}
    };
  }

  /**
   * 哈希token以安全存储（不存储明文JWT）
   */
  private hashToken(token: string): string {
    // 使用简单的哈希算法，生产环境建议使用更安全的哈希
    let hash = 0;
    for (let i = 0; i < token.length; i++) {
      const char = token.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为32位整数
    }
    return `t_${Math.abs(hash).toString(36)}`;
  }
}
