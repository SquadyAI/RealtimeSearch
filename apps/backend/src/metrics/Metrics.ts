import { EngineName, MetricsSnapshot } from '../types';

export class MetricsRegistry {
  private byEngine: Map<EngineName, { success: number; failure: number; latencies: number[] }> =
    new Map();
  private totalRequests = 0;

  private ensure(engine: EngineName) {
    if (!this.byEngine.has(engine)) {
      this.byEngine.set(engine, { success: 0, failure: 0, latencies: [] });
    }
  }

  recordSuccess(engine: EngineName, latencyMs: number) {
    this.totalRequests++;
    this.ensure(engine);
    const e = this.byEngine.get(engine)!;
    e.success++;
    e.latencies.push(latencyMs);
  }

  recordFailure(engine: EngineName, latencyMs?: number) {
    this.totalRequests++;
    this.ensure(engine);
    const e = this.byEngine.get(engine)!;
    e.failure++;
    if (typeof latencyMs === 'number') e.latencies.push(latencyMs);
  }

  snapshot(): MetricsSnapshot {
    const byEngine: MetricsSnapshot['byEngine'] = {};
    for (const [name, data] of this.byEngine.entries()) {
      const sorted = [...data.latencies].sort((a, b) => a - b);
      const p = (q: number) => {
        if (sorted.length === 0) return undefined;
        const idx = Math.floor((q / 100) * (sorted.length - 1));
        return sorted[idx];
      };
      const totalLatencyMs = data.latencies.reduce((s, v) => s + v, 0);
      byEngine[name] = {
        success: data.success,
        failure: data.failure,
        totalLatencyMs,
        p50LatencyMs: p(50),
        p95LatencyMs: p(95),
      };
    }
    return { byEngine, totalRequests: this.totalRequests };
  }

  toPrometheus(): string {
    // Kept for backward compatibility; prefer prom-client registry in server route
    const snapshot = this.snapshot();
    return JSON.stringify(snapshot);
  }
}


