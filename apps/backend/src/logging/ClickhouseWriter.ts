import { createClient, type ClickHouseClient } from '@clickhouse/client';
import { SearchLogRecord } from '../types';

export class ClickhouseWriter {
  private client: ClickHouseClient;
  private tableName: string;

  constructor(options: {
    url: string;
    database?: string;
    username?: string;
    password?: string;
    tls?: boolean;
    table?: string;
  }) {
    this.client = createClient({
      host: options.url, // full URL, e.g. http://localhost:8123 or https://...
      database: options.database || 'default',
      username: options.username,
      password: options.password,
    });
    this.tableName = options.table || 'search_logs';
  }

  async init(): Promise<void> {
    // Create table if not exists. Use simple MergeTree with JSON strings for complex fields.
      const ddl = `
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        timestamp DateTime64(3) DEFAULT now(),
        requestId String,
        query String,
        selectedEngines Array(String),
        usedEngine Nullable(String),
        resultCount Nullable(UInt16),
        latencyMs Nullable(UInt32),
        clientIp Nullable(String),
        userAgent Nullable(String),
          userId Nullable(String),
          username Nullable(String),
        attempts_json Nullable(String),
        items_sample_json Nullable(String),
        error Nullable(String)
      )
      ENGINE = MergeTree
      ORDER BY (timestamp, requestId)
      TTL timestamp + INTERVAL 30 DAY
      SETTINGS index_granularity = 8192
    `;
    await this.client.command({ query: ddl });
  }

  async write(record: SearchLogRecord): Promise<void> {
    const row = {
      timestamp: record.timestamp,
      requestId: record.requestId,
      query: record.query,
      selectedEngines: record.selectedEngines,
      usedEngine: record.usedEngine ?? null,
      resultCount: record.resultCount ?? null,
      latencyMs: record.latencyMs ?? null,
      clientIp: record.clientIp ?? null,
      userAgent: record.userAgent ?? null,
      userId: record.userId ?? null,
      username: record.username ?? null,
      attempts_json: JSON.stringify(record.attempts || []),
      items_sample_json: JSON.stringify(record.itemsSample || []),
      error: record.error ?? null,
    } as const;

    await this.client.insert({
      table: this.tableName,
      values: [row],
      format: 'JSONEachRow',
    });
  }

  async recent(limit = 50): Promise<any[]> {
    const rs = await this.client.query({
      query: `
        SELECT 
          timestamp, requestId, query, selectedEngines, usedEngine, resultCount,
          latencyMs, clientIp, userAgent, userId, username, attempts_json, items_sample_json, error
        FROM ${this.tableName}
        ORDER BY timestamp DESC
        LIMIT {limit:UInt32}
      `,
      format: 'JSONEachRow',
      query_params: { limit },
    });
    // 使用类型断言，因为 json() 返回类型是 unknown
    return (await rs.json()) as any[];
  }

  // 公共方法：安全地执行查询
  async executeQuery(query: string, params?: Record<string, any>): Promise<any> {
    try {
      const result = await this.client.query({
        query,
        format: 'JSONEachRow',
        query_params: params,
      });
      return await result.json();
    } catch (error) {
      console.error('Clickhouse query execution failed:', error);
      throw new Error(`Clickhouse query failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // 公共访问器：获取表名
  get publicTableName(): string {
    return this.tableName;
  }

  async summary(): Promise<{
    totalRequests: number;
    byEngine: Array<{ engine: string; success: number; failure: number; avgLatencyMs: number | null }>;
  }> {
    const total = await this.client.query({
      query: `SELECT count() AS c FROM ${this.tableName}`,
      format: 'JSONEachRow',
    });
    // 使用类型断言，因为 json() 返回类型是 unknown
    const totalRows = ((await total.json()) as any[])[0]?.c ?? 0;

    const byEngine = await this.client.query({
      query: `
        SELECT 
          ifNull(usedEngine, 'unknown') AS engine,
          sum(if(isNull(error), 1, 0)) AS success,
          sum(if(isNull(error), 0, 1)) AS failure,
          avgOrNull(latencyMs) AS avgLatencyMs
        FROM ${this.tableName}
        GROUP BY engine
        ORDER BY engine ASC
      `,
      format: 'JSONEachRow',
    });
    return {
      totalRequests: totalRows,
      // 使用类型断言，因为 json() 返回类型是 unknown
      byEngine: (await byEngine.json()) as any[],
    };
  }
}


