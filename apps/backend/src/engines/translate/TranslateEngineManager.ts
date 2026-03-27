import { KeyManager } from '../../keys/KeyManager';
import { TranslateEngineLoader } from './TranslateEngineLoader';
import {
  TranslateArgs,
  TranslateEngineName,
  TranslateResult,
  TranslateLogRecord,
  TranslateEngineAttempt,
  TranslateRequestOptions,
} from '../../types';
import { JsonlLogger } from '../../logging/JsonlLogger';
import { MetricsRegistry } from '../../metrics/Metrics';
import { ClickhouseWriter } from '../../logging/ClickhouseWriter';
import { BaseEngineManager } from '../base/BaseEngineManager';
import { BaseRequestOptions } from '../../types/base';
import { ServiceConfig } from '../../types';
import { TLBToken } from '../base/TLBManager';

// 翻译引擎接口
interface TranslateEngine {
  name: string;
  translate(args: TranslateArgs): Promise<TranslateResult>;
  // 可选的流式翻译支持
  translateStream?(args: TranslateArgs): Promise<ReadableStream>;
}

// 翻译引擎加载器接口
interface TranslateEngineLoaderInterface {
  getEngine(name: string): TranslateEngine | undefined;
  listEngineNames(): string[];
}

// 翻译请求选项 - 使用导入的类型

export class TranslateEngineManager extends BaseEngineManager<
  TranslateArgs,
  TranslateResult,
  TranslateEngine,
  TranslateEngineLoaderInterface,
  TranslateLogRecord
