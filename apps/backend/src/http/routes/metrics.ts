import { MetricsRegistry } from '../../metrics/Metrics';

export async function registerMetricsRoutes(app: any, deps: { metrics: MetricsRegistry }) {
  const { metrics } = deps;
  app.get('/metrics', async (req: any, reply: any) => {
    const accept = String(req.headers['accept'] || '');
    const text = metrics.toPrometheus();
    if (accept.includes('text/plain') || accept.includes('prometheus')) {
      reply.header('content-type', 'text/plain; version=0.0.4');
      return text;
    }
    return metrics.snapshot();
  });
}


