import { KeyManager } from '../../keys/KeyManager';
import { MetricsRegistry } from '../../metrics/Metrics';
import { JsonlLogger } from '../../logging/JsonlLogger';
import { ClickhouseWriter } from '../../logging/ClickhouseWriter';
import CircuitBreaker from 'opossum';
import { nanoid } from 'nanoid';
import { TLBManager, TLBToken } from './TLBManager';
import { ServiceConfig } from '../../types';
import {
  BaseEngine,
  BaseEngineLoader,
  CacheInterface,
  BaseManagerConfig,
  BaseRequestOptions
} from '../../types/base';



export abstract class BaseEngineManager<
  TArgs,
  TResult,
  TEngine extends BaseEngine<TArgs, TResult>,
  TLoader extends BaseEngineLoader<TEngine>,
  TLogRecord
> {
  protected engineToBreaker: Map<string, any> = new Map();
  protected config: BaseManagerConfig;
  public tlbManager: TLBManager | undefined;
  protected serviceConfig: Partial<ServiceConfig>;

  // 添加缺失的配置属性
  public fallbackEngineName?: string;
  public hedgeEnabled: boolean = false;
  public hedgeDelayMs: number = 150;
  public hedgeMaxEngines: number = 2;
  public cache?: CacheInterface;
  public cacheTtlSeconds?: number;
  public engineCacheTtlSeconds?: number;

  constructor(
    protected loader: TLoader,
    protected keyManager: KeyManager,
    protected metrics: MetricsRegistry,
    protected logger: JsonlLogger,
    protected clickhouse: ClickhouseWriter | undefined,
    protected defaultEngines: string[],
    requestTimeoutMs: number,
    enableRaw = false,
    serviceConfig?: Partial<ServiceConfig>
  ) {
    this.serviceConfig = serviceConfig || {};

    this.config = {
      requestTimeoutMs,
      enableRaw,
      cache: undefined,
      cacheTtlSeconds: 60,
      engineCacheTtlSeconds: 30,
      hedgeEnabled: false,
      hedgeDelayMs: 150,
      hedgeMaxEngines: 2,
      tlbEnabled: this.serviceConfig.tlbEnabled !== undefined ? this.serviceConfig.tlbEnabled : true,
      tlbConfig: {
        defaultRPS: this.serviceConfig.tlbDefaultRPS || 1, // 修改：每个引擎默认1秒产生1个令牌
        enableHotSwap: this.serviceConfig.tlbEnableHotSwap !== undefined ? this.serviceConfig.tlbEnableHotSwap : true,
        maxRetries: this.serviceConfig.tlbMaxRetries || 3
      }
    };

    // 初始化TLB管理器
    this.initializeTLB();
  }

  // 设置配置
  setConfig(config: Partial<BaseManagerConfig>): void {
    this.config = { ...this.config, ...config };

    // 如果TLB配置发生变化，重新初始化
    if (config.tlbEnabled !== undefined || config.tlbConfig) {
      this.initializeTLB();
    }
  }

  // 初始化TLB管理器
  private initializeTLB(): void {
    console.log(`BaseEngineManager: initializeTLB called, tlbEnabled: ${this.config.tlbEnabled}`);

    if (!this.config.tlbEnabled) {
      console.log('BaseEngineManager: TLB is disabled');
      this.tlbManager = undefined;
      return;
    }

    console.log('BaseEngineManager: TLB is enabled, creating TLBManager');
    this.tlbManager = new TLBManager(this.config.tlbConfig);

    // 为“具备有效API Key的引擎”注册令牌桶（避免无Key引擎被选中）
    const allLoadedEngines = this.loader.listEngineNames();
    const enginesWithActiveKey = allLoadedEngines.filter(engineName => {
      const engineExists = !!this.loader.getEngine(engineName);
      const apiKey = this.keyManager.getEngineApiKey(engineName);
      const hasActiveKey = apiKey !== null && apiKey.active;
      return engineExists && hasActiveKey;
    });

    console.log(`BaseEngineManager: Registering engines with TLB (eligible only): ${enginesWithActiveKey.join(', ')}`);

    enginesWithActiveKey.forEach(engineName => {
      const engineApiKey = this.keyManager.getEngineApiKey(engineName);
      const rps = engineApiKey?.rps || this.config.tlbConfig?.defaultRPS || 1;
      const maxTokens = Math.max(rps * 2, 1);
      console.log(`BaseEngineManager: Registering engine ${engineName} with RPS: ${rps}, maxTokens: ${maxTokens}, refillRate: ${rps}/秒`);
      this.tlbManager!.registerEngine(engineName, maxTokens, rps);
    });

    console.log('BaseEngineManager: TLB initialization completed');
  }

  // 获取所有已加载的引擎名称
  private getAllLoadedEngines(): string[] {
    const engineNames = this.loader.listEngineNames();
    return engineNames.length > 0 ? engineNames : this.defaultEngines;
  }

  // 动态更新引擎的TLB配置（当数据库中的RPS值发生变化时调用）
  public updateEngineTLBConfig(engineName: string): void {
    if (!this.tlbManager) {
      console.log(`BaseEngineManager: TLB is disabled, skipping update for engine ${engineName}`);
      return;
    }

    // 根据Key是否可用，决定注册/注销或更新RPS
    const engineApiKey = this.keyManager.getEngineApiKey(engineName);
    const hasActiveKey = !!engineApiKey && engineApiKey.active;
    const registered = this.tlbManager.getRegisteredEngines().includes(engineName);

    if (!hasActiveKey) {
      // 无有效Key：如已注册则注销，避免被选择
      if (registered) {
        this.tlbManager.unregisterEngine(engineName);
        console.log(`BaseEngineManager: Unregistered engine ${engineName} from TLB due to missing/inactive API key`);
      }
      return;
    }

    // 有有效Key：若未注册则注册；已注册则更新配置
    const rps = engineApiKey?.rps || this.config.tlbConfig?.defaultRPS || 1;
    const maxTokens = Math.max(rps * 2, 1);

    if (!registered) {
      this.tlbManager.registerEngine(engineName, maxTokens, rps);
      console.log(`BaseEngineManager: Registered engine ${engineName} into TLB with RPS: ${rps}, maxTokens: ${maxTokens}`);
    } else {
      this.tlbManager.updateEngineMaxTokens(engineName, maxTokens);
      this.tlbManager.updateEngineRefillRate(engineName, rps);
      console.log(`BaseEngineManager: Updated TLB config for engine ${engineName} - RPS: ${rps}, maxTokens: ${maxTokens}`);
    }
  }

  // 重新初始化所有引擎的TLB配置（当KeyManager重新加载后调用）
  public refreshAllEngineTLBConfigs(): void {
    if (!this.tlbManager) {
      console.log('BaseEngineManager: TLB is disabled, skipping refresh');
      return;
    }

    const engines = this.getAllLoadedEngines();
    console.log(`BaseEngineManager: Refreshing TLB configs for engines: ${engines.join(', ')}`);

    engines.forEach(engineName => {
      this.updateEngineTLBConfig(engineName);
    });

    console.log('BaseEngineManager: TLB config refresh completed');
  }

  // 通用的超时包装器
  protected withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout')), ms);
      p.then((v) => {
        clearTimeout(t);
        resolve(v);
      }).catch((e) => {
        clearTimeout(t);
        reject(e);
      });
    });
  }

  // 通用的断路器创建
  protected getOrCreateBreaker(engineName: string, executeFn: (...args: any[]) => Promise<any>): any {
    const existing = this.engineToBreaker.get(engineName);
    if (existing) return existing;

    const breaker = new CircuitBreaker(executeFn, {
      timeout: this.config.requestTimeoutMs + 500,
      errorThresholdPercentage: 100,  // 设置为100%，实际上禁用断路器
      resetTimeout: 1_000,            // 快速重置
      rollingCountBuckets: 1,         // 最小的时间窗口
      rollingCountTimeout: 1_000,     // 最小的时间窗口
    });

    // 绑定指标事件
    breaker.on('open', () => this.metrics.recordFailure(engineName, 0));
    breaker.on('halfOpen', () => { });
    breaker.on('close', () => this.metrics.recordSuccess(engineName, 0));

    this.engineToBreaker.set(engineName, breaker);
    return breaker;
  }

  // 通用的引擎重载处理
  handleEngineReload(engineName: string): void {
    const breaker = this.engineToBreaker.get(engineName);
    if (breaker) {
      try { breaker.removeAllListeners(); } catch { /* ignore errors */ }
      this.engineToBreaker.delete(engineName);
    }
  }

  // 重置所有断路器
  resetAllBreakers(): void {
    this.engineToBreaker.forEach(breaker => {
      try { breaker.removeAllListeners(); } catch { /* ignore errors */ }
    });
    this.engineToBreaker.clear();
  }

  // 通用的缓存键生成
  protected generateCacheKey(prefix: string, params: Record<string, any>): string {
    return `${prefix}:${JSON.stringify(params)}`;
  }

  // 通用的缓存获取
  protected async getFromCache<T>(cacheKey: string): Promise<T | undefined> {
    if (!this.config.cache || !cacheKey) return undefined;
    return await this.config.cache.get(cacheKey);
  }

  // 通用的缓存设置
  protected async setToCache<T>(cacheKey: string, value: T): Promise<void> {
    if (!this.config.cache || !cacheKey) return;
    await this.config.cache.set(cacheKey, value, this.config.cacheTtlSeconds);
  }

  // 通用的引擎过滤
  protected filterAvailableEngines(engines: string[]): string[] {
    return engines.filter(e => {
      // 引擎必须在加载器中存在
      const engineExists = !!this.loader.getEngine(e);

      // 检查引擎是否有可用的API key
      let hasApiKey = true;
      if (this.keyManager) {
        const apiKey = this.keyManager.getEngineApiKey(e);
        hasApiKey = apiKey !== null && apiKey.active;
      }

      // 如果TLB启用，引擎还必须在TLB中注册（即启用状态）
      if (this.tlbManager && this.config.tlbEnabled) {
        const engineEnabled = this.tlbManager.getRegisteredEngines().includes(e);
        return engineExists && engineEnabled && hasApiKey;
      }

      // 如果没有TLB或TLB被禁用，仍然需要检查引擎是否在TLB中注册
      // 这样可以确保删除的引擎不会被认为是可用的
      if (this.tlbManager) {
        const engineEnabled = this.tlbManager.getRegisteredEngines().includes(e);
        return engineExists && engineEnabled && hasApiKey;
      }

      // 只有在完全没有TLB管理器的情况下，才只检查引擎是否存在和是否有API key
      return engineExists && hasApiKey;
    });
  }

  // TLB: 获取可用令牌桶
  protected getAvailableTokenBuckets(): string[] {
    if (!this.tlbManager) {
      return this.filterAvailableEngines(this.defaultEngines);
    }
    return this.tlbManager.getAvailableTokenBuckets();
  }

  // TLB: 随机抽取令牌
  protected drawRandomToken(): TLBToken | null {
    if (!this.tlbManager) {
      return null;
    }
    return this.tlbManager.drawRandomToken();
  }


  // TLB: 完全基于令牌桶状态的智能引擎选择（忽略用户指定引擎）
  protected selectEngineWithTLB(
    engines: string[] // 参数保留但忽略，完全基于令牌桶状态选择
  ): { engineName: string; token: TLBToken | null } {
    console.log(`BaseEngineManager: selectEngineWithTLB called, ignoring user-specified engines, using TLB-based selection`);

    if (!this.tlbManager || !this.config.tlbEnabled) {
      // 如果TLB未启用，使用所有可用引擎中的第一个
      const availableEngines = this.getCurrentAvailableEngines();
      if (availableEngines.length === 0) throw new Error('No available engines');

      console.log(`BaseEngineManager: TLB disabled, using first available engine: ${availableEngines[0]}`);
      return { engineName: availableEngines[0], token: null };
    }

    // 仅在“已注册且具备有效Key”的引擎中进行选择
    const allRegisteredEngines = this.tlbManager.getRegisteredEngines();
    const eligibleEngines = this.filterAvailableEngines(allRegisteredEngines);

    if (eligibleEngines.length === 0) {
      throw new Error('No registered engines available');
    }

    console.log(`🎯 TLB完全智能选择: 从合格注册引擎 [${eligibleEngines.join(', ')}] 中基于令牌桶状态选择`);

    // 智能选择：完全基于令牌桶状态进行负载均衡
    const engineSelection = this.selectEngineByTokenState(eligibleEngines);

    if (engineSelection.token) {
      console.log(`✅ TLB令牌桶智能选择: 引擎 ${engineSelection.engineName} (可用令牌: ${engineSelection.availableTokens}) 基于令牌桶状态被选中`);
      return { engineName: engineSelection.engineName, token: engineSelection.token };
    }

    // 如果所有引擎都没有令牌，抛出明确的限流错误
    console.log(`💥 TLB: 所有注册引擎 [${allRegisteredEngines.join(', ')}] 都没有可用令牌`);
    throw new Error('Rate limit exceeded - no available tokens in any engine');
  }

  // 基于令牌桶状态的智能引擎选择（负载均衡）
  protected selectEngineByTokenState(
    engines: string[]
  ): { engineName: string; token: TLBToken | null; availableTokens: number } {
    if (!this.tlbManager) {
      const availableEngines = this.filterAvailableEngines(engines);
      if (availableEngines.length === 0) {
        return { engineName: '', token: null, availableTokens: 0 };
      }
      return { engineName: availableEngines[0], token: null, availableTokens: 0 };
    }

    // 获取所有候选引擎的令牌状态
    interface EngineTokenInfo {
      engineName: string;
      availableTokens: number;
      isAvailable: boolean;
    }

    const engineTokenStates: EngineTokenInfo[] = engines
      .map(engineName => {
        const tokenBucket = this.tlbManager!.getTokenBucket(engineName);
        const availableTokens = tokenBucket ? tokenBucket.getAvailableTokens() : 0;
        const isAvailable = availableTokens > 0;

        return {
          engineName,
          availableTokens,
          isAvailable
        };
      })
      .filter(info => info.isAvailable) // 只保留有令牌的引擎
      .sort((a, b) => b.availableTokens - a.availableTokens); // 按令牌数量降序排列

    console.log(`🧠 TLB引擎状态分析:`, engineTokenStates.map(info =>
      `${info.engineName}(${info.availableTokens.toFixed(2)}令牌)`).join(', '));

    if (engineTokenStates.length === 0) {
      console.log(`⚠️ TLB: 没有引擎有可用令牌`);
      return { engineName: '', token: null, availableTokens: 0 };
    }

    // 实现基于Round Robin的负载均衡算法
    const selectedEngine = this.selectEngineByRoundRobin(engineTokenStates);

    // 尝试从选中的引擎获取令牌
    const token = this.tlbManager.drawTokenForEngine(selectedEngine.engineName);

    if (token) {
      console.log(`🎯 Round Robin负载均衡选择: ${selectedEngine.engineName} (${selectedEngine.availableTokens.toFixed(2)}令牌)`);
      return {
        engineName: selectedEngine.engineName,
        token,
        availableTokens: selectedEngine.availableTokens
      };
    }

    // 如果主选引擎获取令牌失败，尝试其他引擎
    console.log(`⚠️ TLB: 主选引擎 ${selectedEngine.engineName} 获取令牌失败，尝试备选引擎`);
    for (const engineInfo of engineTokenStates) {
      if (engineInfo.engineName === selectedEngine.engineName) continue;

      const backupToken = this.tlbManager.drawTokenForEngine(engineInfo.engineName);
      if (backupToken) {
        console.log(`🔄 TLB备选成功: ${engineInfo.engineName} (${engineInfo.availableTokens.toFixed(2)}令牌)`);
        return {
          engineName: engineInfo.engineName,
          token: backupToken,
          availableTokens: engineInfo.availableTokens
        };
      }
    }

    return { engineName: '', token: null, availableTokens: 0 };
  }

  // Round Robin负载均衡算法
  private static roundRobinCounters: Map<string, number> = new Map();

  protected selectEngineByRoundRobin(engineTokenStates: Array<{
    engineName: string;
    availableTokens: number;
    isAvailable: boolean;
  }>): { engineName: string; availableTokens: number; isAvailable: boolean } {
    if (engineTokenStates.length === 0) {
      throw new Error('No engines available for round robin balancing');
    }

    if (engineTokenStates.length === 1) {
      console.log(`🔄 Round Robin: 只有一个引擎 ${engineTokenStates[0].engineName}`);
      return engineTokenStates[0];
    }

    // 获取引擎列表的标识符（用于区分不同的引擎组合）
    const engineNames = engineTokenStates.map(e => e.engineName).sort();
    const groupKey = engineNames.join('|');

    // 获取当前轮询计数器
    const currentIndex = BaseEngineManager.roundRobinCounters.get(groupKey) || 0;

    // 选择当前索引对应的引擎
    const selectedEngine = engineTokenStates[currentIndex % engineTokenStates.length];

    // 更新计数器
    BaseEngineManager.roundRobinCounters.set(groupKey, (currentIndex + 1) % engineTokenStates.length);

    console.log(`🔄 Round Robin负载均衡: 选择 ${selectedEngine.engineName} (索引=${currentIndex}, 总数=${engineTokenStates.length}, 令牌=${selectedEngine.availableTokens.toFixed(2)})`);

    return selectedEngine;
  }

  // 获取当前所有可用的引擎（包括新添加的）
  protected getCurrentAvailableEngines(): string[] {
    // 获取加载器中的所有引擎
    const allEngines = this.loader.listEngineNames();
    // 过滤出可用的引擎
    return this.filterAvailableEngines(allEngines);
  }

  // 动态更新默认引擎列表（用于故障转移时包含新添加的引擎）
  protected updateDefaultEngines(newEngines: string[]): void {
    this.defaultEngines = newEngines;
  }

  // 获取引擎列表（支持动态获取或使用默认列表）
  protected getEnginesForRequest(
    requestedEngines: string[] | undefined,
    useDynamicEngines: boolean = false
  ): string[] {
    // 如果明确指定了引擎，使用指定的
    if (requestedEngines && requestedEngines.length > 0) {
      return requestedEngines;
    }

    // 如果需要动态获取引擎（包含新添加的），使用加载器中的最新列表
    if (useDynamicEngines) {
      return this.getCurrentAvailableEngines();
    }

    // 否则使用默认引擎列表
    return this.defaultEngines;
  }

  // 清理路由键中的无效引擎（修复：删除的引擎仍存在于路由键的问题）
  protected cleanInvalidEnginesFromGroups(groups: Record<string, string[]>): Record<string, string[]> {
    const cleanedGroups: Record<string, string[]> = {};

    for (const [key, engines] of Object.entries(groups)) {
      // 过滤出有效的引擎
      const validEngines = engines.filter(engine => {
        const engineExists = !!this.loader.getEngine(engine);
        const engineEnabled = this.tlbManager ? this.tlbManager.getRegisteredEngines().includes(engine) : true;
        return engineExists && engineEnabled;
      });

      // 只有当有效引擎数量大于0时才保留该分组
      if (validEngines.length > 0) {
        cleanedGroups[key] = validEngines;
      }
      // 如果所有引擎都无效，该分组会被自动删除
    }

    return cleanedGroups;
  }

  // 获取清理后的引擎列表（用于故障转移时排除无效引擎）
  protected getCleanedEngineList(engines: string[]): string[] {
    return engines.filter(engine => {
      const engineExists = !!this.loader.getEngine(engine);
      const engineEnabled = this.tlbManager ? this.tlbManager.getRegisteredEngines().includes(engine) : true;
      return engineExists && engineEnabled;
    });
  }

  // 通用的引擎分组管理（用于路由键、语言分组等）
  protected engineGroups: Record<string, string[]> = {};

  // 设置引擎分组策略（自动清理无效引擎）
  protected setEngineGroups(groups: Record<string, string[]>): void {
    this.engineGroups = this.cleanInvalidEnginesFromGroups(groups);
  }

  // 清理当前引擎分组配置中的无效引擎
  protected cleanCurrentEngineGroups(): void {
    this.engineGroups = this.cleanInvalidEnginesFromGroups(this.engineGroups);
  }

  // 获取指定分组的引擎列表（自动清理无效引擎）
  protected getEngineGroup(groupKey: string): string[] {
    const group = this.engineGroups[groupKey];
    if (!group) return [];

    // 返回清理后的引擎列表
    return this.getCleanedEngineList(group);
  }

  // 获取所有有效的引擎分组
  protected getValidEngineGroups(): Record<string, string[]> {
    return this.cleanInvalidEnginesFromGroups(this.engineGroups);
  }

  // 通用的路由键选择引擎方法（供子类使用）
  protected selectEnginesByRoutingKey(
    options: BaseRequestOptions,
    customGroups?: Record<string, string[]>,
    fallbackEngines?: string[]
  ): string[] {
    // 如果显式指定了引擎，优先使用
    if (options.engines && options.engines.length > 0) {
      return this.filterAvailableEngines(options.engines);
    }

    // 如果有路由键且存在对应的引擎分组，使用该分组
    if (options.routingKey) {
      // 使用基类的引擎分组管理，自动清理无效引擎
      const engines = this.getEngineGroup(options.routingKey);
      if (engines.length > 0) {
        return this.filterAvailableEngines(engines);
      }
    }

    // 如果有自定义分组（如语言分组），使用自定义分组
    if (customGroups) {
      // 这里需要子类传入具体的分组键，基类无法知道
      // 子类可以重写此方法或传入customGroups
    }

    // 否则使用fallback引擎列表或动态引擎列表
    if (fallbackEngines && fallbackEngines.length > 0) {
      return this.filterAvailableEngines(fallbackEngines);
    }

    // 使用动态引擎列表（包含新添加的引擎）
    return this.filterAvailableEngines(this.getCurrentAvailableEngines());
  }

  // 通用的引擎选择方法（完全基于令牌桶状态，忽略用户指定）
  protected selectEngines(
    options: BaseRequestOptions,
    customGroups?: Record<string, string[]>,
    customGroupKey?: string
  ): string[] {
    console.log(`BaseEngineManager: selectEngines called, ignoring user-specified engines, using TLB-based selection`);

    // 完全忽略用户指定的engines参数
    // 不再使用: options.engines

    // 如果有路由键且存在对应的引擎分组，仍然可以作为候选池
    if (options.routingKey) {
      const engines = this.getEngineGroup(options.routingKey);
      if (engines.length > 0) {
        console.log(`BaseEngineManager: Using routing key ${options.routingKey} engine group as candidate pool: [${engines.join(', ')}]`);
        return this.filterAvailableEngines(engines);
      }
    }

    // 如果有自定义分组和分组键，使用自定义分组作为候选池
    if (customGroups && customGroupKey && customGroups[customGroupKey]) {
      const engines = customGroups[customGroupKey];
      console.log(`BaseEngineManager: Using custom group ${customGroupKey} as candidate pool: [${engines.join(', ')}]`);
      return this.filterAvailableEngines(engines);
    }

    // 默认使用所有可用的引擎作为候选池（TLB会基于令牌桶状态选择）
    const allEngines = this.filterAvailableEngines(this.getCurrentAvailableEngines());
    console.log(`BaseEngineManager: Using all available engines as candidate pool: [${allEngines.join(', ')}]`);
    return allEngines;
  }

  // 通用的请求ID生成
  protected generateRequestId(options: BaseRequestOptions): string {
    return options.requestId || nanoid();
  }

  // 通用的日志记录
  protected logRequest(
    requestId: string,
    engines: string[],
    options: BaseRequestOptions,
    endpoint: string
  ): void {
    console.log(`Framework request: ${endpoint}`, {
      requestId, engines,
      clientIp: options.clientIp,
      userId: options.userId,
      username: options.username,
    });
  }

  // 通用的限流错误处理
  protected createRateLimitError(message: string = 'Rate limit exceeded - no available tokens in any engine'): Error {
    const rateLimitError = new Error(message);
    (rateLimitError as any).isRateLimit = true;
    (rateLimitError as any).statusCode = 429;
    return rateLimitError;
  }

  // 通用的错误分类方法
  protected classifyError(error: any): { isRateLimit: boolean; statusCode: number; message: string } {
    const isRateLimit = error?.message === 'No available tokens in any engine' ||
      error?.message === 'Rate limit exceeded - no available tokens in any engine' ||
      (error as any)?.isRateLimit;

    return {
      isRateLimit,
      statusCode: isRateLimit ? 429 : 500,
      message: error?.message || 'Internal server error'
    };
  }

  // 通用的错误响应格式
  protected createErrorResponse(error: any, context?: { requestId?: string; endpoint?: string }): {
    error: string;
    details?: string;
    statusCode: number;
    _framework?: any;
  } {
    const { isRateLimit, statusCode, message } = this.classifyError(error);

    const response: any = {
      error: message,
      statusCode
    };

    if (isRateLimit) {
      response.details = 'No available tokens in any engine';
    }

    if (context) {
      response._framework = {
        requestId: context.requestId,
        endpoint: context.endpoint,
        timestamp: new Date().toISOString()
      };
    }

    return response;
  }

  // 抽象方法：具体的执行逻辑由子类实现
  protected abstract executeEngine(
    engine: TEngine,
    args: TArgs,
    breaker: any
  ): Promise<TResult>;

  // 抽象方法：创建日志记录
  protected abstract createLogRecord(
    requestId: string,
    engines: string[],
    options: BaseRequestOptions,
    result?: TResult,
    error?: Error
  ): TLogRecord;

  // 抽象方法：记录到 Clickhouse
  protected abstract logToClickhouse(logRecord: TLogRecord): Promise<void>;

  // 调试方法：获取TLB状态快照（供调试使用）
  public getTLBStatusSnapshot(): Record<string, unknown> {
    if (!this.tlbManager) {
      return { error: 'TLB is not enabled' };
    }

    const snapshot = this.tlbManager.getTokenBucketsSnapshot();
    const registeredEngines = this.tlbManager.getRegisteredEngines();
    const availableEngines = this.getCurrentAvailableEngines();

    return {
      tlbEnabled: this.config.tlbEnabled,
      defaultRPS: this.config.tlbConfig?.defaultRPS,
      registeredEngines,
      availableEngines,
      engineTokenStates: snapshot,
      timestamp: new Date().toISOString()
    };
  }

  // 调试方法：模拟智能选择过程（不消耗令牌）
  public simulateIntelligentSelection(engines: string[]): {
    selectedEngine: string;
    reason: string;
    engineStates: Record<string, { availableTokens: number; maxTokens: number; refillRate: number }>;
    balancingDetails: {
      totalTokens: number;
      modValue: number;
      selectedTokenRange: string;
      allEnginesWithTokens: string[];
    } | null;
  } {
    if (!this.tlbManager) {
      return {
        selectedEngine: engines[0] || 'none',
        reason: 'TLB disabled, using first engine',
        engineStates: {},
        balancingDetails: null
      };
    }

    const engineStates: Record<string, { availableTokens: number; maxTokens: number; refillRate: number }> = {};
    const validEngines: Array<{
      engineName: string;
      availableTokens: number;
      isAvailable: boolean;
    }> = [];

    // 收集引擎状态
    for (const engineName of engines) {
      const bucket = this.tlbManager.getTokenBucket(engineName);
      if (bucket) {
        const availableTokens = bucket.getAvailableTokens();
        engineStates[engineName] = {
          availableTokens,
          maxTokens: bucket.getMaxTokens(),
          refillRate: bucket.getRefillRate()
        };

        if (availableTokens > 0) {
          validEngines.push({
            engineName,
            availableTokens,
            isAvailable: true
          });
        }
      }
    }

    if (validEngines.length === 0) {
      return {
        selectedEngine: 'none',
        reason: 'No engines have available tokens',
        engineStates,
        balancingDetails: null
      };
    }

    // 排序：令牌数量多的在前
    validEngines.sort((a, b) => b.availableTokens - a.availableTokens);

    // 模拟负载均衡计算
    const totalTokens = validEngines.reduce((sum, engine) => sum + engine.availableTokens, 0);
    const timestamp = Date.now();
    const modValue = timestamp % totalTokens;

    let accumulated = 0;
    let selectedEngine = validEngines[0];

    for (const engine of validEngines) {
      accumulated += engine.availableTokens;
      if (modValue < accumulated) {
        selectedEngine = engine;
        break;
      }
    }

    return {
      selectedEngine: selectedEngine.engineName,
      reason: 'Intelligent selection based on token states and modulo balancing',
      engineStates,
      balancingDetails: {
        totalTokens,
        modValue,
        selectedTokenRange: `${(accumulated - selectedEngine.availableTokens).toFixed(2)}-${accumulated.toFixed(2)}`,
        allEnginesWithTokens: validEngines.map(e => `${e.engineName}(${e.availableTokens.toFixed(2)})`)
      }
    };
  }
}