declare module 'opossum' {
  export default class CircuitBreaker<TArgs = any, TResult = any> {
    constructor(action: (args: TArgs) => Promise<TResult>, options?: any);
    fire(args: TArgs): Promise<TResult>;
    on(event: string, listener: (...args: any[]) => void): this;
    removeAllListeners(): this;
  }
}


