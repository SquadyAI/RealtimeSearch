import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import { config } from './config';
import { SearchEngineLoader } from './engines/search/SearchEngineLoader';
import { TranslateEngineLoader } from './engines/translate/TranslateEngineLoader';
import { KeyManager } from './keys/KeyManager';
import { MetricsRegistry } from './metrics/Metrics';
import { JsonlLogger } from './logging/JsonlLogger';
import { SearchEngineManager } from './engines/search/SearchEngineManager';
import { TranslateEngineManager } from './engines/translate/TranslateEngineManager';
import { AuthUser } from './types/index';
import jwt from 'jsonwebtoken';
import path from 'node:path';
import fs from 'node:fs';
import { registerHealthRoutes } from './http/routes/health';
import { registerAuthRoutes } from './http/routes/auth';
import { registerAdminRoutes } from './http/routes/admin';
import { registerSearchRoutes } from './http/routes/search';

import { registerTranslateRoutes } from './http/routes/translate';
import { registerTLBRoutes } from './http/routes/tlb';
import { registerEngineRoutes } from './http/routes/engines';
import { registerApiTokenRoutes } from './http/routes/apiTokens';
import { registerApiKeyRoutes } from './http/routes/apiKeys';
import { promMetrics } from './metrics/PromMetrics';
import { RedisCache } from './utils/RedisCache';
import { TokenBlacklist } from './utils/TokenBlacklist';

import { ExtendedFastifyInstance, ExtendedFastifyRequest } from './types/extensions';

import { DatabaseManager } from './database/DatabaseManager';

