import { ExtendedFastifyInstance } from '../../types/extensions';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

export async function registerApiTokenRoutes(app: ExtendedFastifyInstance, deps: {
  prisma?: PrismaClient;
}) {
  const { prisma } = deps;

  if (!prisma) {
    console.warn('Prisma not configured - API tokens will not be available');
    return;
  }

  // 生成安全的API token
  function generateApiToken(): string {
    return 'rt_' + crypto.randomBytes(32).toString('hex');
  }

  // 创建API token
  app.post('/v1/admin/api-tokens/create', async (req: any, reply: any) => {
    const { name, permissions, expiresAt } = req.body as {
      name?: string;
      permissions?: 'read' | 'write' | 'admin';
      expiresAt?: string;
    };

    if (!name || !permissions) {
      reply.code(400);
      return { error: '名称和权限都是必需的' };
    }

    if (!['read', 'write', 'admin'].includes(permissions)) {
      reply.code(400);
      return { error: '权限必须是read、write或admin' };
    }

    const user = (req as any).user;
    if (!user) {
      reply.code(401);
      return { error: '未授权' };
    }

    try {
      const token = generateApiToken();
      const expiresAtDate = expiresAt ? new Date(expiresAt) : null;

      const apiToken = await prisma.apiToken.create({
        data: {
          userId: user.id,
          name,
          token,
          permissions: permissions as any,
          expiresAt: expiresAtDate,
        },
      });

      return {
        success: true,
        message: 'API token创建成功',
        data: {
          id: apiToken.id,
          name: apiToken.name,
          token: apiToken.token, // 只在创建时返回一次
          permissions: apiToken.permissions,
          expiresAt: apiToken.expiresAt,
          createdAt: apiToken.createdAt,
        },
      };
    } catch (error: any) {
      console.error('Create API token error:', error);
      reply.code(500);
      return { error: '创建API token失败: ' + (error?.message || String(error)) };
    }
  });

  // 列出用户的API tokens
  app.get('/v1/admin/api-tokens/list', async (req: any, reply: any) => {
    const user = (req as any).user;
    if (!user) {
      reply.code(401);
      return { error: '未授权' };
    }

    try {
      const tokens = await prisma.apiToken.findMany({
        where: { userId: user.id },
        select: {
          id: true,
          name: true,
          permissions: true,
          expiresAt: true,
          lastUsedAt: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      return {
        success: true,
        data: tokens,
      };
    } catch (error: any) {
      console.error('List API tokens error:', error);
      reply.code(500);
      return { error: '获取API tokens失败: ' + (error?.message || String(error)) };
    }
  });

  // 删除API token - 使用POST方法避免路由参数问题
  app.post('/v1/admin/api-tokens/delete', async (req: any, reply: any) => {
    const { tokenId } = req.body as { tokenId?: string };
    const user = (req as any).user;

    console.log('删除API Token请求:', { 
      tokenId, 
      userId: user?.id,
      body: req.body
    });

    if (!user) {
      reply.code(401);
      return { error: '未授权' };
    }

    if (!tokenId) {
      reply.code(400);
      return { error: 'Token ID是必需的' };
    }

    try {
      const token = await prisma.apiToken.findFirst({
        where: { id: tokenId, userId: user.id },
      });

      console.log('查找到的Token:', token);

      if (!token) {
        reply.code(404);
        return { error: 'API token不存在或不属于当前用户' };
      }

      await prisma.apiToken.delete({
        where: { id: tokenId },
      });

      console.log('Token删除成功:', tokenId);

      return {
        success: true,
        message: 'API token删除成功',
      };
    } catch (error: any) {
      console.error('Delete API token error:', error);
      reply.code(500);
      return { error: '删除API token失败: ' + (error?.message || String(error)) };
    }
  });

  // 验证API token（用于测试）
  app.post('/v1/admin/api-tokens/verify', async (req: any, reply: any) => {
    const { token } = req.body as { token?: string };

    if (!token) {
      reply.code(400);
      return { error: 'token是必需的' };
    }

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

      if (!apiToken) {
        reply.code(401);
        return { error: '无效的API token' };
      }

      // 检查是否过期
      if (apiToken.expiresAt && apiToken.expiresAt < new Date()) {
        reply.code(401);
        return { error: 'API token已过期' };
      }

      // 更新最后使用时间
      await prisma.apiToken.update({
        where: { token },
        data: { lastUsedAt: new Date() },
      });

      return {
        success: true,
        message: 'API token验证成功',
        data: {
          id: apiToken.id,
          name: apiToken.name,
          permissions: apiToken.permissions,
          user: apiToken.user,
          expiresAt: apiToken.expiresAt,
          lastUsedAt: apiToken.lastUsedAt,
        },
      };
    } catch (error: any) {
      console.error('Verify API token error:', error);
      reply.code(500);
      return { error: '验证API token失败: ' + (error?.message || String(error)) };
    }
  });
}

