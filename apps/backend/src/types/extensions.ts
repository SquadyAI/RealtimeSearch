import { FastifyInstance, FastifyRequest } from 'fastify';
import { KeyManager } from '../keys/KeyManager';
import { SearchEngineManager } from '../engines/search/SearchEngineManager';
import { TranslateEngineManager } from '../engines/translate/TranslateEngineManager';
import { AuthUser } from '../types';

// Fastify 应用扩展接口
declare module 'fastify' {
  interface FastifyInstance {
    keyManager?: KeyManager;
    searchManager?: SearchEngineManager;
    translateManager?: TranslateEngineManager;
  }

  interface FastifyRequest {
    user?: AuthUser;
    frameworkRequestId?: string;
  }
}

// 导出类型别名，避免重复定义
export type ExtendedFastifyRequest = FastifyRequest;
export type ExtendedFastifyInstance = FastifyInstance;
