import { Engine, SearchArgs, SearchResult } from '../../src/types/index';
import { buildDispatcher, httpJson } from '../../src/utils/http';

interface SerperOrganicResult {
  title: string;
  link: string;
  snippet: string;
  source: string;
}

interface SerperSearchResponse {
  organic?: SerperOrganicResult[];
}

export const engine: Engine = {
  name: 'serper',
  async search(args: SearchArgs): Promise<SearchResult> {
    // 调试日志：显示代理配置
    console.log(`🔍 Serper引擎代理配置: httpProxy="${args.httpProxy}"`);
    console.log(`🔍 环境变量HTTP_PROXY: "${process.env.HTTP_PROXY}"`);
    console.log(`🔍 环境变量HTTPS_PROXY: "${process.env.HTTPS_PROXY}"`);

    const dispatcher = buildDispatcher(args.httpProxy);
    const apiKey = args.apiKey;
    if (!apiKey) throw new Error('SERPER_API_KEYS missing');

    // 调试日志：显示使用的API密钥（隐藏敏感信息）
    const maskedKey = apiKey ? `${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}` : 'none';
    console.log(`🔑 Serper引擎使用API密钥: ${maskedKey}`);
    console.log(`🌐 Serper引擎请求URL: https://google.serper.dev/search`);
    console.log(`📝 Serper引擎查询: "${args.query}"`);

    const started = Date.now();
    const { json, status } = await httpJson<SerperSearchResponse>('https://google.serper.dev/search', {
      method: 'POST',
      dispatcher,
      headers: {
        'X-API-KEY': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ q: args.query, gl: args.locale, num: args.limit }),
    });
    if (status >= 400) {
      throw new Error(`serper http ${status}: ${JSON.stringify(json)}`);
    }
    const items = (json?.organic || []).map((it) => ({
      title: it.title,
      url: it.link,
      snippet: it.snippet,
      source: it.source,
    }));
    return {
      provider: 'serper',
      query: args.query,
      items,
      raw: json,
      latencyMs: Date.now() - started,
    };
  },
};

export default engine;





