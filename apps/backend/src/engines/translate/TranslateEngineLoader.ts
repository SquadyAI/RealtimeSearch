import { TranslateEngine } from '../../types';
import { BaseEngineLoader } from '../base/BaseEngineLoader';

export class TranslateEngineLoader extends BaseEngineLoader<TranslateEngine> {
  // 实现抽象方法：验证并创建翻译引擎
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected async validateAndCreateEngine(mod: any, _name: string): Promise<TranslateEngine | undefined> {
    const engine: TranslateEngine | undefined = mod.engine ?? mod.default;
    
    if (!engine || typeof engine.translate !== 'function') {
      throw new Error('Invalid translate engine module export');
    }
    
    return engine;
  }
}
