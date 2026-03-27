import { TranslateEngine, TranslateArgs, TranslateResult } from '../../src/types/index';
import { buildDispatcher, httpJson } from '../../src/utils/http';

export const engine = {
  name: 'squady',

  async translate(args: TranslateArgs): Promise<TranslateResult> {
    const dispatcher = buildDispatcher(args.httpProxy);
    const apiKey = args.apiKey;
    const baseUrl = args.baseUrl;

    if (!apiKey) throw new Error('SQUADY_API_KEYS missing');
    if (!baseUrl) throw new Error('SQUADY_URL missing');

    const started = Date.now();

    // 简化请求体，只保留必要参数
    const requestBody = {
      q: args.query,
      target: args.target,
    };

    console.log('Squady translate: Request body:', JSON.stringify(requestBody, null, 2));

    const { json, status } = await httpJson<any>(`${baseUrl}/translate`, {
      method: 'POST',
      dispatcher,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify(requestBody),
    });

    if (status >= 400) {
      throw new Error(`squady translate http ${status}: ${JSON.stringify(json)}`);
    }

    // 尝试多种可能的响应字段
    const translatedText = json?.translatedText || json?.text || json?.data || json?.result || args.query;

    return {
      provider: 'squady',
      query: args.query,
      target: args.target,
      source: args.source,
      translatedText,
      raw: json,
      latencyMs: Date.now() - started,
    };
  },

  async translateStream(args: TranslateArgs): Promise<ReadableStream> {
    const apiKey = args.apiKey;
    const baseUrl = args.baseUrl;

    if (!apiKey) throw new Error('SQUADY_API_KEYS missing');
    if (!baseUrl) throw new Error('SQUADY_URL missing');

    console.log(`Squady: Attempting streaming translation for query: "${args.query}"`);

    // 构建请求体，确保格式完全一致
    const requestBody = {
      q: args.query,
      target: args.target,
      format: args.format || 'text',
    };

    console.log('Squady: Request body:', JSON.stringify(requestBody, null, 2));

    try {
      const response = await fetch(`${baseUrl}/translate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'text/event-stream, application/json', // 明确接受流式响应
          'Cache-Control': 'no-cache', // 避免缓存
        },
        body: JSON.stringify(requestBody),
      });

      console.log(`Squady: Response status: ${response.status}, headers:`, Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        throw new Error(`squady translateStream http ${response.status}: ${response.statusText}`);
      }

      // 检查响应类型和内容长度
      const contentType = response.headers.get('content-type');
      const contentLength = response.headers.get('content-length');
      const transferEncoding = response.headers.get('transfer-encoding');

      console.log(`Squady: Content-Type: ${contentType}, Content-Length: ${contentLength}, Transfer-Encoding: ${transferEncoding}`);

      // 更严格的流式检测
      if (contentType && contentType.includes('text/event-stream')) {
        // 标准的 SSE 流式响应
        console.log('Squady: Returning standard SSE streaming response');
        return response.body as ReadableStream;
      } else if (contentType && contentType.includes('application/json')) {
        // 检查是否是真正的流式 JSON 响应
        if (transferEncoding === 'chunked' || !contentLength || parseInt(contentLength) > 1000) {
          // chunked 传输或内容长度较大，可能是流式响应
          console.log('Squady: Returning chunked JSON streaming response');
          return response.body as ReadableStream;
        } else {
          // 内容长度较小，可能是完整的 JSON 响应，不是流式
          console.log('Squady: Response appears to be complete JSON, not streaming. Throwing error to trigger fallback.');
          throw new Error('Squady response appears to be complete JSON, not streaming. Triggering fallback to translate method.');
        }
      } else {
        console.log('Squady: Response format not recognized, throwing error to trigger fallback');
        throw new Error('Squady response format not recognized, triggering fallback to translate method');
      }
    } catch (error) {
      console.error('Squady translateStream error:', error);
      throw error;
    }
  },
} as TranslateEngine & { translateStream: (args: TranslateArgs) => Promise<ReadableStream> };

export default engine;
