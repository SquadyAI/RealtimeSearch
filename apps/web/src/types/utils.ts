// 事件处理函数类型
export type EventHandler<T = Event> = (event: T) => void;

// 表单事件类型
export type FormEventHandler = EventHandler<React.FormEvent<HTMLFormElement>>;

// 输入事件类型
export type InputEventHandler = EventHandler<React.ChangeEvent<HTMLInputElement>>;

// 按钮事件类型
export type ButtonEventHandler = EventHandler<React.MouseEvent<HTMLButtonElement>>;

// 异步函数类型
export type AsyncFunction<T = any, R = any> = (params: T) => Promise<R>;

// 可选属性类型
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

// 必需属性类型
export type RequiredFields<T, K extends keyof T> = T & { [P in K]-?: T[P] };

// 深度部分类型
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// 错误类型
export interface AppError {
  message: string;
  code?: string;
  details?: any;
}

// 加载状态类型
export type LoadingState = 'idle' | 'loading' | 'success' | 'error';

// 分页类型
export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// 排序类型
export interface SortOption {
  field: string;
  direction: 'asc' | 'desc';
}
