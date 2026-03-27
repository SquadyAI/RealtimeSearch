import { Engine, SearchArgs, SearchResult } from '../../src/types/index';
import { buildDispatcher, httpJson } from '../../src/utils/http';

interface BraveWebResult {
  title: string;
  url: string;
  description: string;
  profile?: {
    name: string;
  };
}

interface BraveSearchResponse {
  web?: {
    results: BraveWebResult[];
  };
}

export const engine: Engine = {
  name: 'brave',
  async search(args: SearchArgs): Promise<SearchResult> {
    const dispatcher = buildDispatcher(args.httpProxy);
    const apiKey = args.apiKey;
    if (!apiKey) throw new Error('No API key provided for Brave engine');

    // 调试日志：显示使用的API密钥（隐藏敏感信息）
    const maskedKey = apiKey ? `${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}` : 'none';
    console.log(`🔑 Brave引擎使用API密钥: ${maskedKey}`);
    console.log(`🌐 Brave引擎请求URL: https://api.search.brave.com/res/v1/web/search`);
    console.log(`📝 Brave引擎查询: "${args.query}"`);

    const started = Date.now();
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', args.query);
    if (args.limit) url.searchParams.set('count', String(args.limit));
    if (args.safesearch) url.searchParams.set('safe', args.safesearch);
    if (args.freshness) url.searchParams.set('freshness', args.freshness);
    const { json, status } = await httpJson<BraveSearchResponse>(url.toString(), {
      method: 'GET',
      dispatcher,
      headers: {
        'X-Subscription-Token': apiKey,
        'accept': 'application/json',
      },
    });
    if (status >= 400) {
      throw new Error(`brave http ${status}: ${JSON.stringify(json)}`);
    }
    const web = json?.web?.results || [];
    const items = web.map((it) => ({
      title: it.title,
      url: it.url,
      snippet: it.description,
      source: it.profile?.name,
    }));
    return {
      provider: 'brave',
      query: args.query,
      items,
      raw: json,
      latencyMs: Date.now() - started,
    };
  },
};

export default engine;


