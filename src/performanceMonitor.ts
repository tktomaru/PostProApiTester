// performanceMonitor.ts
// ───────────────────────────────────────────────────────────────────────────────
// パフォーマンス監視とメトリクス収集

import { MetricData, MetricsSummary, PerformanceTimer } from './types';
import { logger } from './errorHandler';

export class PerformanceMonitor {
  private metrics = new Map<string, MetricData[]>();
  private timers = new Map<string, PerformanceTimer>();
  private observers: PerformanceObserver[] = [];
  private alertManager = new AlertManager();
  
  startMonitoring(): void {
    this.observeNavigationTiming();
    this.observeResourceTiming();
    this.observeUserTiming();
    this.observeMemoryUsage();
    this.setupAlertThresholds();
  }
  
  startTimer(category: string, name?: string): string {
    const id = name || this.generateTimerId(category);
    const timer: PerformanceTimer = {
      id,
      startTime: performance.now(),
      category
    };
    
    this.timers.set(id, timer);
    return id;
  }
  
  endTimer(timerId: string): number {
    const timer = this.timers.get(timerId);
    if (!timer) {
      logger.warn(`Timer not found: ${timerId}`);
      return 0;
    }
    
    const duration = performance.now() - timer.startTime;
    this.timers.delete(timerId);
    
    this.recordMetric(timer.category, {
      name: timerId,
      value: duration,
      timestamp: Date.now()
    });
    
    return duration;
  }
  
  recordMetric(category: string, metric: MetricData): void {
    if (!this.metrics.has(category)) {
      this.metrics.set(category, []);
    }
    
    const categoryMetrics = this.metrics.get(category)!;
    categoryMetrics.push(metric);
    
    // メトリクス保持数制限
    if (categoryMetrics.length > 1000) {
      categoryMetrics.shift();
    }
    
    // アラートチェック
    this.alertManager.checkMetric(category, metric.value);
  }
  
  recordCustomMetric(category: string, name: string, value: number, metadata?: any): void {
    this.recordMetric(category, {
      name,
      value,
      timestamp: Date.now(),
      metadata
    });
  }
  
  getMetricsSummary(category: string, timeRange: number = 3600000): MetricsSummary {
    const metrics = this.metrics.get(category) || [];
    const recent = metrics.filter(m => Date.now() - m.timestamp < timeRange);
    
    if (recent.length === 0) {
      return { count: 0, avg: 0, min: 0, max: 0, p95: 0 };
    }
    
    const values = recent.map(m => m.value).sort((a, b) => a - b);
    
    return {
      count: recent.length,
      avg: values.reduce((sum, v) => sum + v, 0) / values.length,
      min: values[0],
      max: values[values.length - 1],
      p95: values[Math.floor(values.length * 0.95)]
    };
  }
  
