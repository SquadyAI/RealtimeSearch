import { PrismaClient } from '@prisma/client';

export interface CreateApiKeyData {
  key: string;
  label?: string;
  rps?: number;
  monthlyQuota?: number;
  httpProxy?: string;
}

export interface UpdateApiKeyData {
  label?: string;
  active?: boolean;
  rps?: number;
  monthlyQuota?: number;
  httpProxy?: string;
}

export interface ApiKeyUsage {
  usageMonth: string;
  usedCount: number;
  monthlyQuota?: number;
}

export class ApiKeyService {
  constructor(private prisma: PrismaClient) { }

  /**
   * 为指定引擎创建或更新 apiKey
   * 注意：一个引擎只能持有一个 apiKey
   */
  async setEngineApiKey(engineName: string, data: CreateApiKeyData): Promise<any> {
    // 先查找是否已存在该引擎
    let engine = await this.prisma.engine.findUnique({
      where: { name: engineName },
      include: { apikey: true }
    });

    if (!engine) {
      // 创建新引擎和 apiKey
      const apiKey = await this.prisma.apiKey.create({
        data: {
          key: data.key,
          label: data.label,
          rps: data.rps || 10,
          monthlyQuota: data.monthlyQuota || 10000,
          engines: {
            create: {
              name: engineName,
              enabled: true,
              httpProxy: data.httpProxy
            }
          }
        },
        include: { engines: true }
      });
      return apiKey;
    } else if (engine.apikey) {
      // 更新现有 apiKey
      const apiKey = await this.prisma.apiKey.update({
        where: { id: engine.apikey.id },
        data: {
          key: data.key,
          label: data.label,
          rps: data.rps || 10,
          monthlyQuota: data.monthlyQuota || 10000,
        },
        include: { engines: true }
      });

      // 更新引擎的 httpProxy
      if (data.httpProxy !== undefined) {
        await this.prisma.engine.update({
          where: { id: engine.id },
          data: { httpProxy: data.httpProxy }
        });
      }
      return apiKey;
    } else {
      // 为现有引擎创建新的 apiKey
      const apiKey = await this.prisma.apiKey.create({
        data: {
          key: data.key,
          label: data.label,
          rps: data.rps || 10,
          monthlyQuota: data.monthlyQuota || 10000,
        },
        include: { engines: true }
      });

      // 关联到引擎并设置 httpProxy
      const updateData: any = {
        apikeyId: apiKey.id
      };
      if (data.httpProxy !== undefined) {
        updateData.httpProxy = data.httpProxy;
      }
      await this.prisma.engine.update({
        where: { id: engine.id },
        data: updateData
      });

      return apiKey;
    }
  }

  /**
   * 获取引擎的 apiKey 信息
   */
  async getEngineApiKey(engineName: string): Promise<any> {
    const engine = await this.prisma.engine.findUnique({
      where: { name: engineName },
      include: { apikey: true }
    });

    return engine?.apikey || null;
  }

  /**
   * 获取所有引擎的 apiKey 信息
   */
  async getAllEngineApiKeys(): Promise<Array<{ engine: any; apiKey: any }>> {
    const engines = await this.prisma.engine.findMany({
      include: { apikey: true }
    });

    return engines.map((engine: any) => ({
      engine,
      apiKey: engine.apikey
    }));
  }

  /**
   * 删除引擎的 ApiKey
   */
  async removeEngineApiKey(engineName: string): Promise<boolean> {
    const engine = await this.prisma.engine.findUnique({
      where: { name: engineName },
      include: { apikey: true }
    });

    if (!engine || !engine.apikey) {
      return false;
    }

    // 检查这个 apiKey 是否被其他引擎使用
    const apiKeyUsageCount = await this.prisma.engine.count({
      where: { apikeyId: engine.apikey.id }
    });

    if (apiKeyUsageCount === 1) {
      // 只有当前引擎在使用，删除 apiKey
      await this.prisma.apiKey.delete({
        where: { id: engine.apikey.id }
      });
    } else {
      // 其他引擎也在使用，只解除关联
      await this.prisma.engine.update({
        where: { id: engine.id },
        data: { apikeyId: undefined }
      });
    }

    return true;
  }

  /**
   * 更新 ApiKey 的使用统计
   */
  async updateApiKeyUsage(apiKeyId: string, increment: number = 1): Promise<void> {
    const now = new Date();
    const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

    await this.prisma.apiKey.update({
      where: { id: apiKeyId },
      data: {
        usedCount: { increment },
        usageMonth: monthKey,
        lastUsedAt: now
      }
    });
  }

  /**
   * 检查 ApiKey 是否可用（检查配额和活跃状态）
   */
  async isApiKeyAvailable(apiKeyId: string): Promise<boolean> {
    const apiKey = await this.prisma.apiKey.findUnique({
      where: { id: apiKeyId }
    });

    if (!apiKey || !apiKey.active) {
      return false;
    }

    const now = new Date();
    const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

    // 检查是否需要重置月度使用量
    if (apiKey.usageMonth !== currentMonth) {
      await this.prisma.apiKey.update({
        where: { id: apiKeyId },
        data: {
          usageMonth: currentMonth,
          usedCount: 0
        }
      });
      return apiKey.monthlyQuota > 0;
    }

    return apiKey.usedCount < apiKey.monthlyQuota;
  }

  /**
   * 获取 ApiKey 的使用统计
   */
  async getApiKeyUsage(apiKeyId: string): Promise<ApiKeyUsage | null> {
    const apiKey = await this.prisma.apiKey.findUnique({
      where: { id: apiKeyId },
      select: {
        usageMonth: true,
        usedCount: true,
        monthlyQuota: true
      }
    });

    if (!apiKey) return null;

    return {
      usageMonth: apiKey.usageMonth || '',
      usedCount: apiKey.usedCount,
      monthlyQuota: apiKey.monthlyQuota
    };
  }

  /**
   * 重置 apiKey 的月度使用统计
   */
  async resetApiKeyMonthlyUsage(apiKeyId: string): Promise<void> {
    await this.prisma.apiKey.update({
      where: { id: apiKeyId },
      data: {
        usedCount: 0,
        usageMonth: null
      }
    });
  }

  /**
   * 更新 apiKey 信息
   */
  async updateApiKey(apiKeyId: string, data: UpdateApiKeyData): Promise<any> {
    try {
      const apiKey = await this.prisma.apiKey.update({
        where: { id: apiKeyId },
        data,
        include: { engines: true }
      });
      return apiKey;
    } catch (error) {
      return null;
    }
  }
}
