// API 响应类型
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// 用户类型
export interface User {
  id: string;
  username: string;
  email: string;
  role: 'user' | 'admin';
  createdAt: string;
}

// 搜索请求类型
export interface SearchRequest {
  query: string;
  engine?: string;
  language?: string;
  region?: string;
}

// 搜索结果类型
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  engine: string;
  timestamp: string;
}

// 翻译请求类型
export interface TranslateRequest {
  text: string;
  from: string;
  to: string;
  engine?: string;
}

// 翻译结果类型
export interface TranslateResult {
  originalText: string;
  translatedText: string;
  from: string;
  to: string;
  engine: string;
}

// 引擎状态类型
export interface EngineStatus {
  name: string;
  status: 'active' | 'inactive' | 'error';
  lastCheck: string;
  responseTime?: number;
}

// 引擎状态详情类型
export interface EngineStatusDetail {
  name: string;
  type: 'search' | 'translate';
  available: boolean;
  default: boolean;
  tlbSynced?: boolean;
}

// 引擎状态响应类型
export interface EngineStatusResponse {
  timestamp: string;
  search: {
    engines: EngineStatusDetail[];
    default: string[];
    total: number;
  };
  translate: {
    engines: EngineStatusDetail[];
    default: string[];
    total: number;
  };
}

// 认证头部类型
export interface AuthHeaders {
  Authorization?: string;
  'Content-Type': string;
}

// 基础配置类型
export interface BaseConfig {
  baseUrl: string;
  apiVersion: string;
}
