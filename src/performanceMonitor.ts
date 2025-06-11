// performanceMonitor.ts
// ───────────────────────────────────────────────────────────────────────────────
// パフォーマンス監視とメトリクス収集システム
// アプリケーションのパフォーマンスを監視し、メトリクスを収集・分析・アラートを提供

import { MetricData, MetricsSummary, PerformanceTimer } from './types';
import { logger } from './errorHandler';

/**
 * パフォーマンス監視クラス
 * アプリケーションのパフォーマンスを全面的に監視し、メトリクスを収集・分析
 */
export class PerformanceMonitor {
  private metrics = new Map<string, MetricData[]>();      // カテゴリ別メトリクスデータ
  private timers = new Map<string, PerformanceTimer>();   // アクティブなタイマーのマップ
  private observers: PerformanceObserver[] = [];          // Performance Observerの配列
  private alertManager = new AlertManager();              // アラート管理システム
  
  /**
   * パフォーマンス監視の開始
   * 各種パフォーマンス監視機能を有効化し、アラートしきい値を設定
   */
  startMonitoring(): void {
    this.observeNavigationTiming();   // ナビゲーションタイミングの監視
    this.observeResourceTiming();     // リソースタイミングの監視
    this.observeUserTiming();         // ユーザータイミングの監視
    this.observeMemoryUsage();        // メモリ使用量の監視
    this.setupAlertThresholds();      // アラートしきい値の設定
  }
  
  /**
   * パフォーマンスタイマーの開始
   * 特定の操作の実行時間測定を開始し、タイマーIDを返す
   */
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
  
  /**
   * パフォーマンスタイマーの終了
   * 測定を終了し、結果をメトリクスとして記録
   */
  endTimer(timerId: string): number {
    const timer = this.timers.get(timerId);
    if (!timer) {
      logger.warn(`Timer not found: ${timerId}`);
      return 0;
    }
    
    const duration = performance.now() - timer.startTime;
    this.timers.delete(timerId);
    
    // 測定結果をメトリクスとして記録
    this.recordMetric(timer.category, {
      name: timerId,
      value: duration,
      timestamp: Date.now()
    });
    
    return duration;
  }
  
  /**
   * メトリクスの記録
   * 指定されたカテゴリにメトリクスを記録し、アラートチェックを実行
   */
  recordMetric(category: string, metric: MetricData): void {
    if (!this.metrics.has(category)) {
      this.metrics.set(category, []);
    }
    
    const categoryMetrics = this.metrics.get(category)!;
    categoryMetrics.push(metric);
    
    // メトリクス保持数制限（メモリ使用量を制限）
    if (categoryMetrics.length > 1000) {
      categoryMetrics.shift();
    }
    
    // アラートチェックの実行
    this.alertManager.checkMetric(category, metric.value);
  }
  
  /**
   * カスタムメトリクスの記録
   * アプリケーション独自のメトリクスを簡単に記録できるヘルパーメソッド
   */
  recordCustomMetric(category: string, name: string, value: number, metadata?: any): void {
    this.recordMetric(category, {
      name,
      value,
      timestamp: Date.now(),
      metadata
    });
  }
  
  /**
   * メトリクスの統計情報取得
   * 指定された時間範囲のメトリクスから統計情報（平均、最大、最小、P95）を算出
   */
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
  
  /**
   * ナビゲーションタイミングの監視
   * ページ読み込み時間を監視し、ページパフォーマンスを記録
   */
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
  
  /**
   * リソースタイミングの監視
   * スクリプト、CSS、画像などのリソース読み込み時間を監視
   */
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
  
  /**
   * ユーザータイミングの監視
   * performance.measure()で作成されたカスタムメトリクスを監視
   */
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
  
