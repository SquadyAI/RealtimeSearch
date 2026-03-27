import { TranslateEngine, TranslateArgs, TranslateResult } from '../../src/types/index';
import { buildDispatcher, httpJson } from '../../src/utils/http';

export const engine = {
  name: 'deepl',

  async translate(args: TranslateArgs): Promise<TranslateResult> {
    const dispatcher = buildDispatcher(args.httpProxy);
    const apiKey = args.apiKey;

    if (!apiKey) throw new Error('DEEPL_API_KEYS missing');

    const started = Date.now();

    // 简化请求体，只保留必要参数
    const requestBody = {
      text: args.query,
      target_lang: args.target,
    };

    console.log('Deepl translate: Request body:', JSON.stringify(requestBody, null, 2));

    const { json, status } = await httpJson<any>(`https://api-free.deepl.com/v2/translate`, {
      method: 'POST',
      dispatcher,
      headers: {
        'Authorization': `DeepL-Auth-Key ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (status >= 400) {
      throw new Error(`deepl translate http ${status}: ${JSON.stringify(json)}`);
    }

    const translatedText = json?.translations?.[0]?.text || args.query;

    return {
      provider: 'deepl',
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
    if (!apiKey) throw new Error('DEEPL_API_KEYS missing');

    try {
      // 简化请求体，只保留必要参数
      const requestBody = {
        text: args.query,
        target_lang: args.target,
      };

      console.log('Deepl translateStream: Request body:', JSON.stringify(requestBody, null, 2));

      const response = await fetch('https://api-free.deepl.com/v2/translate', {
        method: 'POST',
        headers: {
          'Authorization': `DeepL-Auth-Key ${apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`DeepL streaming API error: ${response.status} ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('text/event-stream')) {
        return response.body as ReadableStream;
      } else {
        throw new Error('DeepL API does not support streaming translation');
      }
    } catch (error) {
      throw new Error(`DeepL streaming failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
} as TranslateEngine & { translateStream: (args: TranslateArgs) => Promise<ReadableStream> };

export default engine;
