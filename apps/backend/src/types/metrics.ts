// 指标相关类型定义
import type { EngineName } from './base';

export type MetricsSnapshot = {
  byEngine: Record<
    EngineName,
    {
      success: number;
      failure: number;
      totalLatencyMs: number;
      p50LatencyMs?: number;
      p95LatencyMs?: number;
    }
  >;
  totalRequests: number;
};
