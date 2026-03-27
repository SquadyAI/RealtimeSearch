import { TLBManager } from './TLBManager';

export interface TLBEngineConfig {
  engineId: string;
  rps: number;
  enabled: boolean;
}

export interface TLBGlobalConfig {
  enabled: boolean;
  defaultRPS: number;
  enableHotSwap: boolean;
  maxRetries: number;
}

export class TLBConfigManager {
  private tlbManager: TLBManager;
  private globalConfig: TLBGlobalConfig;

  constructor(tlbManager: TLBManager, initialConfig: TLBGlobalConfig) {
    this.tlbManager = tlbManager;
    this.globalConfig = initialConfig;
  }

  // 获取全局配置
  getGlobalConfig(): TLBGlobalConfig {
    return { ...this.globalConfig };
  }

  // 更新全局配置
  updateGlobalConfig(config: Partial<TLBGlobalConfig>): void {
    this.globalConfig = { ...this.globalConfig, ...config };

    // 如果启用了热插拔，应用配置
    if (this.globalConfig.enableHotSwap) {
      // 这里可以添加动态配置逻辑
    }
  }

  // 获取所有引擎配置
  getAllEngineConfigs(): TLBEngineConfig[] {
    const engines = this.tlbManager.getRegisteredEngines();
    const stats = this.tlbManager.getEngineStats();

    return engines.map(engineId => ({
      engineId,
      rps: stats[engineId]?.rps || 0,
      enabled: this.tlbManager.isEngineAvailable(engineId)
    }));
  }

  // 更新单个引擎配置
  updateEngineConfig(engineId: string, config: Partial<TLBEngineConfig>): void {
    if (config.rps !== undefined) {
      this.tlbManager.updateEngineRPS(engineId, config.rps);
    }

    if (config.enabled === false) {
      this.tlbManager.unregisterEngine(engineId);
    } else if (config.enabled === true) {
      const rps = config.rps || this.globalConfig.defaultRPS;
      this.tlbManager.hotSwapAddEngine(engineId, rps);
    }
  }

  // 批量更新引擎配置
  batchUpdateEngineConfigs(configs: TLBEngineConfig[]): void {
    for (const config of configs) {
      this.updateEngineConfig(config.engineId, config);
    }
  }

  // 获取引擎统计信息
  getEngineStats(): Record<string, { rps: number; availableTokens: number }> {
    return this.tlbManager.getEngineStats();
  }

  // 热插拔：添加新引擎
  hotSwapAddEngine(engineId: string, rps: number): void {
    if (this.globalConfig.enableHotSwap) {
      this.tlbManager.hotSwapAddEngine(engineId, rps);
    }
  }

  // 热插拔：移除引擎
  hotSwapRemoveEngine(engineId: string): void {
    if (this.globalConfig.enableHotSwap) {
      this.tlbManager.hotSwapRemoveEngine(engineId);
    }
  }

  // 检查引擎是否可用
  isEngineAvailable(engineId: string): boolean {
    return this.tlbManager.isEngineAvailable(engineId);
  }

  // 获取可用引擎列表
  getAvailableEngines(): string[] {
    return this.tlbManager.getAvailableTokenBuckets();
  }

  // 重置所有配置到默认值
  resetToDefaults(): void {
    this.globalConfig = {
      enabled: true,
      defaultRPS: 10,
      enableHotSwap: true,
      maxRetries: 3
    };

    // 重新初始化TLB管理器
    // 注意：这里需要重新创建TLB管理器实例
  }
}
