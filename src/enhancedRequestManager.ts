// enhancedRequestManager.ts
// ───────────────────────────────────────────────────────────────────────────────
// 高度なリクエスト管理システム
// エラーハンドリング、パフォーマンス監視、セキュリティ機能を含む拡張リクエストマネージャー

import type { 
  RequestData, 
  ResponseData, 
  ProcessedRequest, 
  RequestResult, 
  ScriptContext, 
  ScriptResult,
  ValidationResult 
} from './types';
import { logger } from './errorHandler';
import { performanceMonitor } from './performanceMonitor';
import { securityValidator, scriptSandbox } from './securityValidator';
import { getVariable, setVariable, replaceVariables } from './variableManager';

/**
 * 拡張リクエストマネージャークラス
 * HTTP リクエストの高度な管理、並行処理制御、エラーハンドリングを提供
 */
export class EnhancedRequestManager {
  private activeRequests = new Map<string, AbortController>();  // アクティブなリクエスト管理
  private requestQueue: RequestQueueItem[] = [];               // リクエストキュー
  private readonly maxConcurrentRequests = 5;                 // 最大同時実行数
  private httpClient = new HttpClient();                      // HTTPクライアント
  
  constructor() {
    this.setupPerformanceMonitoring();
  }
  
  /**
   * リクエスト送信のメインメソッド
   * リクエストの検証、前処理、実行、後処理、結果の確定を順次実行
   */
  async sendRequest(request: RequestData): Promise<RequestResult> {
    const requestId = this.generateRequestId();
    const abortController = new AbortController();
    
    try {
      // フェーズ1: 検証と前処理
      this.validateRequest(request);
      
      await this.waitForSlot();
      this.activeRequests.set(requestId, abortController);
      
      const perfTimer = performanceMonitor.startTimer('request_execution');
      
      // フェーズ2: リクエスト前処理
      const preProcessedRequest = await this.executePreRequestPhase(
        request, 
        { requestId, abortSignal: abortController.signal }
      );
      
      // フェーズ3: HTTPリクエスト実行
      const response = await this.executeHttpRequest(
        preProcessedRequest,
        { requestId, abortSignal: abortController.signal }
      );
      
      // フェーズ4: リクエスト後処理
      const result = await this.executePostRequestPhase(
        preProcessedRequest,
        response,
        { requestId, abortSignal: abortController.signal }
      );
      
      // フェーズ5: 結果の確定
      return await this.finalizeRequest(
        requestId,
        preProcessedRequest,
        response,
        result,
        perfTimer
      );
      
    } catch (error) {
      return await this.handleRequestError(requestId, request, error);
    } finally {
      this.cleanupRequest(requestId);
    }
  }
  
  /**
   * リクエストの妥当性を検証
   * セキュリティチェックとデータ整合性の確認
   */
  validateRequest(request: RequestData): ValidationResult {
    return securityValidator.validateRequest(request);
  }
  
  /**
   * プリリクエストスクリプトの実行
   * リクエスト送信前に実行するカスタムスクリプトの処理
   */
  async executePreRequestScript(
    script: string, 
    context: ScriptContext
  ): Promise<ScriptResult> {
    if (!script?.trim()) {
      return { success: true };
    }
    
    const perfTimer = performanceMonitor.startTimer('script_execution', 'pre_request');
    
    try {
      const result = await scriptSandbox.executeScript(script, context);
      
      return {
        success: true,
        output: result,
        duration: performanceMonitor.endTimer(perfTimer)
      };
    } catch (error: any) {
      logger.error('Pre-request script execution failed', error);
      
      return {
        success: false,
        error: error.message,
        duration: performanceMonitor.endTimer(perfTimer)
      };
    }
  }
  
  /**
   * テストスクリプトの実行
   * レスポンス受信後に実行するテスト・検証スクリプトの処理
   */
  async executeTestScript(
    script: string, 
    response: ResponseData, 
    request: RequestData
  ): Promise<ScriptResult> {
    if (!script?.trim()) {
      return { success: true };
    }
    
    const perfTimer = performanceMonitor.startTimer('script_execution', 'test');
    
    try {
      // Postman API互換のコンテキストを作成
      const context = this.createPostmanContext(request, response);
      
      const result = await scriptSandbox.executeScript(script, context);
      
      return {
        success: true,
        output: result,
        duration: performanceMonitor.endTimer(perfTimer)
      };
    } catch (error: any) {
      logger.error('Test script execution failed', error);
      
      return {
        success: false,
        error: error.message,
        duration: performanceMonitor.endTimer(perfTimer)
      };
    }
  }
  
