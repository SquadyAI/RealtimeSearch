import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { ServiceConfig, AuthUser } from '../../types';
import { ExtendedFastifyInstance } from '../../types/extensions';
import { TokenBlacklist } from '../../utils/TokenBlacklist';

export async function registerAuthRoutes(app: ExtendedFastifyInstance, deps: { prisma?: PrismaClient; config: ServiceConfig; tokenBlacklist?: TokenBlacklist }) {
  const { prisma, config, tokenBlacklist } = deps;

  // 确保Prisma数据库已配置
  if (!prisma) {
    throw new Error('Database (Prisma) not configured - all user data must be stored in database');
  }

  app.get('/v1/auth/bootstrap-status', async () => {
    try {
      // 使用Prisma数据库检查用户数量
      const userCount = await prisma.user.count();

      const bootstrapRequired = userCount === 0;

      if (bootstrapRequired) {
        // 如果需要引导，返回引导信息
        return {
          bootstrapRequired: true,
          signupAllowed: true,
          message: '系统需要初始化，请创建第一个管理员账号',
          redirectTo: '/setup'
        };
      } else {
        // 如果不需要引导，返回正常状态
        return {
          bootstrapRequired: false,
          signupAllowed: !!config.authAllowSignup,
          message: '系统已初始化',
          redirectTo: null
        };
      }
    } catch (error) {
      // 如果检查失败，假设不需要引导
      return {
        bootstrapRequired: false,
        signupAllowed: !!config.authAllowSignup,
        message: '状态检查失败',
        redirectTo: null
      };
    }
  });

  // 初次部署时的管理员注册接口
  app.post('/v1/auth/register', async (req: any, reply: any) => {
    const { username, password, role } = req.body as { username?: string; password?: string; role?: string } || {};
    if (!username || !password) {
      reply.code(400);
      return { error: '用户名和密码不能为空' };
    }

    // 检查是否已有用户存在
    const existingCount = await prisma.user.count();

    // 只有在没有用户存在时才允许注册（初次部署）
    const isBootstrap = existingCount === 0;
    if (!isBootstrap) {
      reply.code(403);
      return { error: '系统已初始化，无法创建新用户' };
    }

    // 检查用户名是否已存在
    const existingUser = await prisma.user.findUnique({ where: { username } });
    if (existingUser) {
      reply.code(409);
      return { error: '用户名已存在' };
    }

    // 初次部署时，第一个用户必须是管理员
    const userRole: 'user' | 'admin' = 'admin';
    const hash = bcrypt.hashSync(password, 10);

    try {
      // 使用Prisma数据库创建用户
      const created = await prisma.user.create({ data: { username, passwordHash: hash, role: userRole } });
      return { ok: true, user: { id: created.id, username: created.username, role: created.role } };
    } catch (e) {
      console.error('创建用户失败:', e);
      reply.code(500);
      return { error: '创建用户失败，请重试' };
    }
  });

  app.post(
    '/v1/auth/login',
    async (req: any, reply: any) => {
      const { username, password } = req.body as { username?: string; password?: string } || {};
      if (!username || !password) {
        reply.code(400);
        return { error: '用户名和密码不能为空' };
      }

      // 使用Prisma数据库查找用户
      const user = await prisma.user.findUnique({ where: { username } });

      if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
        reply.code(401);
        return { error: '用户名或密码错误' };
      }

      // 生成JWT Token
      const token = jwt.sign(
        { sub: user.id, username: user.username, role: user.role },
        config.authJwtSecret,
        { expiresIn: (config.authJwtExpires as any) || '7d' }
      );

      try {
        // 将JWT Token存储到ApiToken表中，作为用户的登录凭证
        const apiToken = await prisma.apiToken.create({
          data: {
            userId: user.id,
            name: `登录Token - ${new Date().toLocaleString('zh-CN')}`,
            token: token, // 存储JWT Token
            permissions: user.role === 'admin' ? 'admin' : 'write', // 根据用户角色设置权限
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7天后过期
          },
        });

        console.log(`✅ 用户 ${username} 登录成功，JWT Token已存储到数据库，ID: ${apiToken.id}`);
      } catch (error) {
        console.error('❌ 存储JWT Token到数据库失败:', error);
        console.error('详细错误信息:', JSON.stringify(error, null, 2));
        // 存储失败时，仍然返回Token给用户，但记录错误
      }

      return { token, user: { id: user.id, username: user.username, role: user.role } };
    }
  );

  app.post(
    '/v1/auth/signup',
    async (req: any, reply: any) => {
      const { username, password, role } = req.body as { username?: string; password?: string; role?: string } || {};
      if (!username || !password) {
        reply.code(400);
        return { error: '用户名和密码不能为空' };
      }

      // 检查是否已有用户存在
      const existingCount = await prisma.user.count();

      // 初次部署时，第一个用户必须是管理员
      const isBootstrap = existingCount === 0;
      
      // 如果系统已初始化且不允许注册，则拒绝
      if (!isBootstrap && !config.authAllowSignup) {
        reply.code(403);
        return { error: '注册功能已禁用' };
      }

      // 角色分配逻辑：
      // 1. 第一个用户（bootstrap）自动成为管理员
      // 2. 后续用户根据配置和请求分配角色
      let userRole: 'user' | 'admin';
      if (isBootstrap) {
        userRole = 'admin'; // 第一个用户必须是管理员
      } else if (role === 'admin') {
        // 如果请求指定了admin角色，检查是否允许
        if (!config.authAllowSignup) {
          reply.code(403);
          return { error: '不允许创建管理员账号' };
        }
        userRole = 'admin';
      } else {
        userRole = 'user'; // 默认创建普通用户
      }
      const hash = bcrypt.hashSync(password, 10);

      try {
        // 使用Prisma数据库创建用户
        const created = await prisma.user.create({ data: { username, passwordHash: hash, role: userRole } });
        return { ok: true, user: { id: created.id, username: created.username, role: created.role } };
      } catch (e) {
        reply.code(409);
        return { error: '用户名已存在' };
      }
    }
  );

  app.get('/v1/auth/me', async (req: any, reply: any) => {
    const u = (req as any).user as AuthUser | undefined;
    if (!u) {
      reply.code(401);
      return { error: '未授权访问' };
    }

    // 验证用户是否仍然存在于数据库中
    try {
      const user = await prisma.user.findUnique({ where: { id: u.id } });
      if (!user) {
        reply.code(401);
        return { error: '用户不存在或已被删除' };
      }
    } catch (error) {
      reply.code(401);
      return { error: '用户验证失败' };
    }

    return { user: u };
  });

  // 检查Token有效性并自动登录
  app.post('/v1/auth/check-token', async (req: any, reply: any) => {
    const { token } = req.body as { token?: string }
    
    if (!token) {
      reply.code(400)
      return { error: 'Token不能为空' }
    }
    
    try {
      // 首先尝试从ApiToken表中查找这个Token
      const apiToken = await prisma.apiToken.findUnique({
        where: { token },
        include: { user: true }
      })
      
      if (apiToken && apiToken.user) {
        // 检查Token是否过期
        if (apiToken.expiresAt && new Date() > new Date(apiToken.expiresAt)) {
          reply.code(401)
          return { error: 'Token已过期' }
        }
        
        // 更新最后使用时间
        await prisma.apiToken.update({
          where: { id: apiToken.id },
          data: { lastUsedAt: new Date() }
        })
        
        // 生成新的JWT Token
        const newJwtToken = jwt.sign(
          { sub: apiToken.user.id, username: apiToken.user.username, role: apiToken.user.role },
          config.authJwtSecret,
          { expiresIn: (config.authJwtExpires as any) || '7d' }
        )
        
        return { 
          success: true,
          token: newJwtToken,
          user: { 
            id: apiToken.user.id, 
            username: apiToken.user.username, 
            role: apiToken.user.role 
          }
        }
      }
      
      // 如果ApiToken表中没有找到，尝试JWT验证
      try {
        const payload: any = jwt.verify(token, config.authJwtSecret)
        if (payload && payload.sub) {
          // 验证用户是否仍然存在
          const user = await prisma.user.findUnique({ where: { id: payload.sub } })
          if (user) {
            // 生成新的JWT Token
            const newJwtToken = jwt.sign(
              { sub: user.id, username: user.username, role: user.role },
              config.authJwtSecret,
              { expiresIn: (config.authJwtExpires as any) || '7d' }
            )
            
            return { 
              success: true,
              token: newJwtToken,
              user: { id: user.id, username: user.username, role: user.role }
            }
          }
        }
      } catch (jwtError) {
        // JWT验证失败，继续检查
      }
      
      reply.code(401)
      return { error: 'Token无效' }
      
    } catch (error) {
      console.error('Token检查失败:', error)
      reply.code(500)
      return { error: '服务器错误' }
    }
  })

  // 登出接口 - 将token加入黑名单
  app.post('/v1/auth/logout', async (req: any, reply: any) => {
    const authHeader = String(req.headers['authorization'] || '').trim();
    
    if (!authHeader.toLowerCase().startsWith('bearer ')) {
      reply.code(400);
      return { error: '需要提供Authorization header' };
    }

    const token = authHeader.slice(7).trim();
    
    if (!token) {
      reply.code(400);
      return { error: 'Token不能为空' };
    }

    try {
      // 验证token有效性
      let user: any = null;
      
      // 尝试JWT验证
      try {
        const payload: any = jwt.verify(token, config.authJwtSecret);
        if (payload && payload.sub) {
          if (prisma) {
            user = await prisma.user.findUnique({
              where: { id: payload.sub },
              select: { id: true, username: true, role: true }
            });
          }
        }
      } catch (jwtError) {
        // JWT验证失败，尝试ApiToken验证
        if (prisma) {
          const apiToken = await prisma.apiToken.findUnique({
            where: { token },
            include: { user: true }
          });
          if (apiToken && apiToken.user) {
            user = apiToken.user;
          }
        }
      }

      if (!user) {
        reply.code(401);
        return { error: 'Token无效' };
      }

      // 将token加入黑名单
      if (tokenBlacklist) {
        await tokenBlacklist.blacklistToken(token, user.id, user.username, 'logout');
        console.log(`✅ 用户 ${user.username} 的token已加入黑名单`);
      }

      // 如果是从ApiToken表验证的，删除该记录
      if (prisma) {
        try {
          await prisma.apiToken.deleteMany({
            where: { token }
          });
        } catch (error) {
          console.warn('删除ApiToken记录失败:', error);
        }
      }

      return { 
        success: true, 
        message: '登出成功，token已失效',
        user: { id: user.id, username: user.username, role: user.role }
      };
      
    } catch (error) {
      console.error('登出失败:', error);
      reply.code(500);
      return { error: '服务器错误' };
    }
  });

  // 撤销指定用户的token（管理员功能）
  app.post('/v1/auth/revoke-user-tokens', async (req: any, reply: any) => {
    const { userId, reason = 'revoked' } = req.body as { userId: string; reason?: string };
    
    if (!userId) {
      reply.code(400);
      return { error: '用户ID不能为空' };
    }

    // 检查当前用户是否有管理员权限
    const currentUser = (req as any).user as AuthUser | undefined;
    if (!currentUser || currentUser.role !== 'admin') {
      reply.code(403);
      return { error: '需要管理员权限' };
    }

    try {
      if (!prisma) {
        reply.code(500);
        return { error: '数据库未配置' };
      }

      // 获取用户信息
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true, role: true }
      });

      if (!user) {
        reply.code(404);
        return { error: '用户不存在' };
      }

      // 获取用户的所有ApiToken
      const apiTokens = await prisma.apiToken.findMany({
        where: { userId },
        select: { token: true }
      });

      // 将所有token加入黑名单
      if (tokenBlacklist) {
        for (const apiToken of apiTokens) {
          await tokenBlacklist.blacklistToken(
            apiToken.token, 
            user.id, 
            user.username, 
            reason as any
          );
        }
      }

      // 删除所有ApiToken记录
      await prisma.apiToken.deleteMany({
        where: { userId }
      });

      console.log(`✅ 管理员 ${currentUser.username} 撤销了用户 ${user.username} 的所有token`);

      return { 
        success: true, 
        message: `已撤销用户 ${user.username} 的所有token`,
        revokedCount: apiTokens.length
      };
      
    } catch (error) {
      console.error('撤销用户token失败:', error);
      reply.code(500);
      return { error: '服务器错误' };
    }
  });
}


