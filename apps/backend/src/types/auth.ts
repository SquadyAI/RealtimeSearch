// 认证相关类型定义
import { EngineType } from './base';

export type AuthUser = {
  id: string;
  username: string;
  role: 'user' | 'admin';
  permissions?: 'read' | 'write' | 'admin';
};

export interface ApiKeyInfo {
  id: string;
  key: string;
  type: EngineType;
  label?: string;
  rps: number;
  monthlyQuota: number;
  httpProxy?: string;
  active: boolean;
  usageMonth?: string;
  usedCount: number;
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiKeyUsage {
  usageMonth: string;
  usedCount: number;
  monthlyQuota?: number;
}

export interface CreateApiKeyData {
  key: string;
  type: EngineType;
  label?: string;
  rps?: number;
  monthlyQuota?: number;
  httpProxy?: string;
}

export interface UpdateApiKeyData {
  type?: EngineType;
  label?: string;
  active?: boolean;
  rps?: number;
  monthlyQuota?: number;
  httpProxy?: string;
}
