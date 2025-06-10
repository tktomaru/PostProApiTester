// enhancedRequestManagerFixed.ts
// Enhanced request management with error handling, performance monitoring, and security

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

export class EnhancedRequestManager {
  private activeRequests = new Map<string, AbortController>();
  private requestQueue: RequestQueueItem[] = [];
  private readonly maxConcurrentRequests = 5;
  private httpClient = new HttpClient();
  
  constructor() {
    this.setupPerformanceMonitoring();
  }
  
  async sendRequest(request: RequestData): Promise<RequestResult> {
    const requestId = this.generateRequestId();
    const abortController = new AbortController();
    
    try {
      // Phase 1: Validation and preprocessing
      this.validateRequest(request);
      
      await this.waitForSlot();
      this.activeRequests.set(requestId, abortController);
      
      const perfTimer = performanceMonitor.startTimer('request_execution');
      
      // Phase 2: Pre-request processing
      const preProcessedRequest = await this.executePreRequestPhase(
        request, 
        { requestId, abortSignal: abortController.signal }
      );
      
      // Phase 3: HTTP request execution
      const response = await this.executeHttpRequest(
        preProcessedRequest,
        { requestId, abortSignal: abortController.signal }
      );
      
      // Phase 4: Post-request processing
      const result = await this.executePostRequestPhase(
        preProcessedRequest,
        response,
        { requestId, abortSignal: abortController.signal }
      );
      
      // Phase 5: Result finalization
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
  
  validateRequest(request: RequestData): ValidationResult {
    return securityValidator.validateRequest(request);
  }
  
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
      // Create Postman API compatible context
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
  
  private async executePreRequestPhase(
    request: RequestData, 
    context: RequestContext
  ): Promise<ProcessedRequest> {
    
    const phaseTimer = performanceMonitor.startTimer('pre_request_phase');
    
    try {
      // Step 1: Build variable context
      const variableContext = await this.buildVariableContext(request);
      
      // Step 2: Execute pre-request script
      if (request.preRequestScript?.trim()) {
        const scriptContext = this.createScriptContext(request, variableContext);
        await this.executePreRequestScript(
          request.preRequestScript,
          scriptContext
        );
      }
      
      // Step 3: Process variables
      const processedRequest = await this.processVariables(request, variableContext);
      
      // Step 4: Normalize request data
      const normalizedRequest = this.normalizeRequest(processedRequest);
      
      // Step 5: Process authentication
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
  
  private async processVariables(
    request: RequestData, 
    context: VariableContext
  ): Promise<RequestData> {
    
    const processed: RequestData = { ...request };
    
    // Processing order considering dependencies
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
        
        // Continue with non-critical errors
        if (!this.isCriticalField(field)) {
          (processed as any)[field] = (request as any)[field]; // Use original value
        } else {
          throw error;
        }
      }
    }
    
    return processed;
  }
  
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
  
  private async processStringVariables(
    text: string, 
    _context: VariableContext
  ): Promise<string> {
    // Variable reference pattern: {{variableName}}
    return replaceVariables(text);
  }
  
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
  
  private normalizeRequest(request: RequestData): RequestData {
    // Normalize request data
    const normalized = { ...request };
    
    // URL normalization
    if (normalized.url && !normalized.url.match(/^https?:\/\//)) {
      normalized.url = `http://${normalized.url}`;
    }
    
    // Method normalization
    normalized.method = normalized.method.toUpperCase();
    
    return normalized;
  }
  
  private async processAuthentication(request: RequestData): Promise<RequestData> {
    const authenticated = { ...request };
    
    if (!request.auth || request.auth.type === 'none') {
      return authenticated;
    }
    
    switch (request.auth.type) {
      case 'basic':
        if (request.auth.username && request.auth.password) {
          const credentials = btoa(`${request.auth.username}:${request.auth.password}`);
          authenticated.headers = {
            ...authenticated.headers,
            'Authorization': `Basic ${credentials}`
          };
        }
        break;
        
      case 'bearer':
        if (request.auth.token) {
          authenticated.headers = {
            ...authenticated.headers,
            'Authorization': `Bearer ${request.auth.token}`
          };
        }
        break;
        
      case 'apikey':
        if (request.auth.key && request.auth.value) {
          if (request.auth.addTo === 'header') {
            authenticated.headers = {
              ...authenticated.headers,
              [request.auth.key]: request.auth.value
            };
          } else if (request.auth.addTo === 'query') {
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
  
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  private setupPerformanceMonitoring(): void {
    // Setup performance monitoring
    performanceMonitor.recordCustomMetric(
      'request_manager',
      'initialized',
      Date.now()
    );
  }
}

class HttpClient {
  private defaultTimeout = 30000;
  
  async send(
    request: ProcessedRequest, 
    context: RequestContext
  ): Promise<ResponseData> {
    
    const xhr = new XMLHttpRequest();
    
    return new Promise((resolve, reject) => {
      xhr.timeout = (request as any).timeout || this.defaultTimeout;
      
      xhr.onload = () => {
        if (xhr.readyState === XMLHttpRequest.DONE) {
          resolve(this.createResponseData(xhr));
        }
      };
      
      xhr.onerror = () => reject(new Error('Network request failed'));
      xhr.ontimeout = () => reject(new Error('Request timeout'));
      xhr.onabort = () => reject(new Error('Request aborted'));
      
      // Monitor abort signal
      context.abortSignal?.addEventListener('abort', () => {
        xhr.abort();
      });
      
      xhr.open(request.method, request.url, true);
      
      // Set headers
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
  
  private createResponseData(xhr: XMLHttpRequest): ResponseData {
    return {
      status: xhr.status,
      statusText: xhr.statusText,
      headers: this.parseHeaders(xhr.getAllResponseHeaders()),
      body: xhr.responseText,
      bodyText: xhr.responseText,
      duration: 0, // Will be set by caller
      size: new Blob([xhr.responseText]).size
    };
  }
  
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

interface RequestContext {
  requestId: string;
  abortSignal: AbortSignal;
}

interface VariableContext {
  global: Record<string, any>;
  environment: Record<string, any>;
  collection: Record<string, any>;
  runtime: Record<string, any>;
}

interface RequestQueueItem {
  request: RequestData;
  resolve: (result: RequestResult) => void;
  reject: (error: any) => void;
}


// Global instance
export const enhancedRequestManager = new EnhancedRequestManager();