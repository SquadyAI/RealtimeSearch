// 翻译相关类型定义
import type { BaseEngine, BaseEngineAttempt, BaseLogRecord, BaseRequestOptions, BaseResult, EngineName } from './base';

export type TranslateArgs = {
  query: string;
  target: string;
  source?: string;
  format?: 'html' | 'text';
  model?: string;
  apiKey?: string;
  httpProxy?: string;
  userAgent?: string;
  requestId?: string;
  signal?: AbortSignal;
  baseUrl?: string; // 用于自定义API端点URL
};

export type TranslateResult = BaseResult & {
  query: string;
  target: string;
  source?: string;
  translatedText: string;
};

export type TranslateEngine = BaseEngine<TranslateArgs, TranslateResult> & {
  translate(args: TranslateArgs): Promise<TranslateResult>;
};



// 继承基础引擎名称类型
export type TranslateEngineName = EngineName;

// 继承基础引擎尝试记录类型
export type TranslateEngineAttempt = BaseEngineAttempt;

// 继承基础日志记录类型
export type TranslateLogRecord = BaseLogRecord & {
  query: string;
  target: string;
  source?: string;
};

// 继承基础请求选项类型
export type TranslateRequestOptions = BaseRequestOptions & {
  source?: string;
  format?: 'html' | 'text';
  model?: string;
  userAgent?: string;
};
