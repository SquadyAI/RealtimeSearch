import { fetch, ProxyAgent, Dispatcher, RequestInit, Headers, Response } from 'undici';

export function buildDispatcher(proxyUrl?: string): Dispatcher | undefined {
  console.log(`🔧 buildDispatcher called with proxyUrl: "${proxyUrl}"`);

  // 强制禁用代理：如果proxyUrl是"proxy"或无效值，直接返回undefined
  if (!proxyUrl || proxyUrl === 'proxy' || proxyUrl === 'undefined' || proxyUrl === 'null') {
    console.log(`🔧 buildDispatcher: Invalid or disabled proxy URL "${proxyUrl}", returning undefined`);
    return undefined;
  }

  // 检查是否是有效的URL格式
  try {
    new URL(proxyUrl);
  } catch (err) {
    console.log(`🔧 buildDispatcher: Invalid URL format "${proxyUrl}", returning undefined`);
    return undefined;
  }

  try {
    console.log(`🔧 buildDispatcher: Creating ProxyAgent with URL: "${proxyUrl}"`);
    return new ProxyAgent(proxyUrl);
  } catch (err) {
    console.error('Failed to create proxy agent:', err);
    return undefined;
  }
}

// 带超时和重试的fetch包装器
async function fetchWithTimeout(
  url: string,
  init: RequestInit & { dispatcher?: Dispatcher; timeout?: number },
  timeout: number = 30000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// 带重试的HTTP请求
async function httpWithRetry<T>(
  url: string,
  init: RequestInit & { dispatcher?: Dispatcher; timeout?: number; retries?: number } = {},
  retries: number = 3
): Promise<{ json: T; status: number; headers: Headers }> {
  const timeout = init.timeout || 30000;
  const maxRetries = init.retries || retries;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, init, timeout);
      const status = res.status;
      const headers = res.headers;

      let json: any = null;
      try {
        json = await res.json();
      } catch (err) {
        console.warn(`Failed to parse JSON response from ${url}:`, err);
        json = {};
      }

      return { json, status, headers };
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }

      // 指数退避重试延迟
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
      console.warn(`Request to ${url} failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms:`, error);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error(`Failed after ${maxRetries} retries`);
}

export async function httpJson<T>(
  url: string,
  init: RequestInit & { dispatcher?: Dispatcher; timeout?: number; retries?: number } = {}
): Promise<{ json: T; status: number; headers: Headers }> {
  return httpWithRetry<T>(url, init);
}

/*
使用示例：

// 基本使用（默认30秒超时，3次重试）
const result = await httpJson<MyType>('https://api.example.com/data');

// 自定义超时和重试
const result = await httpJson<MyType>('https://api.example.com/data', {
  timeout: 10000,  // 10秒超时
  retries: 5,      // 5次重试
  method: 'POST',
  body: JSON.stringify(data)
});

// 带代理的请求
const dispatcher = buildDispatcher('http://proxy.example.com:8080');
const result = await httpJson<MyType>('https://api.example.com/data', {
  dispatcher,
  timeout: 15000,
  retries: 3
});
*/


