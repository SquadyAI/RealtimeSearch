import { TranslateEngine, TranslateArgs, TranslateResult } from '../../src/types/index';
import { buildDispatcher, httpJson } from '../../src/utils/http';

export const engine = {
  name: 'google',

  async translate(args: TranslateArgs): Promise<TranslateResult> {
    const dispatcher = buildDispatcher(args.httpProxy);
    const apiKey = args.apiKey;

    if (!apiKey) throw new Error('GOOGLE_API_KEYS missing');

    const started = Date.now();

    // 简化请求体，只保留必要参数
    const requestBody = {
      q: args.query,
      target: args.target,
    };

    console.log('Google translate: Request body:', JSON.stringify(requestBody, null, 2));

    const { json, status } = await httpJson<any>(`https://translation.googleapis.com/language/translate/v2?key=${apiKey}`, {
      method: 'POST',
      dispatcher,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (status >= 400) {
      throw new Error(`google translate http ${status}: ${JSON.stringify(json)}`);
    }

    const translatedText = json?.data?.translations?.[0]?.translatedText || args.query;

    return {
      provider: 'google',
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
    if (!apiKey) throw new Error('GOOGLE_API_KEYS missing');

    try {
      // 简化请求体，只保留必要参数
      const requestBody = {
        q: args.query,
        target: args.target,
      };

      console.log('Google translateStream: Request body:', JSON.stringify(requestBody, null, 2));

      const url = new URL('https://translation.googleapis.com/language/translate/v2');
      url.searchParams.set('key', apiKey);

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`Google Translate streaming API error: ${response.status} ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('text/event-stream')) {
        return response.body as ReadableStream;
      } else {
        throw new Error('Google Translate API does not support streaming translation');
      }
    } catch (error) {
      throw new Error(`Google Translate streaming failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
} as TranslateEngine & { translateStream: (args: TranslateArgs) => Promise<ReadableStream> };

export default engine;
