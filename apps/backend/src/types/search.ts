// 搜索相关类型定义
import type { BaseEngine, BaseEngineAttempt, BaseLogRecord, BaseRequestOptions, BaseResult, EngineName } from './base';

export type SearchArgs = {
  query: string;
  apiKey?: string;
  httpProxy?: string;
  limit?: number;
  locale?: string;
  safesearch?: 'off' | 'moderate' | 'strict';
  freshness?: string;
  userAgent?: string;
  requestId?: string;
  signal?: AbortSignal;
};

export type SearchItem = {
  title: string;
  url: string;
  snippet?: string;
  source?: string;
  publishedAt?: string;
};

export type SearchResult = BaseResult & {
  query: string;
  items: SearchItem[];
};

export type SearchEngine = BaseEngine<SearchArgs, SearchResult> & {
  search(args: SearchArgs): Promise<SearchResult>;
};

// 为了向后兼容，保留旧的 Engine 类型别名
export type Engine = SearchEngine;

export type SearchEngineModule = {
  engine: SearchEngine;
};

// 继承基础引擎尝试记录类型
export type SearchEngineAttempt = BaseEngineAttempt;

// 继承基础日志记录类型
export type SearchLogRecord = BaseLogRecord & {
  query: string;
  resultCount?: number;
  itemsSample?: SearchItem[];
};

// 继承基础请求选项类型
export type SearchRequestOptions = BaseRequestOptions & {
  limit?: number;
  locale?: string;
  safesearch?: 'off' | 'moderate' | 'strict';
  freshness?: string;
  userAgent?: string;
};
