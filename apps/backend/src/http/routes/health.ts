import { PrismaClient } from '@prisma/client';
import { ClickhouseWriter } from '../../logging/ClickhouseWriter';
import { ExtendedFastifyInstance } from '../../types/extensions';

export async function registerHealthRoutes(app: ExtendedFastifyInstance, deps: { prisma?: PrismaClient; clickhouse?: ClickhouseWriter }) {
  app.get('/healthz', async () => ({ ok: true }));

  app.get('/readyz', async () => {
    // Best-effort readiness checks
    const checks: Record<string, boolean> = {};
    if (deps.prisma) {
      try {
        await deps.prisma.$queryRaw`SELECT 1`;
        checks.postgres = true;
      } catch {
        checks.postgres = false;
      }
    }
    if (deps.clickhouse) {
      try {
        // 简单检查：尝试查询系统表
        // 使用类型断言访问私有属性
        await (deps.clickhouse as any).client.query({ query: 'SELECT 1', format: 'JSONEachRow' });
        checks.clickhouse = true;
      } catch {
        checks.clickhouse = false;
      }
    }
    return { ok: Object.values(checks).every((x) => x !== false), checks };
  });
}


