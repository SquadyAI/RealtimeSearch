import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { SearchEngineLoader } from '../../engines/search/SearchEngineLoader';
import { ServiceConfig, SearchArgs, AuthUser, MutableServiceConfig } from '../../types';
import { ExtendedFastifyInstance } from '../../types/extensions';

export async function registerAdminRoutes(app: ExtendedFastifyInstance, deps: {
  prisma?: PrismaClient;
  loader: SearchEngineLoader;
  config: ServiceConfig;
  clickhouse?: any;
  metrics?: any;
  translateLoader?: any;
  tokenBlacklist?: any;
}) {
  const { prisma, loader, config, clickhouse: ch, metrics, translateLoader, tokenBlacklist } = deps;

  // 公共工具函数
  const DEFAULT_TRANSLATE_ENGINES = ['squady', 'google', 'deepl'];
  
  const getEngineList = () => ({
    search: loader.listEngineNames(),
    translate: translateLoader?.listEngineNames() || DEFAULT_TRANSLATE_ENGINES
  });

  const getTLBManager = (type: 'search' | 'translate') => 
    type === 'search' ? app.searchManager?.tlbManager : app.translateManager?.tlbManager;

  const isTLBSynced = (name: string, type: 'search' | 'translate') => 
    getTLBManager(type)?.getRegisteredEngines().includes(name) || false;

  const syncTLBEngines = (manager: any, previousEngines: string[], newEngines: string[]) => {
    if (!manager?.tlbManager) return;
    
    // 移除不再使用的引擎
    for (const engineName of previousEngines) {
      if (!newEngines.includes(engineName)) {
        manager.tlbManager.hotSwapRemoveEngine(engineName);
      }
    }
    
    // 添加新引擎
    for (const engineName of newEngines) {
      if (!previousEngines.includes(engineName)) {
        const maxTokens = config.engineMaxTokens?.[engineName] || 10;
        manager.tlbManager.hotSwapAddEngine(engineName, maxTokens);
      }
    }
  };

  // 安全的TLB同步包装器
  const safeTLBSync = (type: 'search' | 'translate', previousEngines: string[], newEngines: string[]) => {
    try {
      const manager = getTLBManager(type);
      if (manager) syncTLBEngines(manager, previousEngines, newEngines);
    } catch (error) {
      console.error(`${type} TLB sync failed:`, error);
    }
  };

  // 验证引擎数组
  const validateEngineArray = (engines: any, context: string) => {
    if (!Array.isArray(engines) || engines.length === 0) return { error: `invalid ${context}` };
    return null;
  };

  // TLB引擎操作
  const toggleTLBEngine = (type: 'search' | 'translate', engine: string, enabled: boolean) => {
    const tlbManager = getTLBManager(type);
    if (tlbManager) {
      if (enabled) {
        const maxTokens = config.engineMaxTokens?.[engine] || 10;
        tlbManager.hotSwapAddEngine(engine, maxTokens);
      } else {
        tlbManager.hotSwapRemoveEngine(engine);
      }
    }
  };

    // 简化的引擎状态管理
  const getEngineStatus = (name: string, type: 'search' | 'translate') => {
    // 从TLB管理器获取真实的启用状态
    const tlbManager = getTLBManager(type);
    const isEnabled = tlbManager ? tlbManager.getRegisteredEngines().includes(name) : false;
    
    return {
      name,
      type,
      available: type === 'search' ? !!loader.getEngine(name) : !!translateLoader?.getEngine(name),
      enabled: isEnabled, // 从TLB管理器读取真实状态
      default: type === 'search' 
            ? config.defaultEngines?.includes(name) || false
        : config.defaultTranslateEngines?.includes(name) || false,
      tlbSynced: isTLBSynced(name, type)
    };
  };

  // 统一的响应包装器
  const createResponse = (data: any, message?: string) => ({
    ok: true,
    data,
    message,
    timestamp: new Date().toISOString()
  });

  app.get('/v1/admin/search/engines', async () => {
    const engines = loader.listEngineNames();
    return {
      engines: engines.map((name: string) => getEngineStatus(name, 'search')),
      default: config.defaultEngines || [],
      total: engines.length
    };
  });

  // 添加翻译引擎端点
  app.get('/v1/admin/translate/engines', async () => {
    const engines = getEngineList();
    return {
      engines: engines.translate.map((name: string) => getEngineStatus(name, 'translate')),
      default: config.defaultTranslateEngines || [],
      total: engines.translate.length
    };
  });

  // 设置翻译引擎默认引擎
  app.post(
    '/v1/admin/translate/engines/set',
    async (req: any) => {
      const { engines } = req.body as { engines?: string[] } || {};
      if (!engines) {
        return { error: 'engines parameter is required' };
      }
      const validationError = validateEngineArray(engines, 'engines');
      if (validationError) return validationError;
      
      // 获取之前的默认翻译引擎列表，用于TLB同步
      const previousEngines = config.defaultTranslateEngines || [];
      
      // 使用类型安全的配置修改
      const mutableConfig = config as MutableServiceConfig;
      mutableConfig.defaultTranslateEngines = engines.filter((e: string) => !!translateLoader?.getEngine(e));
      
      // TLB同步
      safeTLBSync('translate', previousEngines, mutableConfig.defaultTranslateEngines);
      
      return createResponse(mutableConfig.defaultTranslateEngines, '翻译引擎设置已更新');
    }
  );

  app.get(
    '/v1/admin/search/engines/:name/code',
    async (req: any, reply: any) => {
      const name = req.params.name;
      const p = loader.findSourcePath(name) || path.join(config.engineDirectory, `${name}.ts`);
      if (!fs.existsSync(p)) {
        reply.code(404);
        return { error: 'engine source not found' };
      }
      const code = fs.readFileSync(p, 'utf8');
      return { path: p, code };
    }
  );

  app.post(
    '/v1/admin/search/engines/:name/code',
    async (req: any, reply: any) => {
      const name = req.params.name;
      const code = (req.body && req.body.code) || '';
      if (!code || code.length < 10) {
        reply.code(400);
        return { error: 'invalid code' };
      }
      if (!fs.existsSync(config.engineDirectory)) {
        fs.mkdirSync(config.engineDirectory, { recursive: true });
      }
      const p = path.join(config.engineDirectory, `${name}.ts`);
      fs.writeFileSync(p, code, 'utf8');
      try {
        const esb: any = await import('esbuild');
        const out = await esb.transform(code, { loader: 'ts', format: 'esm', target: 'es2020', sourcemap: false });
        const jsPath = path.join(config.engineDirectory, `${name}.js`);
        fs.writeFileSync(jsPath, out.code, 'utf8');
        await loader.loadOne(jsPath);
        return { ok: true, path: jsPath };
      } catch (_e) {
        await loader.loadOne(p);
        return { ok: true, path: p };
      }
    }
  );

  app.post(
    '/v1/admin/search/engines/:name/test',
    async (req: any, reply: any) => {
      const name = req.params.name;
      const engine = loader.getEngine(name);
      if (!engine) {
        reply.code(404);
        return { error: 'engine not found' };
      }
      const q = String(req.body?.query || '').trim();
      if (!q) {
        reply.code(400);
        return { error: 'query is required' };
      }
      try {
        const res = await engine.search({
          query: q,
          apiKey: req.body?.apiKey,
          httpProxy: req.body?.httpProxy || config.httpProxy,
          limit: req.body?.limit || 10,
          locale: req.body?.locale,
          safesearch: req.body?.safesearch,
          freshness: req.body?.freshness,
          userAgent: req.headers['user-agent'],
        });
        return res;
      } catch (err: any) {
        reply.code(502);
        return { error: String(err?.message || err) };
      }
    }
  );

  app.post(
    '/v1/admin/search/engines/set',
    async (req: any) => {
      const { engines } = req.body as { engines?: string[] } || {};
      if (!engines) {
        return { error: 'engines parameter is required' };
      }
      const validationError = validateEngineArray(engines, 'engines');
      if (validationError) return validationError;
      
      // 获取之前的默认引擎列表，用于TLB同步
      const previousEngines = config.defaultEngines || [];
      
      // 使用类型安全的配置修改
      const mutableConfig = config as MutableServiceConfig;
      mutableConfig.defaultEngines = engines.filter((e: string) => !!loader.getEngine(e));
      
      if (prisma) {
        const names = mutableConfig.defaultEngines;
        await Promise.all(
          names.map((name, idx) =>
            prisma!.engine.upsert({
              where: { name },
              create: { name, enabled: true, priority: idx },
              update: { enabled: true, priority: idx },
            })
          )
        );
      }
      
      // TLB同步
      safeTLBSync('search', previousEngines, mutableConfig.defaultEngines);
      safeTLBSync('translate', previousEngines, mutableConfig.defaultEngines);
      
      return createResponse(mutableConfig.defaultEngines, '搜索引擎设置已更新');
    }
  );


  // 引擎代理设置
  app.post('/v1/admin/search/engines/proxy/set', async (req: any) => {
    const { engine, proxy } = req.body as { engine?: string; proxy?: string } || {};
    if (!engine) return { error: 'invalid engine' };
    
    app.keyManager?.setEngineProxy(engine, proxy || undefined);
    
    if (prisma) {
      await prisma.engine.upsert({
        where: { name: engine },
        create: { name: engine, enabled: true, httpProxy: proxy || undefined },
        update: { httpProxy: proxy || undefined },
      });
    }
    return { ok: true };
  });

  // Token黑名单管理
  app.get('/v1/admin/blacklist', async (req: any, reply: any) => {
    const user = (req as any).user as AuthUser | undefined;
    if (!user || user.role !== 'admin') {
      reply.code(403);
      return { error: '需要管理员权限' };
    }

    try {
      if (!tokenBlacklist) {
        reply.code(500);
        return { error: 'Token黑名单功能未启用' };
      }

      const stats = await tokenBlacklist.getStats();
      return { 
        success: true, 
        stats,
        message: '获取黑名单统计信息成功'
      };
    } catch (error) {
      console.error('获取黑名单统计失败:', error);
      reply.code(500);
      return { error: '服务器错误' };
    }
  });

  app.get('/v1/admin/blacklist/user/:userId', async (req: any, reply: any) => {
    const user = (req as any).user as AuthUser | undefined;
    if (!user || user.role !== 'admin') {
      reply.code(403);
      return { error: '需要管理员权限' };
    }

    const { userId } = req.params as { userId: string };
    
    try {
      if (!tokenBlacklist) {
        reply.code(500);
        return { error: 'Token黑名单功能未启用' };
      }

      const tokens = await tokenBlacklist.getUserBlacklistedTokens(userId);
      return { 
        success: true, 
        userId,
        tokens,
        count: tokens.length
      };
    } catch (error) {
      console.error('获取用户黑名单token失败:', error);
      reply.code(500);
      return { error: '服务器错误' };
    }
  });

  app.delete('/v1/admin/blacklist/token/:token', async (req: any, reply: any) => {
    const user = (req as any).user as AuthUser | undefined;
    if (!user || user.role !== 'admin') {
      reply.code(403);
      return { error: '需要管理员权限' };
    }

    const { token } = req.params as { token: string };
    
    try {
      if (!tokenBlacklist) {
        reply.code(500);
        return { error: 'Token黑名单功能未启用' };
      }

      const removed = await tokenBlacklist.removeFromBlacklist(token);
      if (removed) {
        return { 
          success: true, 
          message: 'Token已从黑名单中移除'
        };
      } else {
        reply.code(404);
        return { error: 'Token不在黑名单中' };
      }
    } catch (error) {
      console.error('从黑名单移除token失败:', error);
      reply.code(500);
      return { error: '服务器错误' };
    }
  });
}