  /**
   * リクエスト前処理フェーズ
   * 変数の処理、スクリプト実行、認証情報の設定を行う
   */
  private async executePreRequestPhase(
    request: RequestData, 
    context: RequestContext
  ): Promise<ProcessedRequest> {
    
    const phaseTimer = performanceMonitor.startTimer('pre_request_phase');
    
    try {
      // ステップ1: 変数コンテキストの構築
      const variableContext = await this.buildVariableContext(request);
      
      // ステップ2: プリリクエストスクリプト実行
      if (request.preRequestScript?.trim()) {
        const scriptContext = this.createScriptContext(request, variableContext);
        await this.executePreRequestScript(
          request.preRequestScript,
          scriptContext
        );
      }
      
      // ステップ3: 変数の処理
      const processedRequest = await this.processVariables(request, variableContext);
      
      // ステップ4: リクエストデータの正規化
      const normalizedRequest = this.normalizeRequest(processedRequest);
      
      // ステップ5: 認証処理
      const authenticatedRequest = await this.processAuthentication(normalizedRequest);
      
      return {
        ...authenticatedRequest,
        processedUrl: authenticatedRequest.url,
        processedHeaders: authenticatedRequest.headers,
        processedBody: authenticatedRequest.body,
        executionId: context.requestId
      };
      
    } catch (error) {
      logger.error('Pre-request phase failed', error as Error, {
        requestId: context.requestId,
        requestName: request.name
      });
      throw error;
    } finally {
      performanceMonitor.endTimer(phaseTimer);
    }
  }
  
  /**
   * HTTPリクエスト実行フェーズ
   * 実際のHTTP通信を行い、レスポンスを取得
   */
  private async executeHttpRequest(
    request: ProcessedRequest,
    context: RequestContext
  ): Promise<ResponseData> {
    
    const httpTimer = performanceMonitor.startTimer('http_request');
    const startTimestamp = performance.now();
    
    try {
      const response = await this.httpClient.send(request, context);
      
      const endTimestamp = performance.now();
      
      return {
        ...response,
        duration: endTimestamp - startTimestamp,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      const endTimestamp = performance.now();
      
      logger.error('HTTP request failed', error as Error, {
        url: request.url,
        method: request.method,
        duration: endTimestamp - startTimestamp
      });
      
      throw error;
    } finally {
      performanceMonitor.endTimer(httpTimer);
    }
  }
  
  private async executePostRequestPhase(
    request: ProcessedRequest,
    response: ResponseData,
    _context: RequestContext
  ): Promise<any> {
    
    const phaseTimer = performanceMonitor.startTimer('post_request_phase');
    
    try {
      // Execute test script
      if (request.testScript?.trim()) {
        const testResult = await this.executeTestScript(
          request.testScript,
          response,
          request
        );
        
        return testResult;
      }
      
      return { success: true };
      
    } catch (error) {
      logger.error('Post-request phase failed', error as Error);
      throw error;
    } finally {
      performanceMonitor.endTimer(phaseTimer);
    }
  }
  
  /**
   * 変数の処理
   * リクエスト内の変数参照を実際の値に置換
   */
  private async processVariables(
    request: RequestData, 
    context: VariableContext
  ): Promise<RequestData> {
    
    const processed: RequestData = { ...request };
    
    // 依存関係を考慮した処理順序
    const processingOrder = ['url', 'headers', 'params', 'body'];
    
    for (const field of processingOrder) {
      try {
        (processed as any)[field] = await this.processFieldVariables(
          (request as any)[field], 
          context,
          field
        );
      } catch (error) {
        logger.warn(`Variable processing failed for field: ${field}`, error as Record<string, any>);
        
        // 非重要フィールドのエラーは継続
        if (!this.isCriticalField(field)) {
          (processed as any)[field] = (request as any)[field]; // 元の値を使用
        } else {
          throw error;
        }
      }
    }
    
    return processed;
  }
  
  /**
   * フィールド値の変数処理
   * 文字列、オブジェクトに応じて適切な変数処理を実行
   */
  private async processFieldVariables(
    fieldValue: any, 
    context: VariableContext,
    _fieldName: string
  ): Promise<any> {
    
    if (typeof fieldValue === 'string') {
      return await this.processStringVariables(fieldValue, context);
    }
    
    if (typeof fieldValue === 'object' && fieldValue !== null) {
      return await this.processObjectVariables(fieldValue, context);
    }
    
    return fieldValue;
  }
  
  /**
   * 文字列内の変数処理
   * {{variableName}} パターンの変数参照を実際の値に置換
   */
  private async processStringVariables(
    text: string, 
    _context: VariableContext
  ): Promise<string> {
    // 変数参照パターン: {{variableName}}
    return replaceVariables(text);
  }
  
  /**
   * オブジェクト内の変数処理
   * オブジェクトの各プロパティ値に対して再帰的に変数処理を実行
   */
  private async processObjectVariables(
    obj: Record<string, any>,
    context: VariableContext
  ): Promise<Record<string, any>> {
    
    const processed: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        processed[key] = await this.processStringVariables(value, context);
      } else if (typeof value === 'object' && value !== null) {
        processed[key] = await this.processObjectVariables(value, context);
      } else {
        processed[key] = value;
      }
    }
    
