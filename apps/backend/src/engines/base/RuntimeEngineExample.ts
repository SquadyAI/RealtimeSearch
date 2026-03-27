// 运行时编译引擎示例代码
// 这是一个可以直接通过API接口传入的TypeScript代码示例

import { Engine, SearchArgs, SearchResult } from '../../types';

export const engine: Engine = {
  name: 'runtime-example',
  async search(args: SearchArgs): Promise<SearchResult> {
    const started = Date.now();

    // 模拟搜索结果
    const mockItems = [
      {
        title: `[Runtime] 动态编译引擎测试结果 1 - ${args.query}`,
        url: `https://example.com/runtime/result1?q=${encodeURIComponent(args.query)}`,
        snippet: `这是通过运行时编译创建的引擎，查询词：${args.query}。这个引擎是在运行时动态编译的！`,
        source: 'runtime-example',
      },
      {
        title: `[Runtime] 动态编译引擎测试结果 2 - ${args.query}`,
        url: `https://example.com/runtime/result2?q=${encodeURIComponent(args.query)}`,
        snippet: `运行时编译允许动态创建和更新引擎，无需重启服务。查询：${args.query}，引擎：${args.query}`,
        source: 'runtime-example',
      },
      {
        title: `[Runtime] 动态编译引擎测试结果 3 - ${args.query}`,
        url: `https://example.com/runtime/result3?q=${encodeURIComponent(args.query)}`,
        snippet: `这个功能非常强大，可以根据需要即时调整搜索逻辑和算法。`,
        source: 'runtime-example',
      }
    ];

    return {
      provider: 'runtime-example',
      query: args.query,
      items: mockItems,
      raw: {
        runtimeCompiled: true,
        timestamp: new Date().toISOString(),
        query: args.query,
        resultCount: mockItems.length
      },
      latencyMs: Date.now() - started,
    };
  },
};

export default engine;
