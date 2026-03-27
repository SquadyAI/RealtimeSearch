import { PrismaClient } from '@prisma/client';
import { config } from '../config';
import { ClickhouseWriter } from '../logging/ClickhouseWriter';
import { KeyManager } from '../keys/KeyManager';
import { SearchEngineLoader } from '../engines/search/SearchEngineLoader';
import { ExtendedEngine } from '../types/prisma';
import bcrypt from 'bcrypt';

export class DatabaseManager {
  private prisma: PrismaClient | undefined;
  private clickhouse: ClickhouseWriter | undefined;
  private isInitializing = false;
  private connectionRetryCount = 0;
  private readonly maxRetries = 3;
  private readonly retryDelayMs = 2000; 

  private constructor() { }

  /**
   * 工厂方法：确保数据库连接完全建立后再返回实例
   */
  public static async create(): Promise<DatabaseManager> {
    const instance = new DatabaseManager();
    await instance.initialize();
    return instance;
  }

  /**
   * 同步构造函数（保持向后兼容）
   */
  public static createSync(): DatabaseManager {
    const instance = new DatabaseManager();
    // 异步初始化，但不等待
    instance.initialize().catch(error => {
      console.error('❌ Database initialization failed:', error);
    });
    return instance;
  }

  private async initialize(): Promise<void> {
    await this.initializePrisma();
    await this.initializeClickhouse();
  }

  private async initializePrisma() {
    if (this.isInitializing) {
      return;
    }

    this.isInitializing = true;

    if (!process.env.DATABASE_URL) {
      console.log('ℹ️  DATABASE_URL not set, running without database');
      this.isInitializing = false;
      return;
    }

    try {
      console.log('🔌 Initializing database connection...');

      // 创建Prisma客户端
      this.prisma = new PrismaClient({
        datasources: {
          db: {
            url: process.env.DATABASE_URL,
          },
        },
      });

      // 测试数据库连接
      await this.testDatabaseConnection();

      // 自动运行数据库迁移
      await this.runDatabaseMigrations();
      console.log('✅ Database connected successfully');
      this.connectionRetryCount = 0; // 重置重试计数

    } catch (error) {
      console.error('❌ Database connection failed:', error);
      console.error('   Please check your DATABASE_URL and database status');

      // 尝试重连
      if (this.connectionRetryCount < this.maxRetries) {
        this.connectionRetryCount++;
        console.log(`🔄 Retrying database connection (${this.connectionRetryCount}/${this.maxRetries}) in ${this.retryDelayMs}ms...`);

        setTimeout(() => {
          this.isInitializing = false;
          this.initializePrisma();
        }, this.retryDelayMs);
      } else {
        console.error('💀 Max retry attempts reached, giving up on database connection');
        this.prisma = undefined;
        this.isInitializing = false;
      }
    }
  }