> {
  // 路由键到引擎分组的映射表（使用基类的引擎分组管理）
  public get routingGroups(): Record<string, TranslateEngineName[]> {
    return this.getValidEngineGroups();
  }

  constructor(
    loader: TranslateEngineLoader,
    keyManager: KeyManager,
    metrics: MetricsRegistry,
    logger: JsonlLogger,
    clickhouse: ClickhouseWriter | undefined,
    defaultEngines: TranslateEngineName[],
    requestTimeoutMs: number,
    enableRaw = false,
    serviceConfig?: Partial<ServiceConfig>
  ) {
    super(loader, keyManager, metrics, logger, clickhouse, defaultEngines, requestTimeoutMs, enableRaw, serviceConfig);
  }

  // 实现抽象方法：执行翻译引擎
  protected async executeEngine(
    engine: TranslateEngine,
    args: TranslateArgs,
    breaker: any
  ): Promise<TranslateResult> {
    return await breaker.fire(args);
  }

  // 实现抽象方法：创建翻译日志记录
  protected createLogRecord(
    requestId: string,
    engines: string[],
    options: TranslateRequestOptions,
    result?: TranslateResult,
    error?: Error
  ): TranslateLogRecord {
    const attempts: TranslateEngineAttempt[] = engines.map(engineName => ({
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
      target: result?.target || '',
      source: result?.source,
      selectedEngines: engines,
      usedEngine: result?.provider,
      latencyMs: result?.latencyMs,
      clientIp: options.clientIp,
      userAgent: options.userAgent,
      userId: options.userId,
      username: options.username,
      attempts,
      error: error?.message,
    };
  }

  // 实现抽象方法：记录到 Clickhouse
  protected async logToClickhouse(logRecord: TranslateLogRecord): Promise<void> {
    if (!this.clickhouse) return;

    try {
      // 使用现有的 clickhouse 接口
      await this.clickhouse.write(logRecord);
    } catch (error) {
      // 记录失败但不影响主流程
      console.error('Failed to log to Clickhouse:', error);
    }
  }



  // 使用多个引擎执行翻译（非流式）
  private async executeTranslateWithEngines(
    query: string,
    target: string,
    engines: string[],
    options: TranslateRequestOptions,
    requestId: string
  ): Promise<TranslateResult> {
    const startTime = Date.now();
    let retryCount = 0;
    // 修复：增加重试次数，确保能尝试所有指定的引擎
    const maxRetries = Math.max(engines.length, this.config.tlbConfig?.maxRetries || 3);

    while (retryCount < maxRetries) {
      let token: TLBToken | null = null;
      let engineName: string = '';

      try {
        // 使用TLB的智能故障转移选择引擎（不传递failedEngines，让取余算法自然避免重复选择）
        const selection = this.selectEngineWithTLB(engines);
        token = selection.token;
        engineName = selection.engineName;

        // 记录重试日志
        if (retryCount > 0) {
          console.log(`🔄 翻译引擎重试: 第${retryCount + 1}次重试, 选择引擎 ${engineName}`);
        }

        // 如果没有获取到令牌，说明所有引擎的令牌都已耗尽
        if (!token) {
          throw new Error('No available tokens in any engine');
        }

        const engine = this.loader.getEngine(engineName);
        if (!engine) {
          // 如果引擎不可用，直接重试（令牌已被消费，不归还）
          retryCount++;
          continue;
        }

        const breaker = this.getOrCreateBreaker(engineName, (args: TranslateArgs) => engine.translate(args));

        // 从 KeyManager 获取 API Key
        const keyInfo = await this.keyManager.getNextKey(engineName);

        // 修复：移除强制 API Key 检查，让测试引擎即使没有 API Key 也能正常工作
        const args: TranslateArgs = {
          query,
          target,
          source: options.source,
          format: options.format || 'text',
          model: options.model || 'nmt',
          userAgent: options.userAgent,
          requestId,
          apiKey: keyInfo?.key,  // 即使为空也传递
          httpProxy: keyInfo?.proxy || options.httpProxy,
        };

        const result = await this.withTimeout(
          breaker.fire(args),
          this.config.requestTimeoutMs
        );

        // 确保 result 有正确的类型
        if (result && typeof result === 'object') {
          // 记录成功执行的引擎
          if (retryCount > 0) {
            console.log(`✅ 翻译引擎重试成功: 最终使用引擎 ${engineName}, 总耗时 ${Date.now() - startTime}ms`);
          } else {
            console.log(`✅ 翻译引擎执行成功: 使用引擎 ${engineName}, 耗时 ${Date.now() - startTime}ms`);
          }

          // 成功的请求不归还令牌（令牌已经被消费）
          return {
            ...result,
            latencyMs: Date.now() - startTime,
          } as TranslateResult;
        }
      } catch (error) {
        console.error(`Engine execution failed (attempt ${retryCount + 1}):`, error);

        // 令牌已被消费，不归还（这是TLB的设计意图）

        if (retryCount < maxRetries - 1) {
          // 延迟1秒后重试
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        retryCount++;
      }
    }

    // 所有重试都失败了
    throw new Error('All translate engines failed after retries');
  }

  // 流式翻译方法（添加故障转移和重试机制）
  async translateStream(
    query: string,
    target: string,
    options: TranslateRequestOptions = {}
  ): Promise<ReadableStream> {
    const requestId = this.generateRequestId(options);

    // 根据路由键选择引擎分组
    const engines = this.selectTranslateEnginesByRoutingKey(options, target);

    if (engines.length === 0) {
      throw new Error('No available translate engines');
    }

    // 记录请求日志
    this.logRequest(requestId, engines, options, '/v1/translate');

    const startTime = Date.now();
    let retryCount = 0;
    // 修复：增加重试次数，确保能尝试所有指定的引擎
    const maxRetries = Math.max(engines.length, this.config.tlbConfig?.maxRetries || 3);

    while (retryCount < maxRetries) {
      let token: TLBToken | null = null;
      let engineName: string = '';

      try {
        // 使用TLB的智能故障转移选择引擎（不传递failedEngines，让取余算法自然避免重复选择）
        const selection = this.selectEngineWithTLB(engines);
        token = selection.token;
        engineName = selection.engineName;

        // 记录重试日志
        if (retryCount > 0) {
          console.log(`🔄 流式翻译引擎重试: 第${retryCount + 1}次重试, 选择引擎 ${engineName}`);
        }

        if (!token) {
          throw new Error('No available tokens for streaming translation');
        }

        const engine = this.loader.getEngine(engineName);
        if (!engine) {
          // 如果引擎不可用，直接重试（令牌已被消费，不归还）
          retryCount++;
          continue;
        }

        // 从 KeyManager 获取 API Key
        const keyInfo = await this.keyManager.getNextKey(engineName);

        // 移除强制 API Key 检查，让引擎自己决定是否需要 API Key
        // 这样测试引擎即使没有 API Key 也能正常工作

        // 检查引擎是否支持流式翻译
        if (engine.translateStream) {
          try {
            // 使用引擎的流式翻译方法
            const stream = await engine.translateStream({
              query,
              target,
              source: options.source,
              format: options.format,
              model: options.model,
              apiKey: keyInfo?.key,  // 即使为空也传递
              httpProxy: keyInfo?.proxy,
              userAgent: options.userAgent,
              requestId,
            });

            // 记录成功日志
            const logRecord = this.createLogRecord(requestId, [engineName], options, {
              provider: engineName,
              query,
              target,
              source: options.source,
              translatedText: 'Stream response',
              latencyMs: Date.now() - startTime,
            });
            await this.logToClickhouse(logRecord);

            // 返回流式响应
            return stream;
          } catch (streamError) {
            console.log(`Engine ${engineName} streaming failed, falling back to regular translation:`, streamError);

            // 流式翻译失败，尝试普通翻译
            try {
              const result = await engine.translate({
                query,
                target,
                source: options.source,
                format: options.format,
                model: options.model,
                apiKey: keyInfo?.key,  // 即使为空也传递
                httpProxy: keyInfo?.proxy,
                userAgent: options.userAgent,
                requestId,
              });

              // 记录成功日志
              const logRecord = this.createLogRecord(requestId, [engineName], options, result);
              await this.logToClickhouse(logRecord);

              // 将普通翻译结果转换为 SSE 格式的流式响应
              const stream = new ReadableStream({
                start(controller) {
                  // 发送翻译结果
                  const data = `data: ${JSON.stringify({
                    status: "translated",
                    provider: result.provider,
                    translatedText: result.translatedText,
                    source: result.source,
                    target: result.target,
                    query: result.query,
                    latencyMs: result.latencyMs
                  })}\n\n`;
                  controller.enqueue(new TextEncoder().encode(data));

                  // 发送完成信号
                  const completed = `data: ${JSON.stringify({
                    status: "completed",
                    provider: result.provider
                  })}\n\n`;
                  controller.enqueue(new TextEncoder().encode(completed));

                  controller.close();
                }
              });

              return stream;
            } catch (translateError) {
              // 普通翻译也失败了，抛出错误
              throw new Error(`Engine ${engineName} both streaming and regular translation failed: ${translateError instanceof Error ? translateError.message : String(translateError)}`);
            }
          }
        } else {
          // 如果引擎不支持流式翻译，回退到普通翻译
          const result = await engine.translate({
            query,
            target,
            source: options.source,
            format: options.format,
            model: options.model,
            apiKey: keyInfo?.key,  // 即使为空也传递
            httpProxy: keyInfo?.proxy,
            userAgent: options.userAgent,
            requestId,
          });

          // 记录成功日志
          const logRecord = this.createLogRecord(requestId, [engineName], options, result);
          await this.logToClickhouse(logRecord);

          // 将普通翻译结果转换为 SSE 格式的流式响应
          const stream = new ReadableStream({
            start(controller) {
              // 发送翻译结果
              const data = `data: ${JSON.stringify({
                status: "translated",
                provider: result.provider,
                translatedText: result.translatedText,
                source: result.source,
                target: result.target,
                query: result.query,
                latencyMs: result.latencyMs
              })}\n\n`;
              controller.enqueue(new TextEncoder().encode(data));

              // 发送完成信号
              const completed = `data: ${JSON.stringify({
                status: "completed",
                provider: result.provider
              })}\n\n`;
              controller.enqueue(new TextEncoder().encode(completed));

              controller.close();
            }
          });

          return stream;
        }
      } catch (error) {
        console.error(`Engine execution failed (attempt ${retryCount + 1}):`, error);

        // 令牌已被消费，不归还（这是TLB的设计意图）

        if (retryCount < maxRetries - 1) {
          // 延迟1秒后重试
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        retryCount++;
      }
    }

    // 所有重试都失败了
    const error = new Error('All translate engines failed after retries');
    const logRecord = this.createLogRecord(requestId, engines, options, undefined, error);
    await this.logToClickhouse(logRecord);
    throw error;
  }

  // 非流式翻译方法（使用完整的TLB策略）
  async translate(
    query: string,
    target: string,
    options: TranslateRequestOptions = {}
  ): Promise<TranslateResult> {
    const requestId = this.generateRequestId(options);

    // 根据路由键选择引擎分组
    const engines = this.selectTranslateEnginesByRoutingKey(options, target);

    if (engines.length === 0) {
      throw new Error('No available translate engines');
    }

    // 记录请求日志
    this.logRequest(requestId, engines, options, '/v1/translate');

    try {
      // 使用完整的TLB策略执行翻译
      const result = await this.executeTranslateWithEngines(
        query,
        target,
        engines,
        options,
        requestId
      );

      // 记录成功日志
      const logRecord = this.createLogRecord(requestId, engines, options, result);
      await this.logToClickhouse(logRecord);

      return result;
    } catch (error) {
      // 记录失败日志
      const logRecord = this.createLogRecord(requestId, engines, options, undefined, error as Error);
      await this.logToClickhouse(logRecord);
      throw error;
    }
  }



  // 根据路由键选择引擎分组（使用基类的通用方法）
  private selectTranslateEnginesByRoutingKey(options: TranslateRequestOptions, target?: string): TranslateEngineName[] {
    // 使用基类的通用引擎选择方法，完全动态化
    return this.selectEngines(options);
  }

  // 设置路由分组策略
  setRoutingGroups(groups: Record<string, TranslateEngineName[]>): void {
    // 使用基类的引擎分组管理
    this.setEngineGroups(groups);
  }

  // 清理当前路由键配置中的无效引擎
  cleanCurrentRoutingGroups(): void {
    this.cleanCurrentEngineGroups();
  }
}