export async function createServer() {
  const app = Fastify({ logger: true });

  await app.register(fastifyCors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Cache-Control', 'Pragma'],
    credentials: true
  });

  // 初始化数据库管理器（使用异步工厂方法）
  const databaseManager = await DatabaseManager.create();
  const prisma = databaseManager.getPrisma();

  // API Token authentication helper
  async function authenticateApiToken(req: ExtendedFastifyRequest): Promise<{ user: any; permissions: string } | null> {
    const authHeader = String(req.headers['authorization'] || '').trim();

    // Check if it's an API token (starts with 'Bearer rt_')
    if (authHeader.toLowerCase().startsWith('bearer rt_')) {
      const token = authHeader.slice(7).trim();

      try {
        if (!prisma) return null;

        const apiToken = await prisma.apiToken.findUnique({
          where: { token },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                role: true,
              },
            },
          },
        });

        if (!apiToken) return null;

        // Check if expired
        if (apiToken.expiresAt && apiToken.expiresAt < new Date()) {
          return null;
        }

        // Update last used time
        await prisma.apiToken.update({
          where: { token },
          data: { lastUsedAt: new Date() },
        });

        return {
          user: apiToken.user,
          permissions: apiToken.permissions,
        };
      } catch (error) {
        console.error('API token authentication error:', error);
        return null;
      }
    }

    return null;
  }

  // Global auth guard: enforce JWT + RBAC + API Token
  app.addHook('onRequest', async (req: ExtendedFastifyRequest, _reply) => {
    const url = req.url || '';

    // Public endpoints without auth: only health, metrics, and auth login/signup/register
    const isPublic = (
      url.startsWith('/healthz') ||
      url.startsWith('/readyz') ||
      url.startsWith('/metrics') ||
      url.startsWith('/v1/auth/login') ||
      url.startsWith('/v1/auth/signup') ||
      url.startsWith('/v1/auth/register') ||
      url === '/'  // 根路径用于引导状态检查
    );



    if (isPublic) return;

    // If auth is not required, skip authentication
    if (!config.authRequireLogin) {
      return;
    }

    // Extract and verify JWT or API Token
    let authUser: AuthUser | undefined;
    const authHeader = String(req.headers['authorization'] || '').trim();

    // 基本的输入验证
    if (authHeader && (typeof authHeader !== 'string' || authHeader.length > 1000)) {
      console.warn('Invalid authorization header format or length');
      _reply.code(400);
      return { error: 'invalid_authorization_header' };
    }

    // First try API token authentication
    const apiTokenAuth = await authenticateApiToken(req);
    if (apiTokenAuth) {
      authUser = {
        id: apiTokenAuth.user.id,
        username: apiTokenAuth.user.username,
        role: apiTokenAuth.user.role,
        permissions: apiTokenAuth.permissions as 'read' | 'write' | 'admin'
      };
      req.user = authUser;
    }
    // If API token auth failed, try JWT authentication
    else if (authHeader.toLowerCase().startsWith('bearer ')) {
      const token = authHeader.slice(7).trim();

      // 检查token长度
      if (token.length < 10 || token.length > 500) {
        console.warn('Invalid token length');
        _reply.code(400);
        return { error: 'invalid_token_length' };
      }

      // 首先检查token是否在黑名单中
      let isTokenBlacklisted = false;
      if (tokenBlacklist) {
        try {
          isTokenBlacklisted = await tokenBlacklist.isBlacklisted(token);
          if (isTokenBlacklisted) {
            console.warn(`Token blacklisted: ${token.substring(0, 20)}...`);
          }
        } catch (error) {
          console.error(`检查token黑名单失败:`, error);
        }
      }

      // 如果token不在黑名单中，尝试JWT验证
      if (!isTokenBlacklisted) {
        try {
          const payload: any = jwt.verify(token, config.authJwtSecret);

          if (payload && payload.sub) {
            // 验证用户是否仍然存在于数据库中
            if (prisma) {
              const user = await prisma.user.findUnique({
                where: { id: payload.sub },
                select: {
                  id: true,
                  username: true,
                  role: true,
                },
              });

              if (user) {
                authUser = {
                  id: user.id,
                  username: user.username,
                  role: user.role,
                };
                req.user = authUser;
              } else {
                console.warn(`JWT中的用户ID不存在: ${payload.sub}`);
              }
            }
          }
        } catch (jwtError) {
          console.warn(`JWT验证失败: ${jwtError instanceof Error ? jwtError.message : 'Unknown error'}`);

          // 如果JWT验证失败，尝试从ApiToken表中查找（回退机制）
          if (prisma) {
            try {
              const apiToken = await prisma.apiToken.findUnique({
                where: { token },
                include: {
                  user: {
                    select: {
                      id: true,
                      username: true,
                      role: true,
                    },
                  },
                },
              });

              if (apiToken && apiToken.user) {
                // 检查Token是否过期
                if (!apiToken.expiresAt || apiToken.expiresAt > new Date()) {
                  // 更新最后使用时间
                  await prisma.apiToken.update({
                    where: { token },
                    data: { lastUsedAt: new Date() },
                  });

                  authUser = {
                    id: apiToken.user.id,
                    username: apiToken.user.username,
                    role: apiToken.user.role,
                  };
                  req.user = authUser;
                } else {
                  console.warn(`ApiToken已过期: ${token.substring(0, 20)}...`);
                }
              } else {
                console.warn(`ApiToken表中未找到Token: ${token.substring(0, 20)}...`);
              }
            } catch (error) {
              console.error(`ApiToken查找失败:`, error);
            }
          }
        }
      }
    }

    if (!authUser) {
      _reply.code(401);
      return { error: 'unauthorized' };
    }

    // RBAC: admin endpoints require role=admin or admin permissions
    const isAdminEndpoint = url.startsWith('/v1/admin') ||
      url.startsWith('/v1/engines/create') ||
      url.startsWith('/v1/engines/compile') ||
      url.match(/^\/v1\/engines\/[^\/]+\/(delete|toggle)$/) ||
      url.match(/^\/v1\/engines\/compile\/[^\/]+$/) ||
      url === '/v1/engines/batch-toggle';

    if (isAdminEndpoint && config.authRequireLogin) {
      const hasAdminRole = authUser.role === 'admin';
      const hasAdminPermission = (authUser as any).permissions === 'admin';

      if (!hasAdminRole && !hasAdminPermission) {
        _reply.code(403);
        return { error: 'forbidden' };
      }
    }

    // 确保用户已通过验证
    if (!req.user) {
      _reply.code(401);
      return { error: 'unauthorized' };
    }
  });

  // 统一的框架入口点 - 在认证之后处理
  app.addHook('onRequest', async (req: ExtendedFastifyRequest, _reply) => {
    const url = req.url || '';

    // 只处理 v1 路径的请求
    if (url.startsWith('/v1/')) {
      app.log.info({
        url,
        method: req.method,
        userId: req.user?.id,
        username: req.user?.username
      }, 'Framework request received');

      req.frameworkRequestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
  });

  // 初始化引擎加载器
  const loader = new SearchEngineLoader(path.join(config.engineDirectory, 'search'), (name) => {
    app.log.info({ searchEngine: name }, 'search engine reloaded');
  });

  try {
    await loader.loadAll();
  } catch (error) {
    console.error('Failed to load search engines:', error);
  }

  loader.watch();

  // 初始化翻译引擎加载器
  const translateLoader = new TranslateEngineLoader(path.join(config.engineDirectory, 'translate'), (name) => {
    app.log.info({ translateEngine: name }, 'translate engine reloaded');
  });
  await translateLoader.loadAll();
  translateLoader.watch();



  // 初始化 KeyManager（使用数据库）
  let keyManager: KeyManager;
  try {
    keyManager = new KeyManager(prisma);

    if (prisma) {
      await keyManager.initialize();
    } else {
      console.warn('Database not configured, falling back to legacy config-based KeyManager');
      keyManager = new KeyManager(undefined);
    }
  } catch (error) {
    console.error('Failed to initialize KeyManager with database, falling back to config-based:', error);
    keyManager = new KeyManager(undefined);
  }

  // 从数据库加载引擎配置
  let dbEngines: string[] | undefined;
  let dbTranslateEngines: string[] | undefined;
  try {
    const result = await databaseManager.loadEnginesFromDatabase(loader, translateLoader, keyManager);
    dbEngines = result.dbEngines;
    dbTranslateEngines = result.dbTranslateEngines;
  } catch (_e) {
    // 数据库未配置或不可用；继续使用基于环境的配置
  }

  // 设置API密钥使用量持久化器（仅在非数据库模式下需要）
  if (!prisma) {
    databaseManager.setKeyUsagePersister(keyManager);
  }

  const metrics = new MetricsRegistry();
  const logger = new JsonlLogger();

  // Redis cache (optional)
  let redisCache: RedisCache | undefined;
  let tokenBlacklist: TokenBlacklist | undefined;
  if (config.redis) {
    redisCache = new RedisCache({ url: config.redis.url, prefix: config.redis.prefix });
    try {
      await redisCache.connect();
      tokenBlacklist = new TokenBlacklist(redisCache);
      console.log('✅ Redis cache connected with token blacklist');
    } catch (error) {
      console.warn('⚠️ Redis cache connection failed:', error);
    }
  }

  // 使用数据库中的引擎配置（如果可用），否则使用配置文件中的默认引擎
  const effectiveDefaultEngines = dbEngines && dbEngines.length > 0 ? dbEngines : config.defaultEngines;

  const manager = new SearchEngineManager(
    loader,
    keyManager,
    metrics,
    logger,
    databaseManager.getClickhouse(),
    effectiveDefaultEngines,
    config.requestTimeoutMs,
    !!config.enableRaw,
    config
  );

  // 初始化翻译引擎管理器
  const translateManager = new TranslateEngineManager(
    translateLoader,
    keyManager,
    metrics,
    logger,
    databaseManager.getClickhouse(),
    config.defaultTranslateEngines,
    config.requestTimeoutMs,
    !!config.enableRaw,
    config
  );

  // 设置TLB配置更新回调，当API key的RPS值发生变化时自动更新TLB配置
  keyManager.setTLBConfigUpdateCallback((engineName: string) => {
    console.log(`Server: RPS changed for engine ${engineName}, updating TLB configs`);
    // 更新搜索引擎管理器的TLB配置
    manager.updateEngineTLBConfig(engineName);
    // 更新翻译引擎管理器的TLB配置
    translateManager.updateEngineTLBConfig(engineName);
  });

  // 配置路由分组策略
  if (config.translateRoutingGroups) {
    translateManager.setRoutingGroups(config.translateRoutingGroups);
  }
  if (config.searchRoutingGroups) {
    manager.setRoutingGroups(config.searchRoutingGroups);
  }

  // Wire loader reload callback to manager's breaker reset
  loader.onReload = (engineName: string) => {
    try { manager.handleEngineReload(engineName); } catch { /* ignore engine reload errors */ }
    app.log.info({ searchEngine: engineName }, 'search engine reloaded');
  };

  translateLoader.onReload = (engineName: string) => {
    try { translateManager.handleEngineReload(engineName); } catch { /* ignore engine reload errors */ }
    app.log.info({ translateEngine: engineName }, 'translate engine reloaded');
  };

  // 配置回退引擎和hedge
  manager.fallbackEngineName = config.fallbackEngine;
  translateManager.fallbackEngineName = config.fallbackTranslateEngine;

  manager.hedgeEnabled = config.hedgeEnabled || false;
  manager.hedgeDelayMs = config.hedgeDelayMs || 150;
  manager.hedgeMaxEngines = config.hedgeMaxEngines || 2;

  translateManager.hedgeEnabled = config.translateHedgeEnabled || false;
  translateManager.hedgeDelayMs = config.translateHedgeDelayMs || 150;
  translateManager.hedgeMaxEngines = config.translateHedgeMaxEngines || 2;

  // 配置缓存
  if (redisCache) {
    manager.cache = redisCache;
    manager.cacheTtlSeconds = config.redis?.ttlSeconds;
    manager.engineCacheTtlSeconds = config.redis?.engineTtlSeconds;

    translateManager.cache = redisCache;
    translateManager.cacheTtlSeconds = config.redis?.ttlSeconds;
    translateManager.engineCacheTtlSeconds = config.redis?.engineTtlSeconds;
  }

  // 注册路由
  await registerSearchRoutes(app, { manager, config });
  await registerTranslateRoutes(app, { manager: translateManager, config });
  await registerEngineRoutes(app, { loader, translateLoader, config });

  // 注册路由后的扩展配置
  const extendedApp = app as ExtendedFastifyInstance;
  extendedApp.keyManager = keyManager;
  extendedApp.searchManager = manager;
  extendedApp.translateManager = translateManager;

  // Register TLB routes
  registerTLBRoutes(app, manager.tlbManager, translateManager.tlbManager);

  // Standard Prometheus metrics via prom-client
  app.get('/metrics', async (_req, reply) => {
    reply.header('content-type', 'text/plain; version=0.0.4');
    return promMetrics.registry.metrics();
  });

  // Health and readiness
  await registerHealthRoutes(app, { prisma, clickhouse: databaseManager.getClickhouse() });

  // Root path - API information and auto-login check
  app.get('/', async (req: any) => {
    let bootstrapInfo = null;
    let currentUser = null;

    try {
      const userCount = await databaseManager.getUserCount();
      bootstrapInfo = {
        bootstrapRequired: userCount === 0,
        message: userCount === 0 ? '系统需要初始化' : '系统已初始化'
      };

      // 如果系统已初始化，检查用户是否已登录
      if (!bootstrapInfo.bootstrapRequired) {
        const authHeader = req.headers.authorization;
        console.log('🔍 根路径认证检查 - Authorization header:', authHeader ? '存在' : '不存在');

        if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
          const token = authHeader.slice(7).trim();
          console.log('🔍 根路径认证检查 - Token长度:', token.length);

          try {
            // 首先检查token是否在黑名单中（如果黑名单功能可用）
            let isTokenBlacklisted = false;
            if (tokenBlacklist) {
              try {
                isTokenBlacklisted = await tokenBlacklist.isBlacklisted(token);
                if (isTokenBlacklisted) {
                  console.log(`Token ${token.substring(0, 20)}... 在黑名单中`);
                  // token在黑名单中，不进行后续验证
                } else {
                  // token不在黑名单中，继续验证
                  // 尝试JWT验证
                  try {
                    const payload: any = jwt.verify(token, config.authJwtSecret);
                    if (payload && payload.sub) {
                      // 验证用户是否仍然存在于数据库中
                      if (prisma) {
                        const user = await prisma.user.findUnique({
                          where: { id: payload.sub },
                          select: { id: true, username: true, role: true }
                        });
                        if (user) {
                          currentUser = {
                            id: user.id,
                            username: user.username,
                            role: user.role,
                            token: token
                          };
                          console.log(`JWT验证成功，用户: ${user.username}`);
                        } else {
                          console.log(`JWT中的用户ID ${payload.sub} 在数据库中不存在`);
                        }
                      }
                    }
                  } catch (jwtError) {
                    console.warn(`JWT验证失败: ${jwtError instanceof Error ? jwtError.message : 'Unknown error'}`);

                    // JWT验证失败，尝试从ApiToken表中查找（回退机制）
                    if (prisma) {
                      try {
                        const apiToken = await prisma.apiToken.findUnique({
                          where: { token },
                          include: { user: true }
                        });

                        if (apiToken && apiToken.user) {
                          // 检查Token是否过期
                          if (!apiToken.expiresAt || apiToken.expiresAt > new Date()) {
                            currentUser = {
                              id: apiToken.user.id,
                              username: apiToken.user.username,
                              role: apiToken.user.role,
                              token: token
                            };
                            console.info(`ApiToken回退验证成功，用户: ${apiToken.user.username}`);
                          } else {
                            console.log(`ApiToken已过期: ${token.substring(0, 20)}...`);
                          }
                        } else {
                          console.warn(`ApiToken表中未找到Token: ${token.substring(0, 20)}...`);
                        }
                      } catch (error) {
                        console.error('ApiToken查找失败:', error);
                      }
                    }
                  }
                }
              } catch (error) {
                console.error('检查token黑名单失败，跳过黑名单检查:', error);
                // 黑名单检查失败时，继续尝试验证token

                // 尝试JWT验证
                try {
                  const payload: any = jwt.verify(token, config.authJwtSecret);
                  if (payload && payload.sub) {
                    // 验证用户是否仍然存在于数据库中
                    if (prisma) {
                      const user = await prisma.user.findUnique({
                        where: { id: payload.sub },
                        select: { id: true, username: true, role: true }
                      });
                      if (user) {
                        currentUser = {
                          id: user.id,
                          username: user.username,
                          role: user.role,
                          token: token
                        };
                        console.log(`JWT验证成功，用户: ${user.username}`);
                      } else {
                        console.log(`JWT中的用户ID ${payload.sub} 在数据库中不存在`);
                      }
                    }
                  }
                } catch (jwtError) {
                  console.warn(`JWT验证失败: ${jwtError instanceof Error ? jwtError.message : 'Unknown error'}`);

                  // JWT验证失败，尝试从ApiToken表中查找（回退机制）
                  if (prisma) {
                    try {
                      const apiToken = await prisma.apiToken.findUnique({
                        where: { token },
                        include: { user: true }
                      });

                      if (apiToken && apiToken.user) {
                        // 检查Token是否过期
                        if (!apiToken.expiresAt || new Date() <= new Date(apiToken.expiresAt)) {
                          currentUser = {
                            id: apiToken.user.id,
                            username: apiToken.user.username,
                            role: apiToken.user.role,
                            token: token
                          };
                          console.log(`ApiToken回退验证成功，用户: ${apiToken.user.username}`);
                        } else {
                          console.log(`ApiToken已过期: ${token.substring(0, 20)}...`);
                        }
                      } else {
                        console.log(`ApiToken表中未找到Token: ${token.substring(0, 20)}...`);
                      }
                    } catch (error) {
                      console.error('ApiToken查找失败:', error);
                    }
                  }
                }
              }
            } else {
              // 没有黑名单功能，直接尝试验证
              // 尝试JWT验证
              try {
                const payload: any = jwt.verify(token, config.authJwtSecret);
                if (payload && payload.sub) {
                  // 验证用户是否仍然存在于数据库中
                  if (prisma) {
                    const user = await prisma.user.findUnique({
                      where: { id: payload.sub },
                      select: { id: true, username: true, role: true }
                    });
                    if (user) {
                      currentUser = {
                        id: user.id,
                        username: user.username,
                        role: user.role,
                        token: token
                      };
                      console.log(`JWT验证成功，用户: ${user.username}`);
                    } else {
                      console.log(`JWT中的用户ID ${payload.sub} 在数据库中不存在`);
                    }
                  }
                }
              } catch (jwtError) {
                console.log(`JWT验证失败: ${jwtError instanceof Error ? jwtError.message : 'Unknown error'}`);

                // JWT验证失败，尝试从ApiToken表中查找（回退机制）
                if (prisma) {
                  try {
                    const apiToken = await prisma.apiToken.findUnique({
                      where: { token },
                      include: { user: true }
                    });

                    if (apiToken && apiToken.user) {
                      // 检查Token是否过期
                      if (!apiToken.expiresAt || new Date() <= new Date(apiToken.expiresAt)) {
                        currentUser = {
                          id: apiToken.user.id,
                          username: apiToken.user.username,
                          role: apiToken.user.role,
                          token: token
                        };
                        console.log(`ApiToken回退验证成功，用户: ${apiToken.user.username}`);
                      } else {
                        console.log(`ApiToken已过期: ${token.substring(0, 20)}...`);
                      }
                    } else {
                      console.log(`ApiToken表中未找到Token: ${token.substring(0, 20)}...`);
                    }
                  } catch (error) {
                    console.error('ApiToken查找失败:', error);
                  }
                }
              }
            }
          } catch (error) {
            console.error('Token验证过程中发生错误:', error);
          }
        }
      }
    } catch (_error) {
      bootstrapInfo = {
        bootstrapRequired: true,
        message: '数据库连接失败，请检查配置'
      };
    }

    console.log('🔍 根路径返回数据 - currentUser:', currentUser);
    console.log('🔍 根路径返回数据 - userLoggedIn:', !!currentUser);

    return {
      name: 'Search & Translate API',
      version: '1.0.0',
      description: 'A unified API for search and translation services',
      bootstrap: bootstrapInfo,
      userLoggedIn: !!currentUser,
      currentUser: currentUser,
      endpoints: {
        health: '/healthz',
        metrics: '/metrics',
        search: '/v1/search',
        translate: '/v1/translate',
        auth: '/v1/auth',
        admin: '/v1/admin',
        tlb: '/v1/tlb'
      },
      status: 'running'
    };
  });

  // Register auth/admin routes after prisma ready
  await registerAuthRoutes(app, { prisma, config, tokenBlacklist });
  await registerAdminRoutes(app, { prisma, loader, config, clickhouse: databaseManager.getClickhouse(), metrics, translateLoader, tokenBlacklist });
  await registerApiTokenRoutes(app, { prisma });
  await registerApiKeyRoutes(app, { prisma });

  // User's recent logs
  app.get('/v1/user/logs/recent', async (req: ExtendedFastifyRequest, reply) => {
    const ch = databaseManager.getClickhouse();
    if (!ch) return { error: 'clickhouse not configured' };

    const user = req.user;
    if (!user) {
      reply.code(401);
      return { error: 'unauthorized' };
    }

    const queryParams = req.query as { limit?: string };
    const limit = Math.min(Number(queryParams?.limit || 20), 100);

    try {
      const data = await ch.executeQuery(`
        SELECT timestamp, query, usedEngine, resultCount, latencyMs
        FROM ${ch.publicTableName}
        WHERE userId = {userId:String}
        ORDER BY timestamp DESC
        LIMIT {limit:UInt32}
      `, { userId: user.id, limit });
      return { rows: data };
    } catch (error) {
      app.log.error({ error: String(error) }, 'Failed to query user logs from Clickhouse');
      reply.code(500);
      return { error: 'Failed to fetch user logs' };
    }
  });

  return app;
}

// 添加优雅关闭处理
export async function gracefulShutdown(databaseManager: DatabaseManager, signal: string) {
  console.log(`\n🔄 Received ${signal}. Starting graceful shutdown...`);

  try {
    // 关闭数据库连接
    await databaseManager.close();
    console.log('✅ Graceful shutdown completed');
  } catch (error) {
    console.error('❌ Error during graceful shutdown:', error);
    process.exit(1);
  }
}

// 如果这个文件被直接运行，设置进程信号处理
if (import.meta.url === `file://${process.argv[1]}`) {
  const databaseManager = DatabaseManager.createSync();

  // 处理进程信号
  process.on('SIGTERM', () => gracefulShutdown(databaseManager, 'SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown(databaseManager, 'SIGINT'));

  // 处理未捕获的异常
  process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    gracefulShutdown(databaseManager, 'uncaughtException');
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown(databaseManager, 'unhandledRejection');
  });
}