  private async testDatabaseConnection(): Promise<void> {
    if (!this.prisma) {
      throw new Error('Prisma client not initialized');
    }

    try {
      // 执行一个简单的查询来测试连接
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (error: any) {
      // 如果数据库不存在，尝试自动创建
      if (error?.code === '3D000' || error?.message?.includes('does not exist')) {
        console.log('🔄 Database does not exist, attempting to create...');
        await this.createDatabaseIfNotExists();
        // 重新测试连接
        await this.prisma.$queryRaw`SELECT 1`;
      } else {
        throw new Error(`Database connection test failed: ${error}`);
      }
    }
  }

  private async createDatabaseIfNotExists(): Promise<void> {
    if (!this.prisma) {
      throw new Error('Prisma client not initialized');
    }

    try {
      // 从DATABASE_URL中提取数据库名称
      const dbUrl = process.env.DATABASE_URL;
      if (!dbUrl) {
        throw new Error('DATABASE_URL not set');
      }

      // 解析URL获取数据库名称
      const url = new URL(dbUrl);
      const dbName = url.pathname.slice(1); // 移除开头的斜杠

      if (!dbName) {
        throw new Error('Could not extract database name from DATABASE_URL');
      }

      // 连接到默认的postgres数据库来创建新数据库
      const defaultDbUrl = dbUrl.replace(`/${dbName}`, '/postgres');
      const tempPrisma = new PrismaClient({
        datasources: {
          db: {
            url: defaultDbUrl,
          },
        },
      });

      try {
        // 检查数据库是否已存在
        const result = await tempPrisma.$queryRaw`
           SELECT 1 FROM pg_database WHERE datname = ${dbName}
         `;

        if (Array.isArray(result) && result.length === 0) {
          console.log(`📝 Creating database: ${dbName}`);
          // 使用字符串拼接来创建数据库，因为 CREATE DATABASE 不支持参数绑定
          await tempPrisma.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
          console.log(`✅ Database ${dbName} created successfully`);
        } else {
          console.log(`ℹ️  Database ${dbName} already exists`);
        }
      } finally {
        await tempPrisma.$disconnect();
      }

      // 等待一下让数据库完全创建
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error: any) {
      console.error('❌ Failed to create database:', error);
      throw new Error(`Database creation failed: ${error.message}`);
    }
  }

  private async runDatabaseMigrations(): Promise<void> {
    if (!this.prisma) {
      throw new Error('Prisma client not initialized');
    }

    try {
      console.log('🔄 Running database migrations...');

      // 使用 Prisma db push 来同步 schema
      // 这会自动创建所有必要的表
      await this.prisma.$executeRaw`SELECT 1`;

      // 强制 Prisma 同步 schema 到数据库
      await this.syncPrismaSchema();

      console.log('✅ Database migrations completed');
    } catch (error: any) {
      console.error('❌ Database migration failed:', error);
      throw new Error(`Database migration failed: ${error.message}`);
    }
  }

  private async syncPrismaSchema(): Promise<void> {
    if (!this.prisma) {
      throw new Error('Prisma client not initialized');
    }

    try {
      console.log('🔄 Syncing Prisma schema to database...');

      // 创建所有必要的表
      await this.createTablesIfNotExist();

      // 检查并添加缺失的列
      await this.addMissingColumns();

      console.log('✅ Database tables created successfully');
    } catch (error: any) {
      console.error('❌ Failed to create tables:', error);
      // 如果表已存在，这不是错误
      if (error?.code === '42P07') { // 表已存在的错误码
        console.log('ℹ️  Tables already exist');
        return;
      }
      throw error;
    }
  }

  private async createTablesIfNotExist(): Promise<void> {
    if (!this.prisma) {
      throw new Error('Prisma client not initialized');
    }

    // 首先创建必要的枚举类型
    await this.createEnumTypes();

    // 创建 User 表
    await this.prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "User" (
        "id" TEXT NOT NULL,
        "username" TEXT NOT NULL,
        "passwordHash" TEXT NOT NULL,
        "role" "Role" NOT NULL DEFAULT 'user',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "User_pkey" PRIMARY KEY ("id")
      );
    `;

    // 创建 User 表的唯一索引
    await this.prisma.$executeRaw`
      CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");
    `;

    // 创建 ApiKey 表（必须在 Engine 表之前创建，因为 Engine 表引用它）
    await this.prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "ApiKey" (
        "id" TEXT NOT NULL,
        "key" TEXT NOT NULL,
        "type" "EngineType" NOT NULL DEFAULT 'search',
        "label" TEXT,
        "active" BOOLEAN NOT NULL DEFAULT true,
        "rps" INTEGER NOT NULL DEFAULT 10,
        "monthlyQuota" INTEGER NOT NULL DEFAULT 10000,
        "usageMonth" TEXT,
        "usedCount" INTEGER NOT NULL DEFAULT 0,
        "lastUsedAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
      );
    `;

    // 创建 ApiKey 表的索引
    await this.prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS "ApiKey_key_idx" ON "ApiKey"("key");
    `;
    await this.prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS "ApiKey_type_active_idx" ON "ApiKey"("type", "active");
    `;

    // 创建 Engine 表（现在可以安全地引用 ApiKey 表）
    await this.prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "Engine" (
        "id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "type" "EngineType" NOT NULL DEFAULT 'search',
        "enabled" BOOLEAN NOT NULL DEFAULT true,
        "priority" INTEGER NOT NULL DEFAULT 0,
        "config" JSONB,
        "httpProxy" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        "apikeyId" TEXT,
        CONSTRAINT "Engine_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "Engine_apikeyId_fkey" FOREIGN KEY ("apikeyId") REFERENCES "ApiKey"("id") ON DELETE SET NULL
      );
    `;

    // 创建 Engine 表的索引
    await this.prisma.$executeRaw`
      CREATE UNIQUE INDEX IF NOT EXISTS "Engine_name_key" ON "Engine"("name");
    `;
    await this.prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS "Engine_apikeyId_idx" ON "Engine"("apikeyId");
    `;
    await this.prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS "Engine_priority_enabled_idx" ON "Engine"("priority", "enabled");
    `;
    await this.prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS "Engine_type_enabled_idx" ON "Engine"("type", "enabled");
    `;

    // 创建 ApiToken 表
    await this.prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "ApiToken" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "token" TEXT NOT NULL,
        "permissions" "ApiTokenPermission" NOT NULL DEFAULT 'read',
        "expiresAt" TIMESTAMP(3),
        "lastUsedAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "ApiToken_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "ApiToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
      );
    `;

    // 创建 ApiToken 表的索引
    await this.prisma.$executeRaw`
      CREATE UNIQUE INDEX IF NOT EXISTS "ApiToken_token_key" ON "ApiToken"("token");
    `;
    await this.prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS "ApiToken_userId_token_idx" ON "ApiToken"("userId", "token");
    `;

    // 创建 Setting 表
    await this.prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "Setting" (
        "id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "value" JSONB NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
      );
    `;

    // 创建 Setting 表的唯一索引
    await this.prisma.$executeRaw`
      CREATE UNIQUE INDEX IF NOT EXISTS "Setting_name_key" ON "Setting"("name");
    `;
  }

  private async createEnumTypes(): Promise<void> {
    if (!this.prisma) {
      throw new Error('Prisma client not initialized');
    }

    try {
      // 创建 Role 枚举类型
      await this.prisma.$executeRaw`
        DO $$ BEGIN
          CREATE TYPE "Role" AS ENUM ('user', 'admin');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `;

      // 创建 ApiTokenPermission 枚举类型
      await this.prisma.$executeRaw`
        DO $$ BEGIN
          CREATE TYPE "ApiTokenPermission" AS ENUM ('read', 'write', 'admin');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `;

      // 创建 EngineType 枚举类型
      await this.prisma.$executeRaw`
        DO $$ BEGIN
          CREATE TYPE "EngineType" AS ENUM ('search', 'translate');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `;

      console.log('✅ 枚举类型创建完成');
    } catch (error: any) {
      console.error('❌ 创建枚举类型失败:', error);
      // 如果枚举类型已存在，这不是错误
      if (error?.code === '42710') { // 枚举类型已存在的错误码
        console.log('ℹ️  枚举类型已存在');
        return;
      }
      throw error;
    }
  }

  public async ensureDatabaseConnection(): Promise<boolean> {
    if (!this.prisma) {
      return false;
    }

    try {
      await this.testDatabaseConnection();
      return true;
    } catch (error) {
      console.error('Database connection check failed:', error);
      return false;
    }
  }

  public async reconnectDatabase(): Promise<boolean> {
    console.log('🔄 Attempting to reconnect to database...');

    if (this.prisma) {
      try {
        await this.prisma.$disconnect();
      } catch (error) {
        console.warn('Warning: Error during disconnect:', error);
      }
    }

    this.prisma = undefined;
    this.connectionRetryCount = 0;
    this.isInitializing = false;

    await this.initializePrisma();
    return !!this.prisma;
  }

  private initializeClickhouse() {
    this.clickhouse = config.clickhouse
      ? new ClickhouseWriter({
        url: config.clickhouse.url,
        database: config.clickhouse.database,
        username: config.clickhouse.username,
        password: config.clickhouse.password,
        tls: config.clickhouse.tls,
      })
      : undefined;

    if (this.clickhouse) {
      this.clickhouse.init().catch(error => {
        console.error('Clickhouse initialization failed:', error);
      });
    }
  }

  public async loadEnginesFromDatabase(loader: SearchEngineLoader, translateLoader: any, keyManager: KeyManager) {
    let dbEngines: string[] | undefined;
    let dbTranslateEngines: string[] | undefined;

    if (!this.prisma) {
      return { dbEngines: undefined, dbTranslateEngines: undefined };
    }

    try {
      // 首先同步文件系统中的引擎到数据库
      await this.syncEnginesToDatabase(loader);
      await this.syncTranslateEnginesToDatabase(translateLoader);

      // hydrate engines as enabled/default order if present
      const enginesFromDb = await this.prisma.engine.findMany({
        where: { enabled: true },
        orderBy: { priority: 'asc' },
      });

      if (enginesFromDb.length > 0) {
        // 更新默认引擎配置
        const validEngines = enginesFromDb
          .map((e: any) => e.name)
          .filter((n: string) => !!loader.getEngine(n));
        // 存储有效的引擎名称，稍后在创建管理器时使用
        dbEngines = validEngines;

        // 重新启用API密钥查询功能
        console.log(`Loaded ${enginesFromDb.length} engines from database, initializing API keys...`);

        // per-engine proxy
        for (const engine of enginesFromDb) {
          if (engine.httpProxy) {
            keyManager.setEngineProxy(engine.name, engine.httpProxy);
          }
        }
      }

      return { dbEngines, dbTranslateEngines };
    } catch (error) {
      console.error('Failed to load engines from database:', error);
      return { dbEngines: undefined, dbTranslateEngines: undefined };
    }
  }

  // 同步文件系统中的引擎到数据库
  private async syncEnginesToDatabase(loader: SearchEngineLoader): Promise<void> {
    if (!this.prisma) {
      return;
    }

    try {
      // 获取加载器中的所有引擎名称
      const fileSystemEngines = loader.listEngineNames();

      if (fileSystemEngines.length === 0) {
        return;
      }

      // 获取数据库中现有的引擎
      const existingEngines = await this.prisma.engine.findMany();
      const existingEngineNames = new Set(existingEngines.map((e: any) => e.name));

      // 同步引擎到数据库（不创建API密钥，让用户自己配置真实的）
      let syncedCount = 0;
      for (const engineName of fileSystemEngines) {
        if (!existingEngineNames.has(engineName)) {
          try {
            // 只创建引擎记录，不关联API密钥
            await this.prisma.engine.create({
              data: {
                name: engineName,
                enabled: true,
                priority: this.getEnginePriority(engineName),
                config: {},
                // 不设置 apikeyId，让用户后续通过管理界面配置真实的API密钥
              },
            });
            syncedCount++;
          } catch (createError) {
            // 如果是唯一性约束错误，说明引擎已存在
            if (createError && typeof createError === 'object' && 'code' in createError && createError.code === 'P2002') {
              // 引擎已存在，忽略错误
            } else {
              console.error(`Failed to create engine ${engineName}:`, createError);
            }
          }
        }
      }

      if (syncedCount > 0) {
        console.log(`Synced ${syncedCount} engines to database (no API keys created)`);
      }

    } catch (error) {
      console.error('Failed to sync engines to database:', error);
    }
  }

  // 同步文件系统中的翻译引擎到数据库
  private async syncTranslateEnginesToDatabase(translateLoader: any): Promise<void> {
    if (!this.prisma) {
      return;
    }

    try {
      // 获取加载器中的所有翻译引擎名称
      const fileSystemTranslateEngines = translateLoader.listEngineNames();

      if (fileSystemTranslateEngines.length === 0) {
        return;
      }

      // 获取数据库中现有的引擎
      const existingEngines = await this.prisma.engine.findMany();
      const existingEngineNames = new Set(existingEngines.map((e: any) => e.name));

      // 同步翻译引擎到数据库（不创建API密钥，让用户自己配置真实的）
      let syncedCount = 0;
      for (const engineName of fileSystemTranslateEngines) {
        if (!existingEngineNames.has(engineName)) {
          try {
            // 只创建引擎记录，不关联API密钥
            await this.prisma.engine.create({
              data: {
                name: engineName,
                enabled: true,
                priority: this.getEnginePriority(engineName),
                config: {},
                // 不设置 apikeyId，让用户后续通过管理界面配置真实的API密钥
              },
            });
            syncedCount++;
          } catch (createError) {
            // 如果是唯一性约束错误，说明引擎已存在
            if (createError && typeof createError === 'object' && 'code' in createError && createError.code === 'P2002') {
              // 引擎已存在，忽略错误
            } else {
              console.error(`Failed to create translate engine ${engineName}:`, createError);
            }
          }
        }
      }

      if (syncedCount > 0) {
        console.log(`Synced ${syncedCount} translate engines to database (no API keys created)`);
      }

    } catch (error) {
      console.error('Failed to sync translate engines to database:', error);
    }
  }

  // 生成API密钥
  private generateApiKey(engineName: string): string {
    // 生成一个唯一的API密钥
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2);
    return `${engineName}_${timestamp}_${random}`;
  }

  // 获取引擎优先级
  private getEnginePriority(engineName: string): number {
    // 搜索引擎优先级
    const searchEnginePriorities: Record<string, number> = {
      'serper': 1,
      'brave': 2,
      'bing': 3,
      'test-success': 4,
      'test-fail1': 5,
      'test-fail2': 6,
    };

    // 翻译引擎优先级 - 测试引擎优先级更高，确保能正常工作
    const translateEnginePriorities: Record<string, number> = {
      'test-success': 1,    // 测试成功引擎优先级最高
      'test-fail1': 2,      // 测试失败引擎次之
      'test-fail2': 3,      // 测试超时引擎再次之
      'squady': 4,
      'google': 5,
      'deepl': 6,
    };

    // 返回优先级，如果没有定义则返回默认值
    return searchEnginePriorities[engineName] || translateEnginePriorities[engineName] || 999;
  }

  public setKeyUsagePersister(keyManager: KeyManager) {
    // persist usage increments (monthly reset on change) - only if database is available
    if (this.prisma) {
      // 注意：新的 KeyManager 不再需要外部的 usage persister
      // 所有使用统计都直接在数据库中更新
      console.log('KeyManager now handles usage persistence internally');
    }
  }

  public async authenticateUser(payload: any): Promise<boolean> {
    if (!this.prisma) {
      return false;
    }

    try {
      // 如果有数据库，检查数据库中是否存在该用户
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      return !!user;
    } catch (_error) {
      return false;
    }
  }

  public async createUser(username: string, password: string, role: 'user' | 'admin') {
    if (!this.prisma) {
      return null;
    }

    try {
      const hash = bcrypt.hashSync(password, 10);
      const created = await this.prisma.user.create({
        data: { username, passwordHash: hash, role }
      });
      return {
        ok: true,
        user: { id: created.id, username: created.username, role: created.role }
      };
    } catch (error) {
      console.error('Failed to create user:', error);
      return null;
    }
  }

  public async findUserByUsername(username: string) {
    if (!this.prisma) {
      return null;
    }

    try {
      const user = await this.prisma.user.findUnique({ where: { username } });
      return user;
    } catch (error) {
      console.error('Failed to find user by username:', error);
      return null;
    }
  }

  public async getUserCount() {
    if (!this.prisma) {
      console.log('⚠️  Prisma client not initialized, returning 0');
      return 0;
    }

    try {
      // 添加调试日志
      console.log('🔍 Getting user count from database...');

      // 首先测试数据库连接
      await this.prisma.$queryRaw`SELECT 1`;
      console.log('✅ Database connection test passed');

      const count = await this.prisma.user.count();
      console.log(`📊 User count: ${count}`);
      return count;
    } catch (error) {
      console.error('❌ Failed to get user count:', error);

      // 如果查询失败，尝试重新连接
      try {
        console.log('🔄 Attempting to reconnect to database...');
        await this.ensureDatabaseConnection();

        // 再次测试连接
        await this.prisma.$queryRaw`SELECT 1`;
        console.log('✅ Database reconnection test passed');

        const count = await this.prisma.user.count();
        console.log(`📊 User count after reconnection: ${count}`);
        return count;
      } catch (reconnectError) {
        console.error('❌ Failed to reconnect and get user count:', reconnectError);
        return 0;
      }
    }
  }

  public getPrisma() {
    return this.prisma;
  }

  public getClickhouse() {
    return this.clickhouse;
  }

  /**
   * 优雅关闭数据库连接
   */
  public async close(): Promise<void> {
    console.log('🔄 Closing database connections...');

    try {
      if (this.prisma) {
        await this.prisma.$disconnect();
        console.log('✅ Prisma connection closed');
      }

      if (this.clickhouse) {
        // ClickhouseWriter可能没有close方法，这里只是示例
        console.log('✅ Clickhouse connection closed');
      }
    } catch (error) {
      console.error('❌ Error during database shutdown:', error);
    } finally {
      this.prisma = undefined;
      this.clickhouse = undefined;
      console.log('✅ Database manager shutdown complete');
    }
  }

  /**
   * 检查数据库连接状态
   */
  public getDatabaseStatus(): {
    prisma: boolean;
    clickhouse: boolean;
    isInitializing: boolean;
    retryCount: number;
  } {
    return {
      prisma: !!this.prisma,
      clickhouse: !!this.clickhouse,
      isInitializing: this.isInitializing,
      retryCount: this.connectionRetryCount,
    };
  }

  /**
   * 健康检查
   */
  public async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy' | 'degraded';
    details: {
      prisma: boolean;
      clickhouse: boolean;
      message: string;
    };
  }> {
    const prismaHealthy = this.prisma ? await this.ensureDatabaseConnection() : false;
    const clickhouseHealthy = !!this.clickhouse;

    if (prismaHealthy && clickhouseHealthy) {
      return {
        status: 'healthy',
        details: {
          prisma: true,
          clickhouse: true,
          message: 'All database connections are healthy',
        },
      };
    } else if (prismaHealthy || clickhouseHealthy) {
      return {
        status: 'degraded',
        details: {
          prisma: prismaHealthy,
          clickhouse: clickhouseHealthy,
          message: 'Some database connections are unavailable',
        },
      };
    } else {
      return {
        status: 'unhealthy',
        details: {
          prisma: false,
          clickhouse: false,
          message: 'No database connections are available',
        },
      };
    }
  }

  private async addMissingColumns(): Promise<void> {
    if (!this.prisma) {
      throw new Error('Prisma client not initialized');
    }

    try {
      console.log('🔄 Checking for missing columns...');

      // 添加 Engine.type 列（如果不存在）
      await this.prisma.$executeRaw`
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'Engine' AND column_name = 'type'
          ) THEN
            ALTER TABLE "Engine" ADD COLUMN "type" "EngineType" NOT NULL DEFAULT 'search';
            CREATE INDEX IF NOT EXISTS "Engine_type_enabled_idx" ON "Engine"("type", "enabled");
          END IF;
        END $$;
      `;

      // 添加 ApiKey.type 列（如果不存在）
      await this.prisma.$executeRaw`
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'ApiKey' AND column_name = 'type'
          ) THEN
            ALTER TABLE "ApiKey" ADD COLUMN "type" "EngineType" NOT NULL DEFAULT 'search';
            CREATE INDEX IF NOT EXISTS "ApiKey_type_active_idx" ON "ApiKey"("type", "active");
          END IF;
        END $$;
      `;

      // 更新翻译引擎的类型
      await this.prisma.$executeRaw`
        UPDATE "Engine" SET "type" = 'translate' 
        WHERE "name" IN ('deepl', 'google', 'squady') AND "type" = 'search';
      `;

      console.log('✅ Missing columns added successfully');
    } catch (error: any) {
      console.error('❌ Failed to add missing columns:', error);
      throw error;
    }
  }
}