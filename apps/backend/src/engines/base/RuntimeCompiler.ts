import { build, BuildOptions } from 'esbuild';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

export interface CompilationResult {
  success: boolean;
  code?: string;
  error?: string;
  warnings?: string[];
}

export interface EngineCode {
  name: string;
  code: string;
}

export class RuntimeCompiler {
  private tempDir: string;
  private compiledEngines: Map<string, string> = new Map();

  constructor() {
    this.tempDir = path.join(tmpdir(), 'runtime-engines');
    this.ensureTempDir();
  }

  private async ensureTempDir(): Promise<void> {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create temp directory:', error);
    }
  }

  /**
   * 编译TypeScript代码为JavaScript
   */
  async compileTypeScript(engineCode: EngineCode): Promise<CompilationResult> {
    try {
      const tempFile = path.join(this.tempDir, `${engineCode.name}_${Date.now()}.ts`);

      // 写入临时文件
      await fs.writeFile(tempFile, engineCode.code, 'utf-8');

      // 编译选项
      const buildOptions: BuildOptions = {
        entryPoints: [tempFile],
        bundle: true,
        format: 'cjs',
        platform: 'node',
        target: 'node18',
        sourcemap: false,
        minify: false,
        write: false, // 不写入文件，返回结果
        external: ['fastify', '@prisma/client', 'bcrypt', 'jsonwebtoken'], // 排除外部依赖
        define: {
          'process.env.NODE_ENV': '"production"',
        },
      };

      const result = await build(buildOptions);

      // 清理临时文件
      await fs.unlink(tempFile).catch(() => {});

      if (result.errors.length > 0) {
        return {
          success: false,
          error: result.errors.map(e => e.text).join('\n'),
        };
      }

      const compiledCode = result.outputFiles?.[0]?.text;
      if (!compiledCode) {
        return {
          success: false,
          error: '编译结果为空',
        };
      }

      // 存储编译结果
      this.compiledEngines.set(engineCode.name, compiledCode);

      return {
        success: true,
        code: compiledCode,
        warnings: result.warnings.map(w => w.text),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 从编译后的代码创建引擎实例
   */
  async createEngineFromCode(engineName: string, compiledCode: string): Promise<any> {
    try {
      // 创建模块包装器
      const moduleWrapper = `
        const exports = {};
        const module = { exports };
        const require = (id) => {
          // 简单的require模拟，只支持内置模块
          if (id === 'node:fs') return require('fs');
          if (id === 'node:path') return require('path');
          if (id === 'node:url') return require('url');
          throw new Error(\`Module \${id} not found\`);
        };

        // 编译后的代码
        ${compiledCode}

        return module.exports;
      `;

      // 使用Function构造器执行代码（安全考虑：只在可信环境中使用）
      const createModule = new Function('require', moduleWrapper);
      const engineModule = createModule(require);

      return engineModule?.engine || engineModule?.default || engineModule;
    } catch (error) {
      console.error(`Failed to create engine ${engineName}:`, error);
      throw error;
    }
  }

  /**
   * 编译并创建引擎
   */
  async compileAndCreateEngine(engineCode: EngineCode): Promise<{ engine: any; warnings?: string[] }> {
    const result = await this.compileTypeScript(engineCode);

    if (!result.success) {
      throw new Error(`Compilation failed: ${result.error}`);
    }

    const engine = await this.createEngineFromCode(engineCode.name, result.code!);

    if (!engine) {
      throw new Error('Engine creation failed: no valid engine export found');
    }

    // 确保引擎有name属性
    if (!engine.name) {
      engine.name = engineCode.name;
    }

    return {
      engine,
      warnings: result.warnings,
    };
  }

  /**
   * 获取编译后的代码（用于调试）
   */
  getCompiledCode(engineName: string): string | undefined {
    return this.compiledEngines.get(engineName);
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    try {
      await fs.rm(this.tempDir, { recursive: true, force: true });
      this.compiledEngines.clear();
    } catch (error) {
      console.error('Failed to cleanup temp directory:', error);
    }
  }
}
