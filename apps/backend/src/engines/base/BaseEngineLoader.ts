import fs from 'node:fs';
import path from 'node:path';
import { RuntimeCompiler, EngineCode } from './RuntimeCompiler';
// 使用动态导入避免类型问题
// import chokidar from 'chokidar';

// 通用引擎接口
export interface BaseEngine {
  name: string;
}

// 通用加载器接口
export interface BaseLoader<TEngine extends BaseEngine> {
  getEngine(name: string): TEngine | undefined;
  listEngineNames(): string[];
  findSourcePath(engineName: string): string | undefined;
}

export abstract class BaseEngineLoader<TEngine extends BaseEngine> implements BaseLoader<TEngine> {
  protected engines: Map<string, TEngine> = new Map();
  protected nameToPath: Map<string, string> = new Map();
  protected pathToName: Map<string, string> = new Map();
  protected watcher?: any; // 使用 any 类型避免 chokidar 类型问题
  public runtimeCompiler: RuntimeCompiler;

  constructor(
    protected directory: string,
    public onReload?: (name: string) => void
  ) {
    this.runtimeCompiler = new RuntimeCompiler();
  }

  listEngineNames(): string[] {
    return [...this.engines.keys()].sort();
  }

  getEngine(name: string): TEngine | undefined {
    return this.engines.get(name);
  }

  async loadAll(): Promise<void> {
    if (!fs.existsSync(this.directory)) {
      fs.mkdirSync(this.directory, { recursive: true });
    }

    console.log(`Checking directory: ${this.directory}`);
    console.log(`Directory exists: ${fs.existsSync(this.directory)}`);

    if (fs.existsSync(this.directory)) {
      console.log(`Reading directory contents...`);
      try {
        const allFiles = fs.readdirSync(this.directory);
        // 过滤掉系统文件和隐藏文件（如 .DS_Store）
        const visibleFiles = allFiles.filter((f) => !f.startsWith('.'));
        console.log(`All files in directory:`, visibleFiles);

        // 直接在指定目录中查找引擎文件，支持多种扩展名，但排除测试引擎
        const files = visibleFiles.filter((f) => {
          const isEngineFile = f.endsWith('.mjs') || f.endsWith('.ts') || f.endsWith('.js') || f.endsWith('.cjs');
          const isTestEngine = f.startsWith('test-');
          return isEngineFile && !isTestEngine;
        });
        console.log(`Filtered engine files:`, files);

        let loadedCount = 0;
        for (const file of files) {
          try {
            await this.loadOne(path.join(this.directory, file));
            loadedCount++;
          } catch (error) {
            console.error(`Failed to load engine file ${file}:`, error);
          }
        }

        console.log(`Loaded ${loadedCount}/${files.length} engine files from ${this.directory}`);
      } catch (error) {
        console.error(`Failed to read directory ${this.directory}:`, error);
      }
    } else {
      console.log(`Directory does not exist: ${this.directory}`);
    }
  }

  async loadOne(fullPath: string): Promise<void> {
    const name = path.basename(fullPath).replace(/\.(ts|js|cjs)$/i, '');

    try {
      // 在开发环境中使用动态 import 支持 TypeScript 文件
      // 在生产环境中，这些文件应该已经被编译成 JavaScript
      let mod: { engine?: TEngine; default?: TEngine } | undefined;

      try {
        // 尝试使用动态 import
        mod = await import(fullPath);
      } catch (importError) {
        // 如果动态导入失败，尝试使用 require (仅用于 .js/.cjs 文件)
        if (fullPath.endsWith('.js') || fullPath.endsWith('.cjs') || fullPath.endsWith('.mjs')) {
          try {
            // 使用 require 加载 CommonJS 模块
            mod = require(fullPath);
          } catch (requireError) {
            throw requireError;
          }
        } else {
          throw importError;
        }
      }

      // 子类实现具体的引擎验证逻辑
      const engine = await this.validateAndCreateEngine(mod, name);

      if (engine) {
        const engineName = engine.name || name;
        this.engines.set(engineName, engine);
        this.pathToName.set(fullPath, engineName);
        this.nameToPath.set(engineName, fullPath);
        this.onReload?.(engineName);
      }
    } catch (err) {
      console.error(`Failed to load engine ${name}:`, err);
    }
  }

