import { Engine as SearchEngine } from '../../types';
import { BaseEngineLoader } from '../base/BaseEngineLoader';

export class SearchEngineLoader extends BaseEngineLoader<SearchEngine> {
  // 实现抽象方法：验证并创建搜索引擎
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected async validateAndCreateEngine(mod: any, _name: string): Promise<SearchEngine | undefined> {
    const engine: SearchEngine | undefined = mod.engine ?? mod.default;
    
    if (!engine || typeof engine.search !== 'function') {
      throw new Error('Invalid search engine module export');
    }
    
    return engine;
  }
}


