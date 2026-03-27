import { Engine, SearchArgs, SearchResult } from '../../src/types/index';
import { buildDispatcher, httpJson } from '../../src/utils/http';

interface BingWebPage {
  name: string;
  url: string;
  snippet: string;
  displayUrl: string;
}

interface BingSearchResponse {
  webPages?: {
    value: BingWebPage[];
  };
}

export const engine: Engine = {
  name: 'bing',
  async search(args: SearchArgs): Promise<SearchResult> {
    const dispatcher = buildDispatcher(args.httpProxy);
    const apiKey = args.apiKey;
    if (!apiKey) throw new Error('No API key provided for Bing engine');
    const started = Date.now();
    const url = new URL('https://api.bing.microsoft.com/v7.0/search');
    url.searchParams.set('q', args.query);
    if (args.limit) url.searchParams.set('count', String(args.limit));
    const { json, status } = await httpJson<BingSearchResponse>(url.toString(), {
      method: 'GET',
      dispatcher,
      headers: {
        'Ocp-Apim-Subscription-Key': apiKey,
        'accept': 'application/json',
      },
    });
    if (status >= 400) {
      throw new Error(`bing http ${status}: ${JSON.stringify(json)}`);
    }
    const web = json?.webPages?.value || [];
    const items = web.map((it) => ({
      title: it.name,
      url: it.url,
      snippet: it.snippet,
      source: it.displayUrl,
    }));
    return {
      provider: 'bing',
      query: args.query,
      items,
      raw: json,
      latencyMs: Date.now() - started,
    };
  },
};

export default engine;


