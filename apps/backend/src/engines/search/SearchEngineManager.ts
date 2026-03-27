import { KeyManager } from '../../keys/KeyManager';
import { SearchEngineLoader } from './SearchEngineLoader';
import {
  SearchEngineAttempt,
  EngineName,
  SearchArgs,
  SearchLogRecord,
  SearchResult,
  SearchRequestOptions,
} from '../../types';
import { JsonlLogger } from '../../logging/JsonlLogger';
import { MetricsRegistry } from '../../metrics/Metrics';

import { ClickhouseWriter } from '../../logging/ClickhouseWriter';
import { BaseEngineManager } from '../base/BaseEngineManager';
import { BaseRequestOptions } from '../../types/base';
import { ServiceConfig } from '../../types';
import { TLBToken } from '../base/TLBManager';

// 搜索引擎接口 - 适配现有的 Engine 类型
interface SearchEngine {
  name: string;
  search(args: SearchArgs): Promise<SearchResult>;
}

// 搜索引擎加载器接口 - 适配现有的 EngineLoader 类型
interface SearchEngineLoaderInterface {
  getEngine(name: string): SearchEngine | undefined;
  listEngineNames(): string[];
}

// 搜索请求选项 - 使用导入的类型

export class SearchEngineManager extends BaseEngineManager<
  SearchArgs,
  SearchResult,
  SearchEngine,
  SearchEngineLoaderInterface,
  SearchLogRecord