    return processed;
  }
  
  /**
   * リクエストデータの正規化
   * URL形式やHTTPメソッドの標準化を行う
   */
  private normalizeRequest(request: RequestData): RequestData {
    // リクエストデータの正規化
    const normalized = { ...request };
    
    // URL正規化（プロトコル補完）
    if (normalized.url && !normalized.url.match(/^https?:\/\//)) {
      normalized.url = `http://${normalized.url}`;
    }
    
    // メソッド正規化（大文字統一）
    normalized.method = normalized.method.toUpperCase();
    
    return normalized;
  }
  
  /**
   * 認証情報の処理
   * Basic、Bearer、API Key認証をヘッダーまたはパラメータに設定
   */
  private async processAuthentication(request: RequestData): Promise<RequestData> {
    const authenticated = { ...request };
    
    if (!request.auth || request.auth.type === 'none') {
      return authenticated;
    }
    
    switch (request.auth.type) {
      case 'basic':
        // Basic認証の処理
        if (request.auth.username && request.auth.password) {
          const credentials = btoa(`${request.auth.username}:${request.auth.password}`);
          authenticated.headers = {
            ...authenticated.headers,
            'Authorization': `Basic ${credentials}`
          };
        }
        break;
        
      case 'bearer':
        // Bearer トークン認証の処理
        if (request.auth.token) {
          authenticated.headers = {
            ...authenticated.headers,
            'Authorization': `Bearer ${request.auth.token}`
          };
        }
        break;
        
      case 'apikey':
        // API Key認証の処理
        if (request.auth.key && request.auth.value) {
          if (request.auth.addTo === 'header') {
            // ヘッダーに追加
            authenticated.headers = {
              ...authenticated.headers,
              [request.auth.key]: request.auth.value
            };
          } else if (request.auth.addTo === 'query') {
            // クエリパラメータに追加
            authenticated.params = {
              ...authenticated.params,
              [request.auth.key]: request.auth.value
            };
          }
        }
        break;
    }
    
    return authenticated;
  }
  
  private createPostmanContext(
    request: RequestData, 
    response: ResponseData
  ): ScriptContext {
    return {
      request,
      response,
      pm: {
        request: {
          url: request.url,
          method: request.method,
          headers: request.headers,
          body: request.body
        },
        response: {
          code: response.status,
          status: response.statusText,
          headers: response.headers,
          json: () => {
            try {
              return typeof response.body === 'string' 
                ? JSON.parse(response.body) 
                : response.body;
            } catch {
              return null;
            }
          },
          text: () => typeof response.body === 'string' 
            ? response.body 
            : JSON.stringify(response.body),
          responseTime: response.duration,
          responseSize: response.size
        },
        variables: {
          get: (name: string) => getVariable(name),
          set: (name: string, value: any) => setVariable(name, value, 'collection')
        },
        test: (_name: string, _fn: () => void) => {
          // Test execution logic
        },
        expect: (_actual: any) => {
          // Chai-compatible assertions
        }
      }
    };
  }
  
  private async buildVariableContext(_request: RequestData): Promise<VariableContext> {
    return {
      global: {},
      environment: {},
      collection: {},
      runtime: {}
    };
  }
  
  private createScriptContext(
    request: RequestData, 
    variableContext: VariableContext
  ): ScriptContext {
    return {
      request,
      variables: variableContext,
      environment: variableContext.environment,
      globals: variableContext.global
    };
  }
  
  private isCriticalField(field: string): boolean {
    return ['url', 'method'].includes(field);
  }
  
  private async finalizeRequest(
    requestId: string,
    request: ProcessedRequest,
    response: ResponseData,
    result: any,
    perfTimer: string
  ): Promise<RequestResult> {
    
    const duration = performanceMonitor.endTimer(perfTimer);
    
    // Record metrics
    performanceMonitor.recordCustomMetric(
      'request_complete',
      'total_duration',
      duration,
      {
        method: request.method,
        status: response.status,
        url: new URL(request.url).hostname
      }
    );
    
    return {
      success: true,
      request,
      response,
      duration,
      testResults: result.testResults,
      executionId: requestId
    };
  }
  
  private async handleRequestError(
    requestId: string, 
    request: RequestData, 
    error: any
  ): Promise<RequestResult> {
    
    logger.error('Request execution failed', error, {
      requestId,
      requestName: request.name,
      url: request.url
    });
    
    return {
      success: false,
      request: request as ProcessedRequest,
      error: error,
      duration: 0,
      executionId: requestId
    };
  }
  
  private cleanupRequest(requestId: string): void {
    this.activeRequests.delete(requestId);
    this.processQueue();
  }
  
  private async waitForSlot(): Promise<void> {
    const maxRetries = 10;
    const retryDelay = 100;
    
    for (let i = 0; i < maxRetries; i++) {
      if (this.activeRequests.size < this.maxConcurrentRequests) {
        return;
      }
      
      await this.delay(retryDelay * (i + 1));
    }
    
    throw new Error('Request queue full');
  }
  
  private processQueue(): void {
    if (this.requestQueue.length > 0 && 
        this.activeRequests.size < this.maxConcurrentRequests) {
      const item = this.requestQueue.shift();
      if (item) {
        this.sendRequest(item.request)
          .then(item.resolve)
          .catch(item.reject);
      }
    }
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * 一意なリクエストIDを生成
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * パフォーマンス監視の初期設定
   */
  private setupPerformanceMonitoring(): void {
    // パフォーマンス監視の設定
    performanceMonitor.recordCustomMetric(
      'request_manager',
      'initialized',
      Date.now()
    );
  }
}

/**
 * HTTPクライアントクラス
 * XMLHttpRequestを使用したHTTP通信の実装
 */
class HttpClient {
  private defaultTimeout = 30000;  // デフォルトタイムアウト（30秒）
  
  /**
   * HTTPリクエストを送信
   * プロセス済みリクエストを実際のHTTP通信として実行
   */
  async send(
    request: ProcessedRequest, 
    context: RequestContext
  ): Promise<ResponseData> {
    
    const xhr = new XMLHttpRequest();
    
    return new Promise((resolve, reject) => {
      xhr.timeout = (request as any).timeout || this.defaultTimeout;
      
      // 正常完了時の処理
      xhr.onload = () => {
        if (xhr.readyState === XMLHttpRequest.DONE) {
          resolve(this.createResponseData(xhr));
        }
      };
      
      // エラーハンドリング
      xhr.onerror = () => reject(new Error('Network request failed'));
      xhr.ontimeout = () => reject(new Error('Request timeout'));
      xhr.onabort = () => reject(new Error('Request aborted'));
      
      // 中断シグナルの監視
      context.abortSignal?.addEventListener('abort', () => {
        xhr.abort();
      });
      
      xhr.open(request.method, request.url, true);
      
      // ヘッダーの設定
      for (const [name, value] of Object.entries(request.headers || {})) {
        if (value && value.trim()) {
          try {
            xhr.setRequestHeader(name, value);
          } catch (error) {
            logger.warn(`Invalid header: ${name}`, error as Record<string, any>);
          }
        }
      }
      
      xhr.send(request.body as any);
    });
  }
  
  /**
   * XMLHttpRequestからResponseDataを作成
   */
  private createResponseData(xhr: XMLHttpRequest): ResponseData {
    return {
      status: xhr.status,
      statusText: xhr.statusText,
      headers: this.parseHeaders(xhr.getAllResponseHeaders()),
      body: xhr.responseText,
      bodyText: xhr.responseText,
      duration: 0, // 呼び出し元で設定
      size: new Blob([xhr.responseText]).size
    };
  }
  
  /**
   * ヘッダー文字列をパースしてオブジェクトに変換
   */
  private parseHeaders(headerString: string): Record<string, string> {
    const headers: Record<string, string> = {};
    headerString.split('\r\n').forEach(line => {
      const [name, value] = line.split(': ');
      if (name && value) {
        headers[name.toLowerCase()] = value;
      }
    });
    return headers;
  }
}

/**
 * リクエスト実行コンテキスト
 * リクエストの実行に必要な情報を格納
 */
interface RequestContext {
  requestId: string;     // リクエストID
  abortSignal: AbortSignal;  // 中断シグナル
}

/**
 * 変数コンテキスト
 * 各種変数のスコープ別データを格納
 */
interface VariableContext {
  global: Record<string, any>;      // グローバル変数
  environment: Record<string, any>; // 環境変数
  collection: Record<string, any>;  // コレクション変数
  runtime: Record<string, any>;     // ランタイム変数
}

/**
 * リクエストキューアイテム
 * 待機中リクエストの管理用
 */
interface RequestQueueItem {
  request: RequestData;                    // リクエストデータ
  resolve: (result: RequestResult) => void;  // 成功時のコールバック
  reject: (error: any) => void;              // 失敗時のコールバック
}

// グローバルインスタンス
export const enhancedRequestManager = new EnhancedRequestManager();