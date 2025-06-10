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
              value: navEntry.loadEventEnd - navEntry.navigationStart,
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
  }\n  \n  private setupAlertThresholds(): void {\n    // パフォーマンスアラートのしきい値設定\n    this.alertManager.setThreshold('request_execution', {\n      metric: 'request_execution',\n      warning: 5000,  // 5秒\n      critical: 30000  // 30秒\n    });\n    \n    this.alertManager.setThreshold('memory', {\n      metric: 'memory',\n      warning: 50 * 1024 * 1024,  // 50MB\n      critical: 100 * 1024 * 1024  // 100MB\n    });\n    \n    this.alertManager.setThreshold('script_execution', {\n      metric: 'script_execution',\n      warning: 5000,   // 5秒\n      critical: 10000  // 10秒\n    });\n  }\n  \n  private getResourceType(url: string): string {\n    const extension = url.split('.').pop()?.toLowerCase();\n    \n    switch (extension) {\n      case 'js':\n        return 'script';\n      case 'css':\n        return 'stylesheet';\n      case 'png':\n      case 'jpg':\n      case 'jpeg':\n      case 'gif':\n      case 'webp':\n        return 'image';\n      case 'woff':\n      case 'woff2':\n      case 'ttf':\n      case 'otf':\n        return 'font';\n      default:\n        return 'other';\n    }\n  }\n  \n  private generateTimerId(category: string): string {\n    return `${category}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;\n  }\n  \n  // リソースクリーンアップ\n  cleanup(): void {\n    for (const observer of this.observers) {\n      observer.disconnect();\n    }\n    this.observers.length = 0;\n    this.metrics.clear();\n    this.timers.clear();\n  }\n  \n  // メトリクスエクスポート\n  exportMetrics(): Record<string, MetricData[]> {\n    const exported: Record<string, MetricData[]> = {};\n    for (const [category, metrics] of this.metrics.entries()) {\n      exported[category] = [...metrics];\n    }\n    return exported;\n  }\n}\n\nclass AlertManager {\n  private thresholds = new Map<string, AlertThreshold>();\n  private alertCallbacks = new Map<string, AlertCallback[]>();\n  \n  setThreshold(metric: string, threshold: AlertThreshold): void {\n    this.thresholds.set(metric, threshold);\n  }\n  \n  onAlert(metric: string, callback: AlertCallback): void {\n    const callbacks = this.alertCallbacks.get(metric) || [];\n    callbacks.push(callback);\n    this.alertCallbacks.set(metric, callbacks);\n  }\n  \n  checkMetric(metric: string, value: number): void {\n    const threshold = this.thresholds.get(metric);\n    if (!threshold) return;\n    \n    const alert = this.evaluateThreshold(threshold, value);\n    if (alert) {\n      this.triggerAlert(metric, alert);\n    }\n  }\n  \n  private evaluateThreshold(threshold: AlertThreshold, value: number): Alert | null {\n    if (threshold.critical && value >= threshold.critical) {\n      return {\n        level: 'critical',\n        metric: threshold.metric,\n        value,\n        threshold: threshold.critical,\n        message: `Critical threshold exceeded: ${value} >= ${threshold.critical}`\n      };\n    }\n    \n    if (threshold.warning && value >= threshold.warning) {\n      return {\n        level: 'warning',\n        metric: threshold.metric,\n        value,\n        threshold: threshold.warning,\n        message: `Warning threshold exceeded: ${value} >= ${threshold.warning}`\n      };\n    }\n    \n    return null;\n  }\n  \n  private triggerAlert(metric: string, alert: Alert): void {\n    const callbacks = this.alertCallbacks.get(metric) || [];\n    \n    for (const callback of callbacks) {\n      try {\n        callback(alert);\n      } catch (error) {\n        logger.error('Alert callback failed', error);\n      }\n    }\n    \n    // ログ出力\n    if (alert.level === 'critical') {\n      logger.error(`Performance alert: ${alert.message}`, undefined, { alert });\n    } else {\n      logger.warn(`Performance alert: ${alert.message}`, { alert });\n    }\n  }\n}\n\ninterface AlertThreshold {\n  metric: string;\n  warning?: number;\n  critical?: number;\n}\n\ninterface Alert {\n  level: 'warning' | 'critical';\n  metric: string;\n  value: number;\n  threshold: number;\n  message: string;\n}\n\ntype AlertCallback = (alert: Alert) => void;\n\n// メモリプール実装\nexport class ObjectPool<T> {\n  private pool: T[] = [];\n  private factory: () => T;\n  private resetFunction: (item: T) => void;\n  private maxSize: number;\n  \n  constructor(\n    factory: () => T,\n    resetFunction: (item: T) => void,\n    maxSize: number = 100\n  ) {\n    this.factory = factory;\n    this.resetFunction = resetFunction;\n    this.maxSize = maxSize;\n  }\n  \n  acquire(): T {\n    if (this.pool.length > 0) {\n      return this.pool.pop()!;\n    }\n    \n    return this.factory();\n  }\n  \n  release(item: T): void {\n    if (this.pool.length < this.maxSize) {\n      this.resetFunction(item);\n      this.pool.push(item);\n    }\n  }\n  \n  clear(): void {\n    this.pool.length = 0;\n  }\n  \n  getPoolSize(): number {\n    return this.pool.length;\n  }\n}\n\n// 仮想スクロール実装\nexport class VirtualScrollManager {\n  private container: HTMLElement;\n  private itemHeight: number;\n  private bufferSize: number = 5;\n  private visibleItems = new Map<number, HTMLElement>();\n  private itemRenderer: (item: any, index: number) => HTMLElement;\n  \n  constructor(\n    container: HTMLElement, \n    itemHeight: number,\n    itemRenderer: (item: any, index: number) => HTMLElement\n  ) {\n    this.container = container;\n    this.itemHeight = itemHeight;\n    this.itemRenderer = itemRenderer;\n    this.setupScrollListener();\n  }\n  \n  renderItems(items: any[]): void {\n    const scrollTop = this.container.scrollTop;\n    const containerHeight = this.container.clientHeight;\n    \n    // 表示範囲の計算\n    const startIndex = Math.max(\n      0, \n      Math.floor(scrollTop / this.itemHeight) - this.bufferSize\n    );\n    const endIndex = Math.min(\n      items.length - 1,\n      Math.ceil((scrollTop + containerHeight) / this.itemHeight) + this.bufferSize\n    );\n    \n    // 不要なアイテムの削除\n    this.cleanupInvisibleItems(startIndex, endIndex);\n    \n    // 必要なアイテムの追加\n    this.renderVisibleItems(items, startIndex, endIndex);\n    \n    // コンテナの高さ設定\n    this.updateContainerHeight(items.length);\n  }\n  \n  private cleanupInvisibleItems(startIndex: number, endIndex: number): void {\n    for (const [index, element] of this.visibleItems.entries()) {\n      if (index < startIndex || index > endIndex) {\n        element.remove();\n        this.visibleItems.delete(index);\n      }\n    }\n  }\n  \n  private renderVisibleItems(\n    items: any[], \n    startIndex: number, \n    endIndex: number\n  ): void {\n    \n    for (let i = startIndex; i <= endIndex; i++) {\n      if (!this.visibleItems.has(i) && items[i]) {\n        const element = this.itemRenderer(items[i], i);\n        \n        // 位置設定\n        element.style.position = 'absolute';\n        element.style.top = `${i * this.itemHeight}px`;\n        element.style.height = `${this.itemHeight}px`;\n        element.style.width = '100%';\n        \n        this.container.appendChild(element);\n        this.visibleItems.set(i, element);\n      }\n    }\n  }\n  \n  private updateContainerHeight(itemCount: number): void {\n    this.container.style.height = `${itemCount * this.itemHeight}px`;\n  }\n  \n  private setupScrollListener(): void {\n    let scrollTimer: number;\n    \n    this.container.addEventListener('scroll', () => {\n      clearTimeout(scrollTimer);\n      scrollTimer = setTimeout(() => {\n        this.handleScroll();\n      }, 16); // 60fps\n    });\n  }\n  \n  private handleScroll(): void {\n    const event = new CustomEvent('virtualscroll', {\n      detail: {\n        scrollTop: this.container.scrollTop,\n        scrollLeft: this.container.scrollLeft\n      }\n    });\n    this.container.dispatchEvent(event);\n  }\n}\n\n// グローバルインスタンス\nexport const performanceMonitor = new PerformanceMonitor();\n\n// 自動監視開始\nif (typeof window !== 'undefined') {\n  performanceMonitor.startMonitoring();\n  \n  // ページアンロード時のクリーンアップ\n  window.addEventListener('beforeunload', () => {\n    performanceMonitor.cleanup();\n  });\n}"