> {
  // 路由键到引擎分组的映射表（使用基类的引擎分组管理）
  public get routingGroups(): Record<string, EngineName[]> {
    return this.getValidEngineGroups();
  }

  constructor(
    loader: SearchEngineLoader,
    keyManager: KeyManager,
    metrics: MetricsRegistry,
    logger: JsonlLogger,
    clickhouse: ClickhouseWriter | undefined,
    defaultEngines: EngineName[],
    requestTimeoutMs: number,
    enableRaw = false,
    serviceConfig?: Partial<ServiceConfig>
  ) {
    super(loader, keyManager, metrics, logger, clickhouse, defaultEngines, requestTimeoutMs, enableRaw, serviceConfig);

    // 重置所有断路器，确保它们处于关闭状态
    this.resetAllBreakers();
  }

  // 实现抽象方法：执行搜索引擎
  protected async executeEngine(
    engine: SearchEngine,
    args: SearchArgs,
    breaker: any
  ): Promise<SearchResult> {
    return await breaker.fire(args);
  }

  // 实现抽象方法：创建搜索日志记录
  protected createLogRecord(
    requestId: string,
    engines: string[],
    options: SearchRequestOptions,
    result?: SearchResult,
    error?: Error
  ): SearchLogRecord {
    const attempts: SearchEngineAttempt[] = engines.map(engineName => ({
      engine: engineName,
      startedAt: Date.now(),
      endedAt: Date.now(),
      ok: !error,
      errorMessage: error?.message,
    }));

    return {
      timestamp: new Date().toISOString(),
      requestId,
      query: result?.query || '',
      selectedEngines: engines,
      usedEngine: result?.provider,
      resultCount: result?.items?.length,
      latencyMs: result?.latencyMs,
      clientIp: options.clientIp,
      userAgent: options.userAgent,
      userId: options.userId,
      username: options.username,
      attempts,
      itemsSample: result?.items?.slice(0, 3),
      error: error?.message,
    };
  }

  // 实现抽象方法：记录到 Clickhouse
  protected async logToClickhouse(logRecord: SearchLogRecord): Promise<void> {
    if (!this.clickhouse) return;

    try {
      // 使用现有的 clickhouse 接口
      await this.clickhouse.write(logRecord);
    } catch (error) {
      // 记录失败但不影响主流程
      console.error('Failed to log to Clickhouse:', error);
    }
  }

  // 主要的搜索方法
  async search(
    query: string,
    options: SearchRequestOptions = {}
  ): Promise<SearchResult> {
    // 检查缓存（不再包含engines参数，因为引擎选择完全基于TLB状态）
    const cacheKey = this.generateCacheKey('search', {
      q: query,
      l: options.limit,
      lo: options.locale,
      s: options.safesearch,
      f: options.freshness,
      rk: options.routingKey // 缓存键包含路由键，但不包含engines
    });

    const cached = await this.getFromCache<SearchResult>(cacheKey);
    if (cached) return cached;

    const requestId = this.generateRequestId(options);

    // 获取候选引擎池（基于路由键或全部引擎）- 实际选择由TLB基于令牌桶状态决定
    const candidateEngines = this.selectSearchEnginesByRoutingKey(options);

    if (candidateEngines.length === 0) {
      throw new Error('No available search engines');
    }

    console.log(`🎯 搜索引擎候选池: [${candidateEngines.join(', ')}], 实际选择将基于TLB令牌桶状态`);

    // 记录请求日志
    this.logRequest(requestId, candidateEngines, options, '/v1/search');

    // 执行搜索
    let result: SearchResult;
    let error: Error | undefined;

    try {
      result = await this.executeSearchWithEngines(query, candidateEngines, options, requestId);

      // 缓存结果
      await this.setToCache(cacheKey, result);

      // 记录成功日志
      const logRecord = this.createLogRecord(requestId, candidateEngines, options, result);
      await this.logToClickhouse(logRecord);

      return result;
    } catch (err) {
      error = err as Error;

      // 记录失败日志
      const logRecord = this.createLogRecord(requestId, candidateEngines, options, undefined, error);
      await this.logToClickhouse(logRecord);

      throw error;
    }
  }

  // 获取搜索引擎候选池（基于路由键或全部引擎，实际选择由TLB基于令牌桶状态决定）
  private selectSearchEnginesByRoutingKey(options: SearchRequestOptions): EngineName[] {
    // 使用基类的通用引擎选择方法（返回候选池，不是最终选择）
    return this.selectEngines(options);
  }

  // 基于TLB令牌桶状态智能执行搜索（从候选引擎池中智能选择）
  private async executeSearchWithEngines(
    query: string,
    candidateEngines: string[], // 候选引擎池，实际选择由TLB基于令牌桶状态决定
    options: SearchRequestOptions,
    requestId: string
  ): Promise<SearchResult> {
    const startTime = Date.now();
    let retryCount = 0;
    // TLB智能重试：基于令牌桶状态，不再限制于候选引擎数量
    const maxRetries = this.config.tlbConfig?.maxRetries || 3;

    while (retryCount < maxRetries) {
      let token: TLBToken | null = null;
      let engineName: string = '';

      try {
        // 使用TLB基于令牌桶状态智能选择引擎（不传递failedEngines，让取余算法自然避免重复选择）
        const selection = this.selectEngineWithTLB(candidateEngines);
        token = selection.token;
        engineName = selection.engineName;

        // 记录重试日志
        if (retryCount > 0) {
          console.log(`🔄 搜索引擎重试: 第${retryCount + 1}次重试, 选择引擎 ${engineName}`);
        }

        // 如果没有获取到令牌，说明所有引擎的令牌都已耗尽
        if (!token) {
          // 使用基类的通用限流错误创建方法
          throw this.createRateLimitError();
        }

        const engine = this.loader.getEngine(engineName);
        if (!engine) {
          // 如果引擎不可用，直接重试
          retryCount++;
          continue;
        }

        const breaker = this.getOrCreateBreaker(engineName, (args: SearchArgs) => engine.search(args));

        // 从 KeyManager 获取 API Key
        const keyInfo = await this.keyManager.getNextKey(engineName);
        if (!keyInfo) {
          throw new Error(`No available API key for engine ${engineName}`);
        }
        const args: SearchArgs = {
          query,
          limit: options.limit,
          locale: options.locale,
          safesearch: options.safesearch,
          freshness: options.freshness,
          userAgent: options.userAgent,
          requestId,
          apiKey: keyInfo.key,
          httpProxy: keyInfo.proxy || options.httpProxy,
        };

        const result = await this.withTimeout(
          breaker.fire(args),
          this.config.requestTimeoutMs
        );

        // 确保 result 有正确的类型
        if (result && typeof result === 'object') {
          // 记录成功执行的引擎
          if (retryCount > 0) {
            console.log(`✅ 搜索引擎重试成功: 最终使用引擎 ${engineName}, 总耗时 ${Date.now() - startTime}ms`);
          } else {
            console.log(`✅ 搜索引擎执行成功: 使用引擎 ${engineName}, 耗时 ${Date.now() - startTime}ms`);
          }

          // 成功的请求不归还令牌（令牌已经被消费）
          return {
            ...result,
            latencyMs: Date.now() - startTime,
          } as SearchResult;
        }
      } catch (error) {
        console.error(`Engine execution failed (attempt ${retryCount + 1}):`, error);

        if (retryCount < maxRetries - 1) {
          // 延迟1秒后重试
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        retryCount++;
      }
    }

    // 所有重试都失败了
    console.log(`💥 搜索引擎TLB智能选择失败: 经过 ${maxRetries} 次重试后，TLB无法从候选池 [${candidateEngines.join(', ')}] 中找到可用引擎`);
    throw new Error('All search engines failed after TLB intelligent retries');
  }

  // 设置路由分组策略
  setRoutingGroups(groups: Record<string, EngineName[]>): void {
    // 使用基类的引擎分组管理
    this.setEngineGroups(groups);
  }

  // 清理当前路由键配置中的无效引擎
  cleanCurrentRoutingGroups(): void {
    this.cleanCurrentEngineGroups();
  }

  // 调试方法：模拟搜索引擎选择过程（验证TLB智能选择机制）
  public simulateSearchEngineSelection(options: SearchRequestOptions = {}): {
    candidatePool: string[];
    tlbSelection: ReturnType<SearchEngineManager['simulateIntelligentSelection']>;
    message: string;
  } {
    // 获取候选引擎池
    const candidatePool = this.selectSearchEnginesByRoutingKey(options);

    // 模拟TLB智能选择
    const tlbSelection = this.simulateIntelligentSelection(candidatePool);

    const message = `🔍 搜索引擎选择模拟:\n` +
      `  候选池: [${candidatePool.join(', ')}]\n` +
      `  TLB选择: ${tlbSelection.selectedEngine}\n` +
      `  选择原因: ${tlbSelection.reason}\n` +
      `  引擎状态: ${JSON.stringify(tlbSelection.engineStates, null, 2)}`;

    console.log(message);

    return {
      candidatePool,
      tlbSelection,
      message
    };
  }
}


