import { ExtendedFastifyInstance } from '../../types/extensions';
import { PrismaClient } from '@prisma/client';

export async function registerApiKeyRoutes(app: ExtendedFastifyInstance, deps: {
  prisma?: PrismaClient;
}) {
  const { prisma } = deps;

  // 设置API密钥（每个引擎只有一个key）
  app.post('/v1/admin/keys/set', async (req: any) => {
    const {
      engine,
      key,
      label,
      rps,
      monthlyQuota,
      httpProxy
    } = req.body as {
      engine?: string;
      key?: string;
      label?: string;
      rps?: number;
      monthlyQuota?: number;
      httpProxy?: string;
    };

    if (!engine || !key) return { error: 'engine和key都是必需的' };

    try {
      if (app.keyManager) {
        const success = await app.keyManager.setEngineApiKey(engine, {
          key,
          label,
          rps: rps || 10,
          monthlyQuota: monthlyQuota || 10000,
          httpProxy
        });

        if (!success) {
          return { error: '设置API密钥失败' };
        }
      }

      return { ok: true };
    } catch (error) {
      console.error('设置API密钥失败:', error);
      return { error: '设置API密钥失败' };
    }
  });

  // 列出API密钥
  app.get('/v1/admin/keys/list', async (req: any) => {
    if (!app.keyManager) return { error: 'KeyManager not configured' };

    try {
      const engineName = String((req.query?.engine || '')).trim();
      const allKeys = app.keyManager.getAllEngineApiKeys();

      const filtered = engineName
        ? allKeys.filter(item => item.engine === engineName)
        : allKeys;

      return {
        engines: filtered.map(({ engine, apiKey }) => ({
          name: engine,
          apiKey: apiKey ? {
            id: apiKey.id,
            key: apiKey.key,
            label: apiKey.label,
            rps: apiKey.rps,
            monthlyQuota: apiKey.monthlyQuota,
            httpProxy: apiKey.httpProxy,
            active: apiKey.active,
            usageMonth: apiKey.usageMonth,
            usedCount: apiKey.usedCount,
            lastUsedAt: apiKey.lastUsedAt
          } : null
        }))
      };
    } catch (error) {
      console.error('获取API密钥列表失败:', error);
      return { error: '获取API密钥列表失败' };
    }
  });

  // 获取单个引擎的API密钥详情
  app.get('/v1/admin/keys/:engine', async (req: any) => {
    if (!app.keyManager) return { error: 'KeyManager not configured' };

    const { engine } = req.params as { engine: string };

    try {
      const apiKey = app.keyManager.getEngineApiKey(engine);

      if (!apiKey) {
        return { error: '引擎未配置API密钥' };
      }

      return {
        engine,
        apiKey: {
          id: apiKey.id,
          key: apiKey.key,
          label: apiKey.label,
          rps: apiKey.rps,
          monthlyQuota: apiKey.monthlyQuota,
          httpProxy: apiKey.httpProxy,
          active: apiKey.active,
          usageMonth: apiKey.usageMonth,
          usedCount: apiKey.usedCount,
          lastUsedAt: apiKey.lastUsedAt
        }
      };
    } catch (error) {
      console.error('获取API密钥详情失败:', error);
      return { error: '获取API密钥详情失败' };
    }
  });

  // 更新API密钥信息
  app.put('/v1/admin/keys/:engine', async (req: any) => {
    if (!app.keyManager || !prisma) return { error: '系统配置不完整' };

    const { engine } = req.params as { engine: string };
    const {
      label,
      rps,
      monthlyQuota,
      httpProxy,
      active
    } = req.body as {
      label?: string;
      rps?: number;
      monthlyQuota?: number;
      httpProxy?: string;
      active?: boolean;
    };

    try {
      const currentApiKey = app.keyManager.getEngineApiKey(engine);
      if (!currentApiKey) {
        return { error: '引擎未配置API密钥' };
      }

      // 从ApiKeyService更新
      const { ApiKeyService } = await import('../../keys/ApiKeyService');
      const apiKeyService = new ApiKeyService(prisma);

      const updatedApiKey = await apiKeyService.updateApiKey(currentApiKey.id, {
        label,
        rps,
        monthlyQuota,
        httpProxy,
        active
      });

      if (!updatedApiKey) {
        return { error: '更新API密钥失败' };
      }

      // 重新加载KeyManager缓存
      if (app.keyManager && typeof app.keyManager.reloadFromDatabase === 'function') {
        await app.keyManager.reloadFromDatabase();
      }

      return { ok: true };
    } catch (error) {
      console.error('更新API密钥失败:', error);
      return { error: '更新API密钥失败' };
    }
  });

  // 删除API密钥
  app.delete('/v1/admin/keys/:engine', async (req: any) => {
    const { engine } = req.params as { engine: string };
    if (!engine) return { error: 'engine是必需的' };

    try {
      if (app.keyManager) {
        const success = await app.keyManager.removeEngineApiKey(engine);
        if (!success) {
          return { error: '删除API密钥失败' };
        }
      }

      return { ok: true };
    } catch (error) {
      console.error('删除API密钥失败:', error);
      return { error: '删除API密钥失败' };
    }
  });

  // 重置API密钥的使用统计
  app.post('/v1/admin/keys/:engine/reset-usage', async (req: any) => {
    if (!prisma) return { error: '数据库未配置' };

    const { engine } = req.params as { engine: string };

    try {
      const currentApiKey = app.keyManager?.getEngineApiKey(engine);
      if (!currentApiKey) {
        return { error: '引擎未配置API密钥' };
      }

      const { ApiKeyService } = await import('../../keys/ApiKeyService');
      const apiKeyService = new ApiKeyService(prisma);

      await apiKeyService.resetApiKeyMonthlyUsage(currentApiKey.id);

      // 重新加载KeyManager缓存
      if (app.keyManager && typeof app.keyManager.reloadFromDatabase === 'function') {
        await app.keyManager.reloadFromDatabase();
      }

      return { ok: true };
    } catch (error) {
      console.error('重置API密钥使用统计失败:', error);
      return { error: '重置API密钥使用统计失败' };
    }
  });
}