  async watch(): Promise<void> {
    if (this.watcher) return;

    try {
      // 动态导入 chokidar 避免类型问题
      const chokidar = await import('chokidar');

      this.watcher = chokidar.watch(this.directory, {
        ignoreInitial: true,
        persistent: true,
      });

      this.watcher
        .on('add', (p: string) => this.loadOne(p))
        .on('change', (p: string) => this.loadOne(p))
        .on('unlink', (p: string) => {
          const nameFromPath = path.basename(p).replace(/\.(ts|js)$/i, '');
          const registeredName = this.pathToName.get(p) || nameFromPath;

          if (registeredName) {
            this.engines.delete(registeredName);
          }

          this.pathToName.delete(p);
          if (registeredName) this.nameToPath.delete(registeredName);
          this.onReload?.(registeredName);
        });
    } catch (error) {
      console.error('Failed to initialize file watcher:', error);
    }
  }

  findSourcePath(engineName: string): string | undefined {
    const p = this.nameToPath.get(engineName);
    if (p) return p;

    // Fallback to conventional paths under directory
    const t = path.join(this.directory, `${engineName}.ts`);
    const j = path.join(this.directory, `${engineName}.js`);

    if (fs.existsSync(t)) return t;
    if (fs.existsSync(j)) return j;

    return undefined;
  }

  // 移除引擎
  async removeEngine(engineName: string): Promise<boolean> {
    const engine = this.engines.get(engineName);
    if (!engine) return false;

    this.engines.delete(engineName);
    this.pathToName.delete(this.nameToPath.get(engineName) || '');
    this.nameToPath.delete(engineName);
    this.onReload?.(engineName);

    return true;
  }

  // 添加引擎
  async addEngine(engineName: string, engine: TEngine, filePath?: string): Promise<boolean> {
    try {
      // 如果引擎已存在，先移除
      if (this.engines.has(engineName)) {
        await this.removeEngine(engineName);
      }

      // 添加到内存
      this.engines.set(engineName, engine);

      // 设置路径映射
      if (filePath) {
        this.pathToName.set(filePath, engineName);
        this.nameToPath.set(engineName, filePath);
      }

      // 触发重新加载回调
      this.onReload?.(engineName);

      return true;
    } catch (error) {
      console.error(`Failed to add engine ${engineName}:`, error);
      return false;
    }
  }

  // 重新加载引擎
  async reloadEngine(engineName: string): Promise<boolean> {
    const filePath = this.nameToPath.get(engineName);
    if (!filePath) return false;

    try {
      // 先移除
      await this.removeEngine(engineName);
      // 再加载
      await this.loadOne(filePath);
      return true;
    } catch (error) {
      console.error(`Failed to reload engine ${engineName}:`, error);
      return false;
    }
  }

  /**
   * 运行时编译并添加引擎
   * 支持传入TypeScript代码字符串，编译后创建引擎实例
   */
  async compileAndAddEngine(engineCode: EngineCode): Promise<{ success: boolean; warnings?: string[]; error?: string }> {
    try {
      // 编译并创建引擎
      const { engine, warnings } = await this.runtimeCompiler.compileAndCreateEngine(engineCode);

      // 验证并创建引擎实例
      const validEngine = await this.validateAndCreateEngine({ engine, default: engine }, engineCode.name);

      if (validEngine) {
        // 添加到引擎集合
        const engineName = validEngine.name || engineCode.name;
        await this.addEngine(engineName, validEngine);

        return {
          success: true,
          warnings,
        };
      } else {
        return {
          success: false,
          error: 'Engine validation failed',
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 编译并替换现有引擎（热重载）
   */
  async compileAndReplaceEngine(engineCode: EngineCode): Promise<{ success: boolean; warnings?: string[]; error?: string }> {
    try {
      // 先移除现有引擎
      if (this.engines.has(engineCode.name)) {
        await this.removeEngine(engineCode.name);
      }

      // 编译并添加新引擎
      return await this.compileAndAddEngine(engineCode);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // 抽象方法：子类实现具体的引擎验证和创建逻辑
  protected abstract validateAndCreateEngine(mod: any, name: string): Promise<TEngine | undefined>;
}
