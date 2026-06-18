import { Injectable } from '@nestjs/common';

interface CacheEntry<T> {
  value: T;
  expireAt: number;
}

@Injectable()
export class LruCacheService {
  private readonly cache = new Map<string, CacheEntry<any>>();
  private readonly maxSize = 1000;
  private readonly defaultTtlMs = 10 * 1000; // 默认10秒

  private evictIfNeeded() {
    if (this.cache.size < this.maxSize) return;
    // 简单 LRU：删除最旧的（Map 按插入顺序迭代）
    const firstKey = this.cache.keys().next().value;
    if (firstKey != null) {
      this.cache.delete(firstKey);
    }
  }

  set<T>(key: string, value: T, ttlMs: number = this.defaultTtlMs): void {
    this.evictIfNeeded();
    this.cache.set(key, {
      value,
      expireAt: Date.now() + ttlMs,
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expireAt) {
      this.cache.delete(key);
      return null;
    }
    // 访问时移动到末尾（实现LRU访问热区）
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value as T;
  }

  del(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

export const buildKey = (...parts: (string | number | boolean | null | undefined)[]): string => {
  return parts.map((p) => (p == null ? '' : String(p))).join('::');
};