  /**
   * メモリ使用量の監視
   * JavaScriptヒープの使用量を定期的にチェックし、メモリリークを検出
   */
  private observeMemoryUsage(): void {
    // メモリ使用量の定期監視（30秒間隔）
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

  /**
   * アラートしきい値の設定
   * 各種メトリクスに対する警告と重大アラートのしきい値を設定
   */
  private setupAlertThresholds(): void {
    // リクエスト実行時間のしきい値
    this.alertManager.setThreshold('request_execution', {
      metric: 'request_execution',
      warning: 5000,   // 5秒で警告
      critical: 30000  // 30秒で重大アラート
    });
    
    // メモリ使用量のしきい値
    this.alertManager.setThreshold('memory', {
      metric: 'memory',
      warning: 50 * 1024 * 1024,  // 50MBで警告
      critical: 100 * 1024 * 1024  // 100MBで重大アラート
    });
    
    // スクリプト実行時間のしきい値
    this.alertManager.setThreshold('script_execution', {
      metric: 'script_execution',
      warning: 5000,   // 5秒で警告
      critical: 10000  // 10秒で重大アラート
    });
  }
  
  /**
   * リソースタイプの判定
   * URLの拡張子からリソースのタイプを判定し、カテゴリ別の分析を可能にする
   */
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
  
  /**
   * ユニークなタイマーIDの生成
   * カテゴリ名、タイムスタンプ、ランダム文字列を組み合わせて一意なIDを生成
   */
  private generateTimerId(category: string): string {
    return `${category}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * リソースのクリーンアップ
   * ページアンロード時にオブザーバーを停止し、メモリを解放
   */
  cleanup(): void {
    // 全てのPerformanceObserverを停止
    for (const observer of this.observers) {
      observer.disconnect();
    }
    this.observers.length = 0;
    this.metrics.clear();
    this.timers.clear();
  }
  
  /**
   * メトリクスのエクスポート
   * 収集した全てのメトリクスをエクスポート可能な形式で返す
   */
  exportMetrics(): Record<string, MetricData[]> {
    const exported: Record<string, MetricData[]> = {};
    this.metrics.forEach((metrics, category) => {
      exported[category] = [...metrics];  // データのコピーを作成
    });
    return exported;
  }
}

/**
 * アラート管理クラス
 * パフォーマンスメトリクスのしきい値監視とアラート通知を管理
 */
class AlertManager {
  private thresholds = new Map<string, AlertThreshold>();     // メトリクス別しきい値設定
  private alertCallbacks = new Map<string, AlertCallback[]>(); // アラートコールバック関数
  
  /**
   * アラートしきい値の設定
   * 指定されたメトリクスに対するしきい値を設定
   */
  setThreshold(metric: string, threshold: AlertThreshold): void {
    this.thresholds.set(metric, threshold);
  }
  
  /**
   * アラートコールバックの登録
   * 特定のメトリクスでアラートが発生した際に実行するコールバックを登録
   */
  onAlert(metric: string, callback: AlertCallback): void {
    const callbacks = this.alertCallbacks.get(metric) || [];
    callbacks.push(callback);
    this.alertCallbacks.set(metric, callbacks);
  }
  
  /**
   * メトリクス値のチェック
   * 指定されたメトリクスの値がしきい値を超えているかチェックし、必要に応じてアラートを発生
   */
  checkMetric(metric: string, value: number): void {
    const threshold = this.thresholds.get(metric);
    if (!threshold) return;
    
    const alert = this.evaluateThreshold(threshold, value);
    if (alert) {
      this.triggerAlert(metric, alert);
    }
  }
  
  /**
   * しきい値の評価
   * メトリクス値がしきい値を超えているかどうかを評価し、アラートオブジェクトを作成
   */
  private evaluateThreshold(threshold: AlertThreshold, value: number): Alert | null {
    // 重大アラートのチェック（優先度高）
    if (threshold.critical && value >= threshold.critical) {
      return {
        level: 'critical',
        metric: threshold.metric,
        value,
        threshold: threshold.critical,
        message: `Critical threshold exceeded: ${value} >= ${threshold.critical}`
      };
    }
    
    // 警告アラートのチェック
    if (threshold.warning && value >= threshold.warning) {
      return {
        level: 'warning',
        metric: threshold.metric,
        value,
        threshold: threshold.warning,
        message: `Warning threshold exceeded: ${value} >= ${threshold.warning}`
      };
    }
    
    return null;  // しきい値を超えていない場合
  }
  
  /**
   * アラートの発火
   * 登録されたコールバック関数を実行し、ログにアラート情報を出力
   */
  private triggerAlert(metric: string, alert: Alert): void {
    // 登録されたコールバック関数を実行
    const callbacks = this.alertCallbacks.get(metric) || [];
    
    for (const callback of callbacks) {
      try {
        callback(alert);
      } catch (error) {
        logger.error('Alert callback failed', error as Error);
      }
    }
    
    // ログレベルに応じた出力
    if (alert.level === 'critical') {
      logger.error(`Performance alert: ${alert.message}`, undefined, { alert });
    } else {
      logger.warn(`Performance alert: ${alert.message}`, { alert });
    }
  }
}

/**
 * アラートしきい値設定のインターフェース
 * メトリクスに対する警告・重大しきい値を定義
 */
interface AlertThreshold {
  metric: string;      // 対象メトリクス名
  warning?: number;    // 警告レベルのしきい値
  critical?: number;   // 重大レベルのしきい値
}

/**
 * アラート情報のインターフェース
 * 発生したアラートの詳細情報を格納
 */
interface Alert {
  level: 'warning' | 'critical';  // アラートレベル
  metric: string;                  // メトリクス名
  value: number;                   // 実際の値
  threshold: number;               // 超過したしきい値
  message: string;                 // アラートメッセージ
}

/**
 * アラートコールバック関数の型定義
 * アラート発生時に実行される処理を定義
 */
type AlertCallback = (alert: Alert) => void;

/**
 * オブジェクトプール実装
 * 頻繁に作成・破棄されるオブジェクトを再利用してメモリ使用量とGCの負荷を軽減
 */
export class ObjectPool<T> {
  private pool: T[] = [];                      // プールされたオブジェクトの配列
  private factory: () => T;                    // オブジェクト生成関数
  private resetFunction: (item: T) => void;    // オブジェクトリセット関数
  private maxSize: number;                     // プールの最大サイズ
  
  /**
   * オブジェクトプールのコンストラクタ
   * @param factory オブジェクト生成関数
   * @param resetFunction オブジェクトリセット関数
   * @param maxSize プールの最大サイズ（デフォルト: 100）
   */
  constructor(
    factory: () => T,
    resetFunction: (item: T) => void,
    maxSize: number = 100
  ) {
    this.factory = factory;
    this.resetFunction = resetFunction;
    this.maxSize = maxSize;
  }
  
  /**
   * オブジェクトの取得
   * プールに利用可能なオブジェクトがあれば再利用、なければ新規作成
   */
  acquire(): T {
    if (this.pool.length > 0) {
      return this.pool.pop()!;  // プールから再利用
    }
    
    return this.factory();  // 新規作成
  }
  
  /**
   * オブジェクトの返却
   * 使用済みオブジェクトをリセットしてプールに返却
   */
  release(item: T): void {
    if (this.pool.length < this.maxSize) {
      this.resetFunction(item);  // オブジェクトの状態をリセット
      this.pool.push(item);      // プールに返却
    }
    // maxSizeを超えている場合は破棄（GCに任せる）
  }
  
  /**
   * プールのクリア
   * プール内の全オブジェクトを破棄
   */
  clear(): void {
    this.pool.length = 0;
  }
  
  /**
   * プールサイズの取得
   * 現在プールされているオブジェクトの数を返す
   */
  getPoolSize(): number {
    return this.pool.length;
  }
}

/**
 * 仮想スクロールマネージャー
 * 大量のリストアイテムを効率的に描画するため、表示範囲内のアイテムのみをレンダリング
 */
export class VirtualScrollManager {
  private container: HTMLElement;                               // スクロールコンテナ要素
  private itemHeight: number;                                   // 各アイテムの高さ
  private bufferSize: number = 5;                               // 表示範囲の上下に保持するバッファアイテム数
  private visibleItems = new Map<number, HTMLElement>();        // 現在表示中のアイテムのマップ
  private itemRenderer: (item: any, index: number) => HTMLElement; // アイテムレンダリング関数
  
  /**
   * 仮想スクロールマネージャーのコンストラクタ
   * @param container スクロールコンテナ要素
   * @param itemHeight 各アイテムの高さ（px）
   * @param itemRenderer アイテムをレンダリングする関数
   */
  constructor(
    container: HTMLElement, 
    itemHeight: number,
    itemRenderer: (item: any, index: number) => HTMLElement
  ) {
    this.container = container;
    this.itemHeight = itemHeight;
    this.itemRenderer = itemRenderer;
    this.setupScrollListener();  // スクロールイベントリスナーの設定
  }
  
  /**
   * アイテムのレンダリング
   * 現在のスクロール位置に基づいて、表示範囲内のアイテムのみをレンダリング
   */
  renderItems(items: any[]): void {
    const scrollTop = this.container.scrollTop;
    const containerHeight = this.container.clientHeight;
    
    // 表示範囲の計算（バッファ含む）
    const startIndex = Math.max(
      0, 
      Math.floor(scrollTop / this.itemHeight) - this.bufferSize
    );
    const endIndex = Math.min(
      items.length - 1,
      Math.ceil((scrollTop + containerHeight) / this.itemHeight) + this.bufferSize
    );
    
    // 表示範囲外のアイテムを削除
    this.cleanupInvisibleItems(startIndex, endIndex);
    
    // 表示範囲内のアイテムを追加レンダリング
    this.renderVisibleItems(items, startIndex, endIndex);
    
    // コンテナの全体の高さを更新
    this.updateContainerHeight(items.length);
  }
  
  /**
   * 非表示アイテムのクリーンアップ
   * 表示範囲外のアイテムをDOMから削除し、メモリを解放
   */
  private cleanupInvisibleItems(startIndex: number, endIndex: number): void {
    this.visibleItems.forEach((element, index) => {
      if (index < startIndex || index > endIndex) {
        element.remove();                    // DOMから削除
        this.visibleItems.delete(index);     // マップから削除
      }
    });
  }
  
  /**
   * 表示アイテムのレンダリング
   * 指定された範囲内のアイテムで、まだレンダリングされていないものを新規作成
   */
  private renderVisibleItems(
    items: any[], 
    startIndex: number, 
    endIndex: number
  ): void {
    
    for (let i = startIndex; i <= endIndex; i++) {
      // まだレンダリングされていないアイテムのみ処理
      if (!this.visibleItems.has(i) && items[i]) {
        const element = this.itemRenderer(items[i], i);
        
        // 仮想スクロールのための位置設定
        element.style.position = 'absolute';
        element.style.top = `${i * this.itemHeight}px`;  // インデックスに応じた位置
        element.style.height = `${this.itemHeight}px`;
        element.style.width = '100%';
        
        this.container.appendChild(element);
        this.visibleItems.set(i, element);  // 表示中アイテムとして記録
      }
    }
  }
  
  /**
   * コンテナ高さの更新
   * 全アイテム数に基づいてコンテナの高さを設定し、正しいスクロールバーを表示
   */
  private updateContainerHeight(itemCount: number): void {
    this.container.style.height = `${itemCount * this.itemHeight}px`;
  }
  
  /**
   * スクロールリスナーの設定
   * 60FPSでスムーズなスクロールを実現するため、デバウンス付きスクロールイベントを設定
   */
  private setupScrollListener(): void {
    let scrollTimer: any;
    
    this.container.addEventListener('scroll', () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        this.handleScroll();
      }, 16); // 60fpsでスムーズなスクロールを実現
    });
  }
  
  /**
   * スクロールイベントの処理
   * スクロール位置の情報を含むカスタムイベントを発行
   */
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

/**
 * グローバルパフォーマンスモニターインスタンス
 * アプリケーション全体で共用するパフォーマンス監視インスタンス
 */
export const performanceMonitor = new PerformanceMonitor();

// ブラウザ環境でのみ自動監視を開始
if (typeof window !== 'undefined') {
  // パフォーマンス監視の自動開始
  performanceMonitor.startMonitoring();
  
  // ページアンロード時のクリーンアップ処理
  window.addEventListener('beforeunload', () => {
    performanceMonitor.cleanup();
  });
}