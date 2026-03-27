import { ExtendedFastifyInstance } from '../../types/extensions';

export async function registerMonitoringRoutes(app: ExtendedFastifyInstance, deps: {
  clickhouse?: any;
  metrics?: any;
}) {
  const { clickhouse: ch, metrics } = deps;

  // 获取最近的日志
  app.get('/v1/admin/logs/recent', async (req: any) => {
    if (!ch) return { error: 'clickhouse not configured' };
    const limit = Math.min(Number((req.query as { limit?: string })?.limit || 50), 200);
    const rows = await ch.recent(limit);
    return { rows };
  });

  // 获取统计摘要
  app.get('/v1/admin/stats/summary', async () => {
    if (ch) {
      return ch.summary();
    }
    return metrics?.snapshot ? metrics.snapshot() : { ok: true };
  });
}
