import path from 'node:path';
import fs from 'node:fs';
import { ServiceConfig } from './types';

// 使用 dotenv 加载环境变量（可选）
import dotenv from 'dotenv';
try {
  dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
} catch (error) {
  console.warn('无法加载 .env 文件，使用默认配置:', error);
}

const env = process.env;

function getString(name: string, def: string): string {
  return env[name] || def;
}

function getNumber(name: string, def: number): number {
  const v = env[name];
  if (!v) return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function getBoolean(name: string, def: boolean): boolean {
  const v = env[name];
  if (!v) return def;
  return v === '1' || v.toLowerCase() === 'true';
}

function getStringArray(name: string, def: string[]): string[] {
  const v = env[name];
  if (!v) return def;
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

function resolveEngineDirectory(): string {
  const fromEnv = env.ENGINE_DIR;
  if (fromEnv) return path.resolve(process.cwd(), fromEnv);

  // 检查Docker环境中的路径 - 修复路径问题
  const dockerBackendDistDir = path.resolve(process.cwd(), 'apps', 'backend', 'dist', 'engines');
  if (fs.existsSync(dockerBackendDistDir)) return dockerBackendDistDir;

  // 检查其他可能的路径
  const dockerBackendSrcDir = path.resolve(process.cwd(), 'apps', 'backend', 'engines');
  if (fs.existsSync(dockerBackendSrcDir)) return dockerBackendSrcDir;

  const srcDir = path.resolve(process.cwd(), 'engines');
  const distDir = path.resolve(process.cwd(), 'dist', 'engines');
  if (fs.existsSync(srcDir)) return srcDir;
  if (fs.existsSync(distDir)) return distDir;
  return srcDir;
}

export const config: ServiceConfig = {
  // 基础服务配置
  port: getNumber('PORT', 8787),
  host: getString('HOST', '0.0.0.0'),

  // 搜索引擎配置
  defaultEngines: getStringArray('SEARCH_ENGINES', ['serper', 'brave', 'bing']),
  defaultTranslateEngines: getStringArray('TRANSLATE_ENGINES', ['squady', 'google', 'deepl']),

  // 引擎目录配置
  engineDirectory: resolveEngineDirectory(),

  // 请求超时配置
  requestTimeoutMs: getNumber('REQUEST_TIMEOUT_MS', 30000),

  // 代理配置
  httpProxy: getString('HTTP_PROXY', ''),

  // API密钥池配置（仅用于初始化时迁移到数据库，实际运行时从数据库获取）
  // 注意：这些环境变量仅在首次启动时用于自动创建数据库中的API密钥记录
  // 生产环境中应该直接在数据库中管理API密钥，而不是依赖环境变量
  keyPools: [
    {
      engine: 'serper',
      keys: getStringArray('SERPER_API_KEYS', []),
    },
    {
      engine: 'brave',
      keys: getStringArray('BRAVE_API_KEYS', []),
    },
    {
      engine: 'bing',
      keys: getStringArray('BING_API_KEYS', []),
    },
    {
      engine: 'squady',
      keys: getStringArray('SQUADY_API_KEYS', []),
    },
    {
      engine: 'google',
      keys: getStringArray('GOOGLE_API_KEYS', []),
    },
    {
      engine: 'deepl',
      keys: getStringArray('DEEPL_API_KEYS', []),
    },
  ],

  // 搜索结果配置
  maxItems: getNumber('MAX_ITEMS', 10),
  enableRaw: getBoolean('ENABLE_RAW', false),

  // 数据库配置
  clickhouse: env.CLICKHOUSE_URL
    ? {
      url: getString('CLICKHOUSE_URL', ''),
      database: getString('CLICKHOUSE_DATABASE', 'default'),
      username: getString('CLICKHOUSE_USERNAME', getString('CLICKHOUSE_USER', 'default')),
      password: getString('CLICKHOUSE_PASSWORD', ''),
      tls: getBoolean('CLICKHOUSE_TLS', true),
    }
    : undefined,

  redis: env.REDIS_URL
    ? {
      url: getString('REDIS_URL', ''),
      ttlSeconds: getNumber('REDIS_TTL_SECONDS', 60),
      engineTtlSeconds: getNumber('REDIS_ENGINE_TTL_SECONDS', 30),
      prefix: getString('REDIS_PREFIX', 'rtsearch'),
    }
    : undefined,

  // 故障转移引擎配置
  fallbackEngine: getString('FALLBACK_ENGINE', ''),
  fallbackTranslateEngine: getString('FALLBACK_TRANSLATE_ENGINE', ''),

  // API密钥配置
  serviceApiKeys: getStringArray('SERVICE_API_KEYS', []),
  adminApiKeys: getStringArray('ADMIN_API_KEYS', []),

  // 认证配置
  authJwtSecret: getString('AUTH_JWT_SECRET', 'dev-secret-change-me-in-production'),
  authJwtExpires: getString('AUTH_JWT_EXPIRES', '7d'),
  authAllowSignup: getBoolean('AUTH_ALLOW_SIGNUP', true), // 默认启用注册
  authRequireLogin: getBoolean('AUTH_REQUIRE_LOGIN', true), // 默认强制登录
  // Hedge配置
  hedgeEnabled: getBoolean('HEDGE_ENABLED', false),
  hedgeDelayMs: getNumber('HEDGE_DELAY_MS', 150),
  hedgeMaxEngines: getNumber('HEDGE_MAX_ENGINES', 2),
  translateHedgeEnabled: getBoolean('TRANSLATE_HEDGE_ENABLED', false),
  translateHedgeDelayMs: getNumber('TRANSLATE_HEDGE_DELAY_MS', 150),
  translateHedgeMaxEngines: getNumber('TRANSLATE_HEDGE_MAX_ENGINES', 2),

  // TLB配置
  tlbEnabled: getBoolean('TLB_ENABLED', true),
  tlbDefaultRPS: getNumber('TLB_DEFAULT_RPS', 20),
  tlbEnableHotSwap: getBoolean('TLB_ENABLE_HOT_SWAP', true),
  tlbTokenReturnDelayMs: getNumber('TLB_TOKEN_RETURN_DELAY_MS', 1000),
  tlbMaxRetries: getNumber('TLB_MAX_RETRIES', 3),

  // 引擎最大令牌数配置
  engineMaxTokens: {
    serper: getNumber('SERPER_MAX_TOKENS', 10),
    brave: getNumber('BRAVE_MAX_TOKENS', 10),
    bing: getNumber('BING_MAX_TOKENS', 10),
    squady: getNumber('SQUADY_MAX_TOKENS', 10),
    google: getNumber('GOOGLE_MAX_TOKENS', 10),
    deepl: getNumber('DEEPL_MAX_TOKENS', 10),
    'test-fail1': getNumber('TEST_FAIL1_MAX_TOKENS', 10),
    'test-fail2': getNumber('TEST_FAIL2_MAX_TOKENS', 10),
    'test-success': getNumber('TEST_SUCCESS_MAX_TOKENS', 10),
  },

  // 翻译路由分组策略配置
  translateRoutingGroups: {
    // 按语言分组
    'zh': ['squady', 'google', 'deepl'],
    'zh-TW': ['squady', 'google', 'deepl'],
    'en': ['squady', 'google', 'deepl'],
    'fr': ['squady', 'google', 'deepl'],
    'de': ['squady', 'google', 'deepl'],
    'es': ['squady', 'google', 'deepl'],
    'it': ['squady', 'google', 'deepl'],
    'pt': ['squady', 'google', 'deepl'],
    'ru': ['squady', 'google', 'deepl'],
    'pl': ['squady', 'google', 'deepl'],
    'el': ['squady', 'google', 'deepl'],
    'uk': ['squady', 'google', 'deepl'],
    'he': ['squady', 'google', 'deepl'],
    'ja': ['squady', 'google', 'deepl'],
    'ko': ['squady', 'google', 'deepl'],
    'th': ['squady', 'google', 'deepl'],
    'vi': ['squady', 'google', 'deepl'],
    'tr': ['squady', 'google', 'deepl'],
    'id': ['squady', 'google', 'deepl'],
    'ms': ['squady', 'google', 'deepl'],
    'yue': ['squady', 'google', 'deepl'],
    'ar': ['squady', 'google', 'deepl'],
    'fa': ['squady', 'google', 'deepl'],

    // 按用户等级分组
    'premium': ['squady', 'google', 'deepl'],
    'standard': ['squady', 'google'],
    'basic': ['squady'],

    // 按业务场景分组
    'business': ['google', 'deepl'],
    'personal': ['squady', 'google'],
    'academic': ['google', 'deepl'],
  },

  // 搜索路由分组策略配置
  searchRoutingGroups: {
    // 按国家/地区分组
    'US': ['serper', 'brave', 'bing'],
    'CN': ['bing', 'serper'],
    'EU': ['brave', 'serper', 'bing'],
    'JP': ['bing', 'serper'],
    'KR': ['bing', 'serper'],
    'IN': ['serper', 'bing'],
    'BR': ['serper', 'bing'],
    'RU': ['bing', 'serper'],
    'AU': ['serper', 'brave', 'bing'],
    'CA': ['serper', 'brave', 'bing'],

    // 按索引类别分组
    'news': ['serper', 'bing'],
    'images': ['bing', 'serper'],
    'videos': ['bing', 'serper'],
    'shopping': ['serper', 'bing'],
    'academic': ['bing', 'serper'],

    // 按用户画像分组
    'premium': ['serper', 'brave', 'bing'],
    'standard': ['serper', 'bing'],
    'basic': ['bing'],

    // 按业务场景分组
    'enterprise': ['serper', 'bing'],
    'consumer': ['serper', 'brave', 'bing'],
    'research': ['bing', 'serper'],
  },



  // 用户账号配置 - 移除，改为通过初次部署流程创建
  // users: {
  //   admin: {
  //     username: getString('ADMIN_USERNAME', 'admin'),
  //     password: getString('ADMIN_PASSWORD', '123456'),
  //     role: 'admin' as const
  //   },
  //   regular: {
  //     username: getString('REGULAR_USERNAME', 'user'),
  //     password: getString('REGULAR_PASSWORD', '123456'),
  //     role: 'user' as const
  //   }
  // }
};


