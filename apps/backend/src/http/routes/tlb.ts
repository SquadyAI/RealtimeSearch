import { FastifyInstance } from 'fastify';
import { TLBManager } from '../../engines/base/TLBManager';

export function registerTLBRoutes(
  app: FastifyInstance,
  searchTLBManager?: TLBManager,
  translateTLBManager?: TLBManager
): void {
  
  // 注册TLB路由到 /v1/tlb 前缀下
  app.register(async function (fastify) {
    
    // 获取TLB状态
    fastify.get('/status', async (request, reply) => {
      const status = {
        search: searchTLBManager ? {
          enabled: true,
          engines: searchTLBManager.getEngineStats(),
          available: searchTLBManager.getAvailableTokenBuckets()
        } : { enabled: false },
        translate: translateTLBManager ? {
          enabled: true,
          engines: translateTLBManager.getEngineStats(),
          available: translateTLBManager.getAvailableTokenBuckets()
        } : { enabled: false }
      };
      
      return status;
    });

    // 获取引擎统计信息
    fastify.get('/stats', async (request, reply) => {
      const stats = {
        search: searchTLBManager?.getEngineStats() || {},
        translate: translateTLBManager?.getEngineStats() || {}
      };
      
      return stats;
    });

    // 获取可用引擎列表
    fastify.get('/available', async (request, reply) => {
      const available = {
        search: searchTLBManager?.getAvailableTokenBuckets() || [],
        translate: translateTLBManager?.getAvailableTokenBuckets() || []
      };
      
      return available;
    });

    // 检查特定引擎是否可用
    fastify.get('/engine/:type/:engineId/available', async (request, reply) => {
      const { type, engineId } = request.params as { type: string; engineId: string };
      
      let isAvailable = false;
      if (type === 'search' && searchTLBManager) {
        isAvailable = searchTLBManager.isEngineAvailable(engineId);
      } else if (type === 'translate' && translateTLBManager) {
        isAvailable = translateTLBManager.isEngineAvailable(engineId);
      }
      
      return { engineId, type, available: isAvailable };
    });

    // 获取引擎RPS配置
    fastify.get('/engine/:type/:engineId/rps', async (request, reply) => {
      const { type, engineId } = request.params as { type: string; engineId: string };
      
      let rps = 0;
      if (type === 'search' && searchTLBManager) {
        const stats = searchTLBManager.getEngineStats();
        rps = stats[engineId]?.rps || 0;
      } else if (type === 'translate' && translateTLBManager) {
        const stats = translateTLBManager.getEngineStats();
        rps = stats[engineId]?.rps || 0;
      }
      
      return { engineId, type, rps };
    });

    // 更新引擎RPS（需要管理员权限）
    fastify.post('/engine/:type/:engineId/rps', async (request, reply) => {
      const { type, engineId } = request.params as { type: string; engineId: string };
      const { rps } = request.body as { rps: number };
      
      if (typeof rps !== 'number' || rps < 0) {
        reply.code(400);
        return { error: 'Invalid RPS value' };
      }
      
      try {
        if (type === 'search' && searchTLBManager) {
          searchTLBManager.updateEngineRPS(engineId, rps);
        } else if (type === 'translate' && translateTLBManager) {
          translateTLBManager.updateEngineRPS(engineId, rps);
        } else {
          reply.code(404);
          return { error: 'TLB manager not found' };
        }
        
        return { success: true, engineId, type, rps };
      } catch (error) {
        reply.code(500);
        return { error: 'Failed to update RPS' };
      }
    });

    // 热插拔：添加引擎
    fastify.post('/engine/:type/:engineId/add', async (request, reply) => {
      const { type, engineId } = request.params as { type: string; engineId: string };
      const { rps = 10 } = request.body as { rps?: number };
      
      try {
        if (type === 'search' && searchTLBManager) {
          searchTLBManager.hotSwapAddEngine(engineId, rps);
        } else if (type === 'translate' && translateTLBManager) {
          translateTLBManager.hotSwapAddEngine(engineId, rps);
        } else {
          reply.code(404);
          return { error: 'TLB manager not found' };
        }
        
        return { success: true, engineId, type, rps };
      } catch (error) {
        reply.code(500);
        return { error: 'Failed to add engine' };
      }
    });

    // 热插拔：移除引擎
    fastify.delete('/engine/:type/:engineId', async (request, reply) => {
      const { type, engineId } = request.params as { type: string; engineId: string };
      
      try {
        if (type === 'search' && searchTLBManager) {
          searchTLBManager.hotSwapRemoveEngine(engineId);
        } else if (type === 'translate' && translateTLBManager) {
          translateTLBManager.hotSwapRemoveEngine(engineId);
        } else {
          reply.code(404);
          return { error: 'TLB manager not found' };
        }
        
        return { success: true, engineId, type };
      } catch (error) {
        reply.code(500);
        return { error: 'Failed to remove engine' };
      }
    });
    
  }, { prefix: '/v1/tlb' });
}
