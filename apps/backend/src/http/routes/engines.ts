import { FastifyInstance } from 'fastify';
import { SearchEngineLoader } from '../../engines/search/SearchEngineLoader';
import { TranslateEngineLoader } from '../../engines/translate/TranslateEngineLoader';
import { ServiceConfig } from '../../types';
import { EngineCode } from '../../engines/base/RuntimeCompiler';
import { ExtendedFastifyInstance } from '../../types/extensions';

export async function registerEngineRoutes(
  app: ExtendedFastifyInstance, 
  deps: { 
    loader: SearchEngineLoader; 
    translateLoader: TranslateEngineLoader;
    config: ServiceConfig;
  }
) {
  const { loader, translateLoader, config } = deps;

  // 获取TLB管理器
  const getTLBManager = (type: 'search' | 'translate') => 
    type === 'search' ? app.searchManager?.tlbManager : app.translateManager?.tlbManager;

  // 删除引擎处理函数
  const deleteEngineHandler = async (name: string) => {
    try {
      // 从引擎加载器中移除
      let removedFromSearch = false;
      let removedFromTranslate = false;
      
      if (loader.getEngine(name)) {
        await loader.removeEngine(name);
        removedFromSearch = true;
      }
      if (translateLoader?.getEngine(name)) {
        await translateLoader.removeEngine(name);
        removedFromTranslate = true;
      }

      // 从配置中移除引擎
      let configUpdated = false;
      if (config.defaultEngines?.includes(name)) {
        (config as any).defaultEngines = config.defaultEngines.filter((e: string) => e !== name);
        configUpdated = true;
      }
      if (config.defaultTranslateEngines?.includes(name)) {
        (config as any).defaultTranslateEngines = config.defaultTranslateEngines.filter((e: string) => e !== name);
        configUpdated = true;
      }

      // TLB同步
      getTLBManager('search')?.hotSwapRemoveEngine(name);
      getTLBManager('translate')?.hotSwapRemoveEngine(name);

      return { 
        success: true, 
        message: '引擎删除成功', 
        details: {
          removedFromSearch,
          removedFromTranslate,
          configUpdated,
          name
        }
      };
    } catch (error: any) {
      console.error('Delete engine error:', error);
      return { 
        error: '删除引擎失败', 
        details: String(error?.message || error),
        name
      };
    }
  };

  // 获取引擎状态
  const getEngineStatus = (name: string, type: 'search' | 'translate') => {
    const available = type === 'search' ? !!loader.getEngine(name) : !!translateLoader?.getEngine(name);
    const isDefault = type === 'search' 
      ? config.defaultEngines?.includes(name) || false
      : config.defaultTranslateEngines?.includes(name) || false;
    
    // 从TLB管理器获取真实的启用状态
    const tlbManager = getTLBManager(type);
    const isEnabled = tlbManager ? tlbManager.getRegisteredEngines().includes(name) : false;
    
    return {
      name,
      type,
      available,
      enabled: isEnabled, // 添加启用状态
      default: isDefault,
      tlbSynced: getTLBManager(type)?.getRegisteredEngines().includes(name) || false
    };
  };

  // 引擎启用/禁用功能
  const toggleEngine = async (name: string, type: 'search' | 'translate', enabled: boolean) => {
    try {
      const tlbManager = getTLBManager(type);
      if (tlbManager) {
        if (enabled) {
          const maxTokens = 10; // 默认值
          tlbManager.hotSwapAddEngine(name, maxTokens);
        } else {
          tlbManager.hotSwapRemoveEngine(name);
        }
      }
      return { success: true, engine: name, enabled, type };
    } catch (error: any) {
      return { success: false, error: String(error?.message || error) };
    }
  };

  // 获取引擎列表
  app.get('/v1/engines/list', async () => {
    try {
      const searchEngines = loader.listEngineNames();
      const translateEngines = translateLoader?.listEngineNames() || [];
      
      return {
        search: searchEngines.map((name: string) => getEngineStatus(name, 'search')),
        translate: translateEngines.map((name: string) => getEngineStatus(name, 'translate')),
        total: {
          search: searchEngines.length,
          translate: translateEngines.length
        }
      };
    } catch (error: any) {
      return { error: '获取引擎列表失败', details: String(error?.message || error) };
    }
  });

  // 创建新引擎
  app.post('/v1/engines/create', async (req: any, reply: any) => {
    const { name, type, config: engineConfig, httpProxy } = req.body || {};
    
    if (!name || !type) {
      reply.code(400);
      return { error: '引擎名称和类型是必需的' };
    }
    
    if (!['search', 'translate'].includes(type)) {
      reply.code(400);
      return { error: 'type必须是search或translate' };
    }

    try {
      // 检查引擎是否已存在
      const existingEngine = type === 'search' 
        ? loader.getEngine(name) 
        : translateLoader?.getEngine(name);
      
      if (existingEngine) {
        reply.code(409);
        return { error: `引擎 '${name}' 已存在` };
      }

      // 创建引擎实例
      let newEngine: any;

      if (type === 'search') {
        newEngine = {
          name,
          async search(args: any): Promise<any> {
            const started = Date.now();
            
            // 模拟搜索结果，让引擎看起来可用
            const mockItems = [
              {
                title: `[${name}] 测试搜索结果 1 - ${args.query}`,
                url: `https://test.example.com/${name}/result1?q=${encodeURIComponent(args.query)}`,
                snippet: `这是由 ${name} 引擎返回的测试搜索结果，查询词：${args.query}。这是一个固定的测试结果，用于验证引擎功能。`,
                source: name,
                timestamp: new Date().toISOString()
              },
              {
                title: `[${name}] 测试搜索结果 2 - ${args.query}`,
                url: `https://test.example.com/${name}/result2?q=${encodeURIComponent(args.query)}`,
                snippet: `另一个测试结果，展示 ${name} 引擎的功能。查询：${args.query}，引擎：${name}。`,
                source: name,
                timestamp: new Date().toISOString()
              },
              {
                title: `[${name}] 测试搜索结果 3 - ${args.query}`,
                url: `https://test.example.com/${name}/result3?q=${encodeURIComponent(args.query)}`,
                snippet: `第三个测试结果，证明 ${name} 引擎正常工作。这是固定的测试数据。`,
                source: name,
                timestamp: new Date().toISOString()
              },
              {
                title: `[${name}] 测试搜索结果 4 - ${args.query}`,
                url: `https://test.example.com/${name}/result4?q=${encodeURIComponent(args.query)}`,
                snippet: `第四个测试结果，包含更多详细信息。引擎：${name}，查询：${args.query}。`,
                source: name,
                timestamp: new Date().toISOString()
              }
            ];
            
            return {
              provider: name,
              query: args.query,
              items: mockItems,
              raw: { 
                mock: true, 
                engine: name, 
                query: args.query,
                timestamp: new Date().toISOString(),
                testData: true,
                resultCount: mockItems.length,
                engineType: 'search',
                features: ['search', 'mock', 'test']
              },
              latencyMs: Date.now() - started,
            };
          },
          
          // 简单的流式翻译支持
          async translateStream(query: string, target: string, options: any = {}): Promise<ReadableStream> {
            const testTranslation = `[${name}] 测试翻译：${query} → ${target}`;
            
            // 直接返回翻译结果作为流
            const stream = new ReadableStream({
              start(controller) {
                controller.enqueue(new TextEncoder().encode(testTranslation));
                controller.close();
              }
            });
            
            return stream;
          }
        };
        await loader.addEngine(name, newEngine);
        
        // 添加到默认搜索引擎列表
        if (config.defaultEngines && !config.defaultEngines.includes(name)) {
          (config as any).defaultEngines = [...config.defaultEngines, name];
        }
        
        // 同步到TLB管理器
        const searchTLBManager = getTLBManager('search');
        if (searchTLBManager) {
          const maxTokens = engineConfig?.maxTokens || 10;
          searchTLBManager.hotSwapAddEngine(name, maxTokens);
        }
        
      } else if (type === 'translate') {
        newEngine = {
          name,
          async translate(args: any): Promise<any> {
            const started = Date.now();
            
            // 模拟翻译结果，让引擎看起来可用
            const mockTranslatedText = `[${name}] 测试翻译结果：${args.query} → ${args.target}`;
            
            // 根据目标语言生成不同的测试翻译
            let testTranslation = mockTranslatedText;
            if (args.target === 'zh') {
              testTranslation = `[${name}] 中文翻译：${args.query} → 这是测试翻译结果`;
            } else if (args.target === 'en') {
              testTranslation = `[${name}] English Translation: ${args.query} → This is a test translation result`;
            } else if (args.target === 'ja') {
              testTranslation = `[${name}] 日本語翻訳：${args.query} → これはテスト翻訳結果です`;
            } else if (args.target === 'ko') {
              testTranslation = `[${name}] 한국어 번역: ${args.query} → 이것은 테스트 번역 결과입니다`;
            } else if (args.target === 'fr') {
              testTranslation = `[${name}] Traduction française: ${args.query} → Ceci est un résultat de traduction de test`;
            } else if (args.target === 'de') {
              testTranslation = `[${name}] Deutsche Übersetzung: ${args.query} → Dies ist ein Testübersetzungsergebnis`;
            } else if (args.target === 'es') {
              testTranslation = `[${name}] Traducción española: ${args.query} → Este es un resultado de traducción de prueba`;
            }
            
            return {
              provider: name,
              query: args.query,
              target: args.target,
              source: args.source || 'auto',
              translatedText: testTranslation,
              raw: { 
                mock: true, 
                engine: name, 
                query: args.query,
                target: args.target,
                source: args.source || 'auto',
                timestamp: new Date().toISOString(),
                testData: true,
                languageSupport: ['zh', 'en', 'ja', 'ko', 'fr', 'de', 'es']
              },
              latencyMs: Date.now() - started,
            };
          }
        };
        if (translateLoader) {
          await translateLoader.addEngine(name, newEngine);
        }
        
        // 添加到默认翻译引擎列表
        if (config.defaultTranslateEngines && !config.defaultTranslateEngines.includes(name)) {
          (config as any).defaultTranslateEngines = [...config.defaultTranslateEngines, name];
        }
        
        // 同步到TLB管理器
        const translateTLBManager = getTLBManager('translate');
        if (translateTLBManager) {
          const maxTokens = engineConfig?.maxTokens || 10;
          translateTLBManager.hotSwapAddEngine(name, maxTokens);
        }
      }

      // 设置HTTP代理（如果提供）
      if (httpProxy && app.keyManager) {
        app.keyManager.setEngineProxy(name, httpProxy);
      }

      return {
        success: true,
        message: `引擎 '${name}' 创建成功`,
        details: {
          name,
          type,
          addedToConfig: true,
          tlbSynced: true,
          note: '引擎已创建并添加到默认引擎列表，可以立即使用'
        }
      };
    } catch (error: any) {
      reply.code(500);
      return { 
        error: '创建引擎失败', 
        details: String(error?.message || error)
      };
    }
  });

  // 获取引擎状态
  app.get('/v1/engines/status', async () => {
    try {
      const searchEngines = loader.listEngineNames();
      const translateEngines = translateLoader?.listEngineNames() || [];
      
      return {
        timestamp: new Date().toISOString(),
        search: {
          engines: searchEngines.map((name: string) => getEngineStatus(name, 'search')),
          default: config.defaultEngines || [],
          total: searchEngines.length
        },
        translate: {
          engines: translateEngines.map((name: string) => getEngineStatus(name, 'translate')),
          default: config.defaultTranslateEngines || [],
          total: translateEngines.length
        }
      };
    } catch (error: any) {
      return { error: '获取引擎状态失败', details: String(error?.message || error) };
    }
  });

  // 测试引擎
  app.post('/v1/engines/test', async (req: any, reply: any) => {
    const { engine, type = 'search', query, apiKey, limit = 5 } = req.body || {};
    
    if (!engine || !type || !query) {
      reply.code(400);
      return { error: '缺少必需参数: engine, type, query' };
    }

    try {
      let result;
      
      if (type === 'search') {
        const searchEngine = loader.getEngine(engine);
        if (!searchEngine) {
          reply.code(404);
          return { error: `搜索引擎 '${engine}' 未找到` };
        }
        
        result = await searchEngine.search({
          query: String(query).trim(),
          apiKey: apiKey || undefined,
          httpProxy: config.httpProxy,
          limit: Math.min(Number(limit), 10),
          userAgent: req.headers['user-agent'],
        });
      } else if (type === 'translate') {
        if (!translateLoader) {
          reply.code(503);
          return { error: '翻译服务不可用' };
        }
        
        const translateEngine = translateLoader.getEngine(engine);
        if (!translateEngine) {
          reply.code(404);
          return { error: `翻译引擎 '${engine}' 未找到` };
        }
        
        result = await translateEngine.translate({
          query: String(query).trim(),
          target: req.body.to || 'en',
          source: req.body.from || 'auto',
          apiKey: apiKey || undefined,
          httpProxy: config.httpProxy,
        });
      } else {
        reply.code(400);
        return { error: '无效的引擎类型。必须是 "search" 或 "translate"' };
      }

      return {
        success: true,
        engine,
        type,
        query,
        result,
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      reply.code(502);
      return { 
        error: '引擎测试失败', 
        details: String(error?.message || error),
        engine,
        type,
        query
      };
    }
  });

  // DELETE 方法删除引擎
  app.delete('/v1/engines/:name', async (req: any, reply: any) => {
    const { name } = req.params;
    if (!name) {
      reply.code(400);
      return { error: '引擎名称是必需的' };
    }
    
    try {
      const result = await deleteEngineHandler(name);
      if (result.error) {
        reply.code(500);
        return result;
      }
      return result;
    } catch (error: any) {
      reply.code(500);
      return { error: '删除引擎失败: ' + (error?.message || String(error)) };
    }
  });

  // POST 方法删除引擎（备用方案）
  app.post('/v1/engines/:name/delete', async (req: any, reply: any) => {
    const { name } = req.params;
    if (!name) {
      reply.code(400);
      return { error: '引擎名称是必需的' };
    }
    
    try {
      const result = await deleteEngineHandler(name);
      if (result.error) {
        reply.code(500);
        return result;
      }
      return result;
    } catch (error: any) {
      reply.code(500);
      return { error: '删除引擎失败: ' + (error?.message || String(error)) };
    }
  });

  // 引擎启用/禁用接口
  app.post('/v1/engines/:name/toggle', async (req: any, reply: any) => {
    const { name } = req.params;
    const { enabled, type = 'search' } = req.body || {};
    
    if (!name || typeof enabled !== 'boolean') {
      reply.code(400);
      return { error: '引擎名称和enabled参数是必需的' };
    }
    if (!['search', 'translate'].includes(type)) {
      reply.code(400);
      return { error: 'type必须是search或translate' };
    }

    try {
      const result = await toggleEngine(name, type, enabled);
      if (result && result.success) {
        return { 
          ok: true, 
          engine: name, 
          enabled, 
          type,
          message: `引擎 ${name} 已${enabled ? '启用' : '禁用'}`
        };
      } else {
        reply.code(500);
        return { error: '操作失败', details: result.error };
      }
    } catch (error: any) {
      reply.code(500);
      return { error: '引擎操作失败: ' + (error?.message || String(error)) };
    }
  });

  // 批量引擎启用/禁用接口
  app.post('/v1/engines/batch-toggle', async (req: any, reply: any) => {
    const { engines, enabled, type = 'search' } = req.body || {};

    if (!Array.isArray(engines) || engines.length === 0 || typeof enabled !== 'boolean') {
      reply.code(400);
      return { error: 'engines数组和enabled参数是必需的' };
    }
    if (!['search', 'translate'].includes(type)) {
      reply.code(400);
      return { error: 'type必须是search或translate' };
    }

    const results = [];

    for (const engineName of engines) {
      try {
        const result = await toggleEngine(engineName, type, enabled);
        results.push({
          engine: engineName,
          success: result.success,
          enabled,
          error: result.error
        });
      } catch (error: any) {
        results.push({
          engine: engineName,
          success: false,
          error: String(error?.message || error)
        });
      }
    }

    return {
      ok: true,
      results,
      summary: {
        total: engines.length,
        success: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
      }
    };
  });

  // 运行时编译并添加引擎
  app.post('/v1/engines/compile', async (req: any, reply: any) => {
    const { name, type, code } = req.body || {};

    if (!name || !type || !code) {
      reply.code(400);
      return { error: '引擎名称、类型和代码都是必需的' };
    }

    if (!['search', 'translate'].includes(type)) {
      reply.code(400);
      return { error: 'type必须是search或translate' };
    }

    try {
      const engineCode: EngineCode = {
        name,
        code: String(code)
      };

      let result;

      if (type === 'search') {
        result = await loader.compileAndAddEngine(engineCode);
      } else if (type === 'translate') {
        if (!translateLoader) {
          reply.code(503);
          return { error: '翻译引擎加载器不可用' };
        }
        result = await translateLoader.compileAndAddEngine(engineCode);
      }

      if (result && result.success) {
        // 同步到TLB管理器
        const tlbManager = getTLBManager(type);
        if (tlbManager) {
          const maxTokens = 10; // 默认值
          tlbManager.hotSwapAddEngine(name, maxTokens);
        }

        return {
          success: true,
          message: '引擎编译并添加成功',
          engine: name,
          type,
          warnings: result.warnings || [],
          tlbSynced: true
        };
      } else {
        reply.code(400);
        return {
          success: false,
          error: '编译失败',
          details: result?.error
        };
      }
    } catch (error: any) {
      reply.code(500);
      return {
        error: '运行时编译失败',
        details: String(error?.message || error)
      };
    }
  });

  // 运行时编译并替换现有引擎（热重载）
  app.put('/v1/engines/compile/:name', async (req: any, reply: any) => {
    const { name } = req.params;
    const { type, code } = req.body || {};

    if (!name || !type || !code) {
      reply.code(400);
      return { error: '引擎名称、类型和代码都是必需的' };
    }

    if (!['search', 'translate'].includes(type)) {
      reply.code(400);
      return { error: 'type必须是search或translate' };
    }

    try {
      const engineCode: EngineCode = {
        name,
        code: String(code)
      };

      let result;

      if (type === 'search') {
        result = await loader.compileAndReplaceEngine(engineCode);
      } else if (type === 'translate') {
        if (!translateLoader) {
          reply.code(503);
          return { error: '翻译引擎加载器不可用' };
        }
        result = await translateLoader.compileAndReplaceEngine(engineCode);
      }

      if (result && result.success) {
        // 同步到TLB管理器
        const tlbManager = getTLBManager(type);
        if (tlbManager) {
          const maxTokens = 10; // 默认值
          tlbManager.hotSwapAddEngine(name, maxTokens);
        }

        return {
          success: true,
          message: '引擎热重载成功',
          engine: name,
          type,
          warnings: result.warnings || [],
          tlbSynced: true
        };
      } else {
        reply.code(400);
        return {
          success: false,
          error: '编译失败',
          details: result?.error
        };
      }
    } catch (error: any) {
      reply.code(500);
      return {
        error: '热重载失败',
        details: String(error?.message || error)
      };
    }
  });

  // 获取编译后的代码（用于调试）
  app.get('/v1/engines/compiled/:name', async (req: any, reply: any) => {
    const { name } = req.params;
    const { type } = req.query || {};

    if (!name || !type) {
      reply.code(400);
      return { error: '引擎名称和类型都是必需的' };
    }

    try {
      let compiledCode;

      if (type === 'search') {
        compiledCode = loader.runtimeCompiler.getCompiledCode(name);
      } else if (type === 'translate') {
        if (!translateLoader) {
          reply.code(503);
          return { error: '翻译引擎加载器不可用' };
        }
        compiledCode = translateLoader.runtimeCompiler.getCompiledCode(name);
      } else {
        reply.code(400);
        return { error: '无效的引擎类型' };
      }

      if (compiledCode) {
        return {
          success: true,
          engine: name,
          type,
          compiledCode
        };
      } else {
        reply.code(404);
        return {
          error: '未找到编译后的代码',
          engine: name,
          type
        };
      }
    } catch (error: any) {
      reply.code(500);
      return {
        error: '获取编译代码失败',
        details: String(error?.message || error)
      };
    }
  });
}
