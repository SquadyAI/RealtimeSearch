import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

class PromMetrics {
  public readonly registry: Registry;
  private readonly totalRequests: Counter<string>;
  private readonly engineSuccess: Counter<string>;
  private readonly engineFailure: Counter<string>;
  private readonly engineLatencyMs: Histogram<string>;

  constructor() {
    this.registry = new Registry();
    collectDefaultMetrics({ register: this.registry });

    this.totalRequests = new Counter({
      name: 'search_requests_total',
      help: 'Total search requests',
      registers: [this.registry],
    });

    this.engineSuccess = new Counter({
      name: 'search_engine_success_total',
      help: 'Success count per engine',
      labelNames: ['engine'],
      registers: [this.registry],
    });

    this.engineFailure = new Counter({
      name: 'search_engine_failure_total',
      help: 'Failure count per engine',
      labelNames: ['engine'],
      registers: [this.registry],
    });

    this.engineLatencyMs = new Histogram({
      name: 'search_engine_latency_ms',
      help: 'Engine latency in milliseconds',
      labelNames: ['engine'],
      buckets: [50, 100, 200, 500, 1000, 2000, 5000, 10000],
      registers: [this.registry],
    });
  }

  recordSuccess(engine: string, latencyMs: number) {
    this.totalRequests.inc();
    this.engineSuccess.labels(engine).inc();
    this.engineLatencyMs.labels(engine).observe(latencyMs);
  }

  recordFailure(engine: string, latencyMs?: number) {
    this.totalRequests.inc();
    this.engineFailure.labels(engine).inc();
    if (typeof latencyMs === 'number') {
      this.engineLatencyMs.labels(engine).observe(latencyMs);
    }
  }
}

export const promMetrics = new PromMetrics();


