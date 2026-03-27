// 获取后端基础URL
export const getBackendUrl = () => {
  return import.meta.env.VITE_BACKEND_URL || 'http://localhost:8787';
};

// 构建完整的API URL
export const buildUrl = (endpoint: string) => {
  return `${getBackendUrl()}${endpoint}`;
};
