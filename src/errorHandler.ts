// errorHandler.ts
// ───────────────────────────────────────────────────────────────────────────────
// 統一エラーハンドリングシステム

import { AppError, ErrorCategory, ErrorData } from './types';

export class GlobalErrorHandler {
  private errorReporters: ErrorReporter[] = [];
  private recoveryStrategies = new Map<string, RecoveryStrategy>();
  private errorMetrics: ErrorMetrics = new ErrorMetrics();
  
  initialize(): void {
    // グローバルエラーイベントの監視
    window.addEventListener('error', (event) => {
      this.handleError(new UnhandledError(event.error || event.message));
    });
    
    window.addEventListener('unhandledrejection', (event) => {
      this.handleError(new UnhandledPromiseRejectionError(event.reason));
    });
    
    // Chrome Extension specific error handling
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.onInstalled.addListener(() => {
        this.setupExtensionErrorHandling();
      });
    }
  }
  
  async handleError(error: Error): Promise<void> {
    try {
      // エラーメトリクスの更新
      this.errorMetrics.record(error);
      
      // エラーのカテゴリ分析
      const errorCategory = this.categorizeError(error);
      
      // 復旧戦略の実行
      const recovered = await this.attemptRecovery(error, errorCategory);
      
      // エラーレポート
      await this.reportError(error, errorCategory, recovered);
      
      // ユーザー通知
      if (this.shouldNotifyUser(error, errorCategory)) {
        this.notifyUser(error, errorCategory);
      }
      
    } catch (handlingError) {
      // エラーハンドリング自体が失敗した場合
      console.error('Error handler failed', handlingError);
      this.fallbackErrorHandling(error, handlingError);
    }
  }
  
  private categorizeError(error: Error): ErrorCategory {
    if (error instanceof AppError) {
      return error.category;
    }
    
    // エラーメッセージやタイプから推測
    const message = error.message.toLowerCase();
    
    if (message.includes('network') || message.includes('fetch') || message.includes('xhr')) {
      return ErrorCategory.NETWORK;
    }
    
    if (message.includes('storage') || message.includes('quota')) {
      return ErrorCategory.STORAGE;
    }
    
    if (message.includes('script') || message.includes('syntax')) {
      return ErrorCategory.SCRIPT;
    }
    
    if (message.includes('permission') || message.includes('security')) {
      return ErrorCategory.SECURITY;
    }
    
    return ErrorCategory.SYSTEM;
  }
  
  private async attemptRecovery(
    error: Error, 
    category: ErrorCategory
  ): Promise<boolean> {
    
    const strategyKey = `${error.constructor.name}_${category}`;
    const strategy = this.recoveryStrategies.get(strategyKey);
    
    if (!strategy) {
      return false;
    }
    
    try {
      return await strategy.recover(error);
    } catch (recoveryError) {
      console.warn('Recovery strategy failed', recoveryError);
      return false;
    }
  }
  
  private async reportError(
    error: Error, 
    category: ErrorCategory, 
    recovered: boolean
  ): Promise<void> {
    const errorData: ErrorData = {
      code: error instanceof AppError ? error.code : 'UNKNOWN_ERROR',
      category,
      name: error.name,
      message: error.message,
      timestamp: new Date().toISOString(),
      context: {
        userAgent: navigator.userAgent,
        url: window.location?.href || 'extension',
        recovered
      },
      stack: error.stack
    };
    
    for (const reporter of this.errorReporters) {
      try {
        await reporter.report(errorData);
      } catch (reportError) {
        console.error('Error reporter failed', reportError);
      }
    }
  }
  
  private shouldNotifyUser(error: Error, category: ErrorCategory): boolean {
    // セキュリティエラーやネットワークエラーは通知
    return category === ErrorCategory.SECURITY || 
           category === ErrorCategory.NETWORK ||
           category === ErrorCategory.STORAGE;
  }
  
  private notifyUser(error: Error, category: ErrorCategory): void {
    const message = this.getUserFriendlyMessage(error, category);
    
    // ユーザー通知の実装
    if (typeof window !== 'undefined') {
      const { showError } = require('./utils');
      showError(message);
    }
  }
  
  private getUserFriendlyMessage(error: Error, category: ErrorCategory): string {
    switch (category) {
      case ErrorCategory.NETWORK:
        return 'Network connection error. Please check your internet connection and try again.';
      case ErrorCategory.STORAGE:
        return 'Storage error occurred. Your data may not be saved properly.';
      case ErrorCategory.SECURITY:
        return 'Security error detected. Please review your request settings.';
      case ErrorCategory.SCRIPT:
        return 'Script execution error. Please check your pre-request or test scripts.';
      default:
        return 'An unexpected error occurred. Please try again.';
    }
  }
  
  private fallbackErrorHandling(originalError: Error, handlingError: Error): void {
    console.error('Fallback error handling', {
      original: originalError,
      handling: handlingError
    });
    
    // 最後の手段としてアラートで通知
    if (typeof alert !== 'undefined') {
      alert('A critical error occurred. Please refresh the page.');
    }
  }
  
  private setupExtensionErrorHandling(): void {
    // Chrome拡張機能特有のエラーハンドリング設定
    if (chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'ERROR_REPORT') {
          this.handleError(new Error(message.error));
        }
      });
    }
  }
  
  addErrorReporter(reporter: ErrorReporter): void {
    this.errorReporters.push(reporter);
  }
  
  setRecoveryStrategy(errorType: string, category: ErrorCategory, strategy: RecoveryStrategy): void {
    const key = `${errorType}_${category}`;
    this.recoveryStrategies.set(key, strategy);
  }
}

