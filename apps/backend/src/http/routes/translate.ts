import { TranslateEngineManager } from '../../engines/translate/TranslateEngineManager';
import { ServiceConfig, AuthUser } from '../../types';
import { ExtendedFastifyRequest, ExtendedFastifyInstance } from '../../types/extensions';

export async function registerTranslateRoutes(app: ExtendedFastifyInstance, deps: { manager: TranslateEngineManager; config: ServiceConfig }) {
  const { manager, config } = deps;

  // 非流式翻译端点 - 使用完整的TLB策略
  app.post('/v1/translate/sync', async (req: ExtendedFastifyRequest, reply) => {
    const body = req.body as {
      q?: string;
      target?: string;
      source?: string;
      format?: 'html' | 'text';
      model?: string;
      httpProxy?: string;
      routingKey?: string; // 新增：支持路由键参数
    } || {};
    const query = String(body.q || '').trim();
    const target = String(body.target || '').trim();
    const source = body.source || undefined;
    const format = body.format || 'text';
    const model = body.model || 'nmt';

    if (!query || !target) {
      reply.code(400);
      return {
        error: 'q和target参数是必需的',
        required: ['q', 'target'],
        example: {
          q: 'Hello world',
          target: 'zh',
          source: 'auto',
          format: 'text',
          model: 'nmt'
        }
      };
    }

    const frameworkRequestId = req.frameworkRequestId || 'unknown';
    req.log.info({
      frameworkRequestId,
      endpoint: '/v1/translate/sync',
      query,
      target,
      source
    }, 'Framework -> Translate sync endpoint');

    try {
      const user = req.user;

      // 使用 manager 的非流式翻译方法（完整的TLB策略）
      const result = await manager.translate(query, target, {
        source: source,
        format: body.format || 'text',
        model: body.model || 'nmt',
        routingKey: body.routingKey, // 新增：支持路由键参数
        httpProxy: body.httpProxy || config.httpProxy,
        userAgent: req.headers['user-agent'],
        clientIp: (req.headers['x-forwarded-for'] as string) || req.ip,
        userId: user?.id,
        username: user?.username,
      });

      return {
        ...result,
        _framework: {
          requestId: frameworkRequestId,
          endpoint: '/v1/translate/sync',
          timestamp: new Date().toISOString()
        }
      };
    } catch (error: any) {
      req.log.error({ err: error, frameworkRequestId }, 'translate sync failed');

      // 使用基类的错误分类方法
      let statusCode = 500;
      let errorMessage = error.message || 'Translation failed';
      let details: string | undefined;

      if (error?.message === 'No available tokens in any engine' ||
        error?.message === 'Rate limit exceeded - no available tokens in any engine' ||
        (error as any)?.isRateLimit) {
        statusCode = 429;
        errorMessage = 'Rate limit exceeded';
        details = 'No available tokens in any engine';
      }

      reply.code(statusCode);
      return {
        error: errorMessage,
        details,
        _framework: {
          requestId: frameworkRequestId,
          endpoint: '/v1/translate/sync',
          timestamp: new Date().toISOString()
        }
      };
    }
  });

  // 流式翻译端点 - 使用翻译引擎管理器
  app.post('/v1/translate', async (req: ExtendedFastifyRequest, reply) => {
    // 首先检查用户认证状态
    const user = req.user;
    if (!user) {
      reply.code(401);
      return { error: 'unauthorized' };
    }

    const body = req.body as {
      q?: string;
      target?: string;
      source?: string;
      format?: 'html' | 'text';
      model?: string;
      httpProxy?: string;
      routingKey?: string; // 新增：支持路由键参数
    } || {};
    const query = String(body.q || '').trim();
    const target = String(body.target || '').trim();
    // 源语言默认为自动检测，不传入参数
    const source = body.source || undefined;
    const format = body.format || 'text';
    const model = body.model || 'nmt';

    if (!query || !target) {
      reply.code(400);
      return {
        error: 'q和target参数是必需的',
        required: ['q', 'target'],
        example: {
          q: 'Hello world',
          target: 'zh',
          source: 'auto', // 可选，不传则自动检测
          format: 'text',
          model: 'squady'
        }
      };
    }

    // 框架层标识 - 显示请求来自框架层
    const frameworkRequestId = req.frameworkRequestId || 'unknown';
    req.log.info({
      frameworkRequestId,
      endpoint: '/v1/translate',
      query,
      target,
      source
    }, 'Framework -> Translate endpoint');

    try {
      // 用户认证状态已经在函数开始时检查过了

      // 设置流式响应头
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'X-Framework-Request-ID': frameworkRequestId,
      });

      // 发送初始连接确认，包含框架层信息
      reply.raw.write(`data: ${JSON.stringify({
        status: "connected",
        _framework: {
          requestId: frameworkRequestId,
          endpoint: '/v1/translate',
          timestamp: new Date().toISOString()
        }
      })}\n\n`);

      // 使用 manager 的流式翻译方法
      const stream = await manager.translateStream(query, target, {
        source: source, // 使用处理后的source变量，undefined表示自动检测
        format: body.format || 'text',
        model: body.model || 'squady',
        routingKey: body.routingKey, // 新增：支持路由键参数
        httpProxy: body.httpProxy || config.httpProxy,
        userAgent: req.headers['user-agent'],
        clientIp: (req.headers['x-forwarded-for'] as string) || req.ip,
        userId: user?.id,
        username: user?.username,
      });

      // 转发流式响应
      const reader = stream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = new TextDecoder().decode(value);
          // 确保每个 chunk 都是有效的 SSE 格式
          if (chunk.trim()) {
            reply.raw.write(chunk);
            // 强制刷新缓冲区
            if ('flush' in reply.raw && typeof reply.raw.flush === 'function') {
              (reply.raw as any).flush();
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      // 发送完成信号，包含框架层信息
      reply.raw.write(`data: ${JSON.stringify({
        status: "completed",
        _framework: {
          requestId: frameworkRequestId,
          endpoint: '/v1/translate',
          timestamp: new Date().toISOString()
        }
      })}\n\n`);
      reply.raw.end();

    } catch (err: any) {
      req.log.error({ err, frameworkRequestId }, 'translate failed');

      // 设置流式响应头（如果还没有设置）
      if (!reply.raw.headersSent) {
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'X-Framework-Request-ID': frameworkRequestId,
        });
      }

      reply.raw.write(`data: ${JSON.stringify({
        error: String(err?.message || err),
        _framework: {
          requestId: frameworkRequestId,
          endpoint: '/v1/translate',
          timestamp: new Date().toISOString()
        }
      })}\n\n`);
      reply.raw.end();
    }
  });

  // 健康检查端点 - 简单的健康状态检查
  app.get('/v1/translate/health', async (request: any, reply: any) => {
    try {
      // 检查翻译引擎管理器是否可用
      const availableEngines = config.defaultTranslateEngines;

      return {
        status: 'healthy',
        service: '翻译服务',
        availableEngines: availableEngines,
        testResult: '翻译引擎管理器运行正常',
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      reply.code(503);
      return {
        status: 'unhealthy',
        service: '翻译服务',
        error: `健康检查失败: ${error.message || '未知错误'}`,
        timestamp: new Date().toISOString()
      };
    }
  });
}
