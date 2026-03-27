import { SearchEngineManager } from '../../engines/search/SearchEngineManager';
import { ServiceConfig, SearchArgs, AuthUser } from '../../types';
import { ExtendedFastifyInstance, ExtendedFastifyRequest } from '../../types/extensions';

export async function registerSearchRoutes(app: ExtendedFastifyInstance, deps: { manager: SearchEngineManager; config: ServiceConfig }) {
  const { manager, config } = deps;

  app.post(
    '/v1/search',
    async (req: ExtendedFastifyRequest, reply) => {
      const body = req.body as {
        query?: string;
        httpProxy?: string;
        limit?: number;
        locale?: string;
        safesearch?: 'off' | 'moderate' | 'strict';
        freshness?: string;
        routingKey?: string;
      } || {};
      const query = String(body.query || '').trim();
      if (!query) {
        reply.code(400);
        return { error: 'query is required' };
      }

      // 框架层标识 - 显示请求来自框架层
      const frameworkRequestId = req.frameworkRequestId || 'unknown';
      req.log.info({
        frameworkRequestId,
        endpoint: '/v1/search',
        query
      }, 'Framework -> Search endpoint');

      try {
        const user = req.user;
        const res = await manager.search(query, {
          httpProxy: body.httpProxy || config.httpProxy,
          limit: Math.min(body.limit || config.maxItems, config.maxItems),
          locale: body.locale,
          safesearch: body.safesearch,
          freshness: body.freshness,
          routingKey: body.routingKey, // 新增：支持路由键参数
          userAgent: req.headers['user-agent'],
          clientIp: (req.headers['x-forwarded-for'] as string) || req.ip,
          userId: user?.id,
          username: user?.username,
        });

        // 框架层响应标识
        return {
          ...res,
          _framework: {
            requestId: frameworkRequestId,
            endpoint: '/v1/search',
            timestamp: new Date().toISOString()
          }
        };
      } catch (err: any) {
        req.log.error({ err, frameworkRequestId }, 'search failed');

        // 使用基类的错误分类方法（如果manager有这个方法）
        let statusCode = 502;
        let errorMessage = String(err?.message || err);

        if (err?.message === 'No available tokens in any engine' ||
          err?.message === 'Rate limit exceeded - no available tokens in any engine' ||
          (err as any)?.isRateLimit) {
          statusCode = 429;
          errorMessage = 'Rate limit exceeded';
        }

        reply.code(statusCode);
        return {
          error: errorMessage,
          details: statusCode === 429 ? 'No available tokens in any engine' : undefined
        };
      }
    }
  );
}