interface ErrorReporter {
  report(error: ErrorData): Promise<void>;
}

interface RecoveryStrategy {
  recover(error: Error): Promise<boolean>;
}

class ErrorMetrics {
  private errorCounts = new Map<string, number>();
  private errorHistory: ErrorData[] = [];
  private readonly maxHistorySize = 100;
  
  record(error: Error): void {
    const key = error.constructor.name;
    const count = this.errorCounts.get(key) || 0;
    this.errorCounts.set(key, count + 1);
    
    if (error instanceof AppError) {
      this.errorHistory.push(error.toJSON());
    } else {
      this.errorHistory.push({
        code: 'UNKNOWN_ERROR',
        category: ErrorCategory.SYSTEM,
        name: error.name,
        message: error.message,
        timestamp: new Date().toISOString(),
        stack: error.stack
      });
    }
    
    // 履歴サイズ制限
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory.shift();
    }
  }
  
  getErrorCount(errorType: string): number {
    return this.errorCounts.get(errorType) || 0;
  }
  
  getErrorHistory(): ErrorData[] {
    return [...this.errorHistory];
  }
  
  getTotalErrorCount(): number {
    return Array.from(this.errorCounts.values()).reduce((sum, count) => sum + count, 0);
  }
}

class UnhandledError extends AppError {
  readonly code = 'UNHANDLED_ERROR';
  readonly category = ErrorCategory.SYSTEM;
}

class UnhandledPromiseRejectionError extends AppError {
  readonly code = 'UNHANDLED_PROMISE_REJECTION';
  readonly category = ErrorCategory.SYSTEM;
}

// Logger implementation
export class Logger {
  private logBuffer: LogEntry[] = [];
  private readonly maxBufferSize = 1000;
  private logLevel: LogLevel = LogLevel.INFO;
  
  setLevel(level: LogLevel): void {
    this.logLevel = level;
  }
  
  error(message: string, error?: Error, context?: Record<string, any>): void {
    this.log(LogLevel.ERROR, message, context, error);
  }
  
  warn(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, context);
  }
  
  info(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, context);
  }
  
  debug(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, context);
  }
  
  private log(level: LogLevel, message: string, data?: any, error?: Error): void {
    if (level > this.logLevel) return;
    
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel[level],
      message,
      data: this.sanitizeData(data),
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : undefined,
      context: this.gatherContext()
    };
    
    this.addToBuffer(entry);
    this.outputLog(entry);
  }
  
  private sanitizeData(data: any): any {
    if (!data) return data;
    
    const sanitized = JSON.parse(JSON.stringify(data));
    this.maskSensitiveData(sanitized);
    return sanitized;
  }
  
  private maskSensitiveData(obj: any): void {
    const sensitiveKeys = ['password', 'token', 'key', 'secret', 'authorization'];
    
    if (typeof obj === 'object' && obj !== null) {
      for (const [key, value] of Object.entries(obj)) {
        if (sensitiveKeys.some(k => key.toLowerCase().includes(k))) {
          obj[key] = '***MASKED***';
        } else if (typeof value === 'object') {
          this.maskSensitiveData(value);
        }
      }
    }
  }
  
  private gatherContext(): LogContext {
    return {
      userAgent: navigator.userAgent,
      url: window.location?.href || 'extension',
      timestamp: Date.now(),
      sessionId: this.getSessionId()
    };
  }
  
  private getSessionId(): string {
    let sessionId = sessionStorage.getItem('postpro_session_id');
    if (!sessionId) {
      sessionId = this.generateId();
      sessionStorage.setItem('postpro_session_id', sessionId);
    }
    return sessionId;
  }
  
  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }
  
  private addToBuffer(entry: LogEntry): void {
    this.logBuffer.push(entry);
    
    if (this.logBuffer.length > this.maxBufferSize) {
      this.logBuffer.shift();
    }
  }
  
  private outputLog(entry: LogEntry): void {
    const logMethod = entry.level.toLowerCase() as keyof Console;
    if (console[logMethod] && typeof console[logMethod] === 'function') {
      (console[logMethod] as Function)(
        `[${entry.timestamp}] ${entry.level}: ${entry.message}`,
        entry.data || '',
        entry.error || ''
      );
    }
  }
  
  exportLogs(): string {
    return JSON.stringify(this.logBuffer, null, 2);
  }
  
  clearLogs(): void {
    this.logBuffer.length = 0;
  }
}

enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  data?: any;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  context: LogContext;
}

interface LogContext {
  userAgent: string;
  url: string;
  timestamp: number;
  sessionId: string;
}

// グローバルインスタンス
export const globalErrorHandler = new GlobalErrorHandler();
export const logger = new Logger();

// 初期化
if (typeof window !== 'undefined') {
  globalErrorHandler.initialize();
}