  private observeNavigationTiming(): void {
    if (!('PerformanceObserver' in window)) return;
    
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'navigation') {
            const navEntry = entry as PerformanceNavigationTiming;
            this.recordMetric('navigation', {
              name: 'page_load',
              value: navEntry.loadEventEnd - navEntry.fetchStart,
              timestamp: Date.now()
            });
          }
        }
      });
      
      observer.observe({ entryTypes: ['navigation'] });
      this.observers.push(observer);
    } catch (error) {
      logger.warn('Failed to observe navigation timing', { error });
    }
  }
  
  private observeResourceTiming(): void {
    if (!('PerformanceObserver' in window)) return;
    
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'resource') {
            const resourceEntry = entry as PerformanceResourceTiming;
            this.recordMetric('resource', {
              name: entry.name,
              value: resourceEntry.responseEnd - resourceEntry.requestStart,
              timestamp: Date.now(),
              metadata: {
                size: resourceEntry.transferSize || 0,
                type: this.getResourceType(entry.name)
              }
            });
          }
        }
      });
      
      observer.observe({ entryTypes: ['resource'] });
      this.observers.push(observer);
    } catch (error) {
      logger.warn('Failed to observe resource timing', { error });
    }
  }
  
  private observeUserTiming(): void {
    if (!('PerformanceObserver' in window)) return;
    
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'measure') {
            this.recordMetric('user_timing', {
              name: entry.name,
              value: entry.duration,
              timestamp: Date.now()
            });
          }
        }
      });
      
      observer.observe({ entryTypes: ['measure'] });
      this.observers.push(observer);
    } catch (error) {
      logger.warn('Failed to observe user timing', { error });
    }
  }
  
  private observeMemoryUsage(): void {
    // メモリ使用量の定期監視
    setInterval(() => {
      if ('memory' in performance) {
        const memory = (performance as any).memory;
        this.recordMetric('memory', {
          name: 'used_js_heap_size',
          value: memory.usedJSHeapSize,
          timestamp: Date.now(),
          metadata: {
            totalJSHeapSize: memory.totalJSHeapSize,
            jsHeapSizeLimit: memory.jsHeapSizeLimit
          }
        });
      }
    }, 30000); // 30秒ごと
  }

  private setupAlertThresholds(): void {
    // パフォーマンスアラートのしきい値設定
    this.alertManager.setThreshold('request_execution', {
      metric: 'request_execution',
      warning: 5000,  // 5秒
      critical: 30000  // 30秒
    });
    
    this.alertManager.setThreshold('memory', {
      metric: 'memory',
      warning: 50 * 1024 * 1024,  // 50MB
      critical: 100 * 1024 * 1024  // 100MB
    });
    
    this.alertManager.setThreshold('script_execution', {
      metric: 'script_execution',
      warning: 5000,   // 5秒
      critical: 10000  // 10秒
    });
  }
  
  private getResourceType(url: string): string {
    const extension = url.split('.').pop()?.toLowerCase();
    
    switch (extension) {
      case 'js':
        return 'script';
      case 'css':
        return 'stylesheet';
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'gif':
      case 'webp':
        return 'image';
      case 'woff':
      case 'woff2':
      case 'ttf':
      case 'otf':
        return 'font';
      default:
        return 'other';
    }
  }
  
  private generateTimerId(category: string): string {
    return `${category}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  // リソースクリーンアップ
  cleanup(): void {
    for (const observer of this.observers) {
      observer.disconnect();
    }
    this.observers.length = 0;
    this.metrics.clear();
    this.timers.clear();
  }
  
  // メトリクスエクスポート
  exportMetrics(): Record<string, MetricData[]> {
    const exported: Record<string, MetricData[]> = {};
    this.metrics.forEach((metrics, category) => {
      exported[category] = [...metrics];
    });
    return exported;
  }
}

class AlertManager {
  private thresholds = new Map<string, AlertThreshold>();
  private alertCallbacks = new Map<string, AlertCallback[]>();
  
  setThreshold(metric: string, threshold: AlertThreshold): void {
    this.thresholds.set(metric, threshold);
  }
  
  onAlert(metric: string, callback: AlertCallback): void {
    const callbacks = this.alertCallbacks.get(metric) || [];
    callbacks.push(callback);
    this.alertCallbacks.set(metric, callbacks);
  }
  
  checkMetric(metric: string, value: number): void {
    const threshold = this.thresholds.get(metric);
    if (!threshold) return;
    
    const alert = this.evaluateThreshold(threshold, value);
    if (alert) {
      this.triggerAlert(metric, alert);
    }
  }
  
  private evaluateThreshold(threshold: AlertThreshold, value: number): Alert | null {
    if (threshold.critical && value >= threshold.critical) {
      return {
        level: 'critical',
        metric: threshold.metric,
        value,
        threshold: threshold.critical,
        message: `Critical threshold exceeded: ${value} >= ${threshold.critical}`
      };
    }
    
    if (threshold.warning && value >= threshold.warning) {
      return {
        level: 'warning',
        metric: threshold.metric,
        value,
        threshold: threshold.warning,
        message: `Warning threshold exceeded: ${value} >= ${threshold.warning}`
      };
    }
    
    return null;
  }
  
  private triggerAlert(metric: string, alert: Alert): void {
    const callbacks = this.alertCallbacks.get(metric) || [];
    
    for (const callback of callbacks) {
      try {
        callback(alert);
      } catch (error) {
        logger.error('Alert callback failed', error as Error);
      }
    }
    
    // ログ出力
    if (alert.level === 'critical') {
      logger.error(`Performance alert: ${alert.message}`, undefined, { alert });
    } else {
      logger.warn(`Performance alert: ${alert.message}`, { alert });
    }
  }
}

interface AlertThreshold {
  metric: string;
  warning?: number;
  critical?: number;
}

interface Alert {
  level: 'warning' | 'critical';
  metric: string;
  value: number;
  threshold: number;
  message: string;
}

type AlertCallback = (alert: Alert) => void;

// メモリプール実装
export class ObjectPool<T> {
  private pool: T[] = [];
  private factory: () => T;
  private resetFunction: (item: T) => void;
  private maxSize: number;
  
  constructor(
    factory: () => T,
    resetFunction: (item: T) => void,
    maxSize: number = 100
  ) {
    this.factory = factory;
    this.resetFunction = resetFunction;
    this.maxSize = maxSize;
  }
  
  acquire(): T {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    
    return this.factory();
  }
  
  release(item: T): void {
    if (this.pool.length < this.maxSize) {
      this.resetFunction(item);
      this.pool.push(item);
    }
  }
  
  clear(): void {
    this.pool.length = 0;
  }
  
  getPoolSize(): number {
    return this.pool.length;
  }
}

// 仮想スクロール実装
export class VirtualScrollManager {
  private container: HTMLElement;
  private itemHeight: number;
  private bufferSize: number = 5;
  private visibleItems = new Map<number, HTMLElement>();
  private itemRenderer: (item: any, index: number) => HTMLElement;
  
  constructor(
    container: HTMLElement, 
    itemHeight: number,
    itemRenderer: (item: any, index: number) => HTMLElement
  ) {
    this.container = container;
    this.itemHeight = itemHeight;
    this.itemRenderer = itemRenderer;
    this.setupScrollListener();
  }
  
  renderItems(items: any[]): void {
    const scrollTop = this.container.scrollTop;
    const containerHeight = this.container.clientHeight;
    
    // 表示範囲の計算
    const startIndex = Math.max(
      0, 
      Math.floor(scrollTop / this.itemHeight) - this.bufferSize
    );
    const endIndex = Math.min(
      items.length - 1,
      Math.ceil((scrollTop + containerHeight) / this.itemHeight) + this.bufferSize
    );
    
    // 不要なアイテムの削除
    this.cleanupInvisibleItems(startIndex, endIndex);
    
    // 必要なアイテムの追加
    this.renderVisibleItems(items, startIndex, endIndex);
    
    // コンテナの高さ設定
    this.updateContainerHeight(items.length);
  }
  
  private cleanupInvisibleItems(startIndex: number, endIndex: number): void {
    this.visibleItems.forEach((element, index) => {
      if (index < startIndex || index > endIndex) {
        element.remove();
        this.visibleItems.delete(index);
      }
    });
  }
  
  private renderVisibleItems(
    items: any[], 
    startIndex: number, 
    endIndex: number
  ): void {
    
    for (let i = startIndex; i <= endIndex; i++) {
      if (!this.visibleItems.has(i) && items[i]) {
        const element = this.itemRenderer(items[i], i);
        
        // 位置設定
        element.style.position = 'absolute';
        element.style.top = `${i * this.itemHeight}px`;
        element.style.height = `${this.itemHeight}px`;
        element.style.width = '100%';
        
        this.container.appendChild(element);
        this.visibleItems.set(i, element);
      }
    }
  }
  
  private updateContainerHeight(itemCount: number): void {
    this.container.style.height = `${itemCount * this.itemHeight}px`;
  }
  
  private setupScrollListener(): void {
    let scrollTimer: any;
    
    this.container.addEventListener('scroll', () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        this.handleScroll();
      }, 16); // 60fps
    });
  }
  
  private handleScroll(): void {
    const event = new CustomEvent('virtualscroll', {
      detail: {
        scrollTop: this.container.scrollTop,
        scrollLeft: this.container.scrollLeft
      }
    });
    this.container.dispatchEvent(event);
  }
}

// グローバルインスタンス
export const performanceMonitor = new PerformanceMonitor();

// 自動監視開始
if (typeof window !== 'undefined') {
  performanceMonitor.startMonitoring();
  
  // ページアンロード時のクリーンアップ
  window.addEventListener('beforeunload', () => {
    performanceMonitor.cleanup();
  });
}