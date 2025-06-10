// securityValidator.ts
// ───────────────────────────────────────────────────────────────────────────────
// セキュリティ検証とスクリプト実行サンドボックス

import { SecurityValidationResult, SecurityViolation, ValidationResult, ValidationError } from './types';
import { logger } from './errorHandler';

export class SecurityValidator {
  private dangerousPatterns: RegExp[] = [
    /eval\s*\(/,
    /Function\s*\(/,
    /setTimeout\s*\(/,
    /setInterval\s*\(/,
    /XMLHttpRequest/,
    /fetch\s*\(/,
    /WebSocket/,
    /Worker/,
    /SharedArrayBuffer/,
    /import\s*\(/,
    /require\s*\(/,
    /process\./,
    /global\./,
    /window\./,
    /document\./,
    /__proto__/,
    /constructor\.constructor/,
    /\.call\s*\(/,
    /\.apply\s*\(/,
    /\.bind\s*\(/
  ];
  
  private maxScriptLength = 50000; // 50KB
  
  validateScript(script: string): SecurityValidationResult {
    const violations: SecurityViolation[] = [];
    
    // 基本チェック
    if (!script || typeof script !== 'string') {
      return { isValid: true, violations: [] };
    }
    
    // スクリプト長制限
    if (script.length > this.maxScriptLength) {
      violations.push({
        type: 'SCRIPT_TOO_LONG',
        message: `Script exceeds maximum length of ${this.maxScriptLength} characters`,
        severity: 'HIGH'
      });
    }
    
    // 危険なパターンの検出
    this.dangerousPatterns.forEach(pattern => {
      if (pattern.test(script)) {
        violations.push({
          type: 'DANGEROUS_PATTERN',
          message: `Dangerous pattern detected: ${pattern}`,
          severity: 'CRITICAL',
          pattern: pattern.toString()
        });
      }
    });
    
    // 文字列リテラル内のコード検出
    const sanitizedScript = this.removeStringLiterals(script);
    if (this.hasObfuscatedCode(sanitizedScript)) {
      violations.push({
        type: 'OBFUSCATED_CODE',
        message: 'Potentially obfuscated code detected',
        severity: 'HIGH'
      });
    }
    
    return {
      isValid: !violations.some(v => v.severity === 'CRITICAL'),
      violations
    };
  }
  
  validateRequest(request: any): ValidationResult {
    const errors: ValidationError[] = [];
    
    try {
      // URL検証
      this.validateURL(request.url, errors);
      
      // メソッド検証
      this.validateMethod(request.method, errors);
      
      // ヘッダー検証
      this.validateHeaders(request.headers, errors);
      
      // ボディ検証
      this.validateBody(request.body, request.bodyType, errors);
      
      // 認証情報検証
      this.validateAuth(request.auth, errors);
      
      return {
        isValid: errors.length === 0,
        errors
      };
      
    } catch (error) {
      return {
        isValid: false,
        errors: [new ValidationError('Validation failed', { originalError: error })]
      };
    }
  }
  
  private validateURL(url: string, errors: ValidationError[]): void {
    if (!url || typeof url !== 'string') {
      errors.push(new ValidationError('URL is required'));
      return;
    }
    
    // プロトコル検証
    if (!url.match(/^https?:\/\//)) {
      errors.push(new ValidationError('URL must use HTTP or HTTPS protocol'));
    }
    
    // URLの形式検証
    try {
      const parsed = new URL(url);
      
      // ローカルホストの制限（本番環境）
      if (this.isProduction() && this.isLocalhost(parsed.hostname)) {
        errors.push(new ValidationError('Localhost URLs are not allowed in production'));
      }
      
      // プライベートIPアドレスの制限
      if (this.isPrivateIP(parsed.hostname)) {
        errors.push(new ValidationError('Private IP addresses are not allowed'));
      }
      
    } catch (error) {
      errors.push(new ValidationError('Invalid URL format'));
    }
  }
  
  private validateMethod(method: string, errors: ValidationError[]): void {
    const allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
    
    if (!method || !allowedMethods.includes(method.toUpperCase())) {
      errors.push(new ValidationError(`Invalid HTTP method: ${method}`));
    }
  }
  
  private validateHeaders(
    headers: Record<string, string>, 
    errors: ValidationError[]
  ): void {
    
    if (!headers || typeof headers !== 'object') {
      return;
    }
    
    Object.entries(headers).forEach(([name, value]) => {
      // ヘッダー名の検証
      if (!this.isValidHeaderName(name)) {
        errors.push(new ValidationError(`Invalid header name: ${name}`));
      }
      
      // 危険なヘッダーの検出
      if (this.isDangerousHeader(name)) {
        errors.push(new ValidationError(`Dangerous header detected: ${name}`));
      }
      
      // ヘッダー値の検証
      if (!this.isValidHeaderValue(value)) {
        errors.push(new ValidationError(`Invalid header value for ${name}`));
      }
    });
  }
  
  private validateBody(body: any, bodyType: string, errors: ValidationError[]): void {
    if (!body) return;
    
    // ボディサイズ制限
    const bodyString = typeof body === 'string' ? body : JSON.stringify(body);
    const maxBodySize = 10 * 1024 * 1024; // 10MB
    
    if (bodyString.length > maxBodySize) {
      errors.push(new ValidationError(`Request body exceeds maximum size of ${maxBodySize} bytes`));
    }
    
    // JSON形式の検証
    if (bodyType === 'json' && typeof body === 'string') {
      try {
        JSON.parse(body);
      } catch (error) {
        errors.push(new ValidationError('Invalid JSON format in request body'));
      }
    }
  }
  
  private validateAuth(auth: any, errors: ValidationError[]): void {
    if (!auth || auth.type === 'none') return;
    
    switch (auth.type) {
      case 'basic':
        if (!auth.username) {
          errors.push(new ValidationError('Username is required for Basic auth'));
        }
        break;
      case 'bearer':
        if (!auth.token) {
          errors.push(new ValidationError('Token is required for Bearer auth'));
        }
        break;
      case 'apikey':
        if (!auth.key || !auth.value) {
          errors.push(new ValidationError('Key and value are required for API Key auth'));
        }
        break;
    }
  }
  
  private removeStringLiterals(script: string): string {
    // 文字列リテラルを除去してコード構造を分析
    return script
      .replace(/"[^"\\]*(?:\\.[^"\\]*)*"/g, '""')  // ダブルクォート文字列
      .replace(/'[^'\\]*(?:\\.[^'\\]*)*'/g, "''")  // シングルクォート文字列
      .replace(/`[^`\\]*(?:\\.[^`\\]*)*`/g, '``'); // テンプレートリテラル
  }
  
  private hasObfuscatedCode(script: string): boolean {
    // 難読化コードの特徴を検出
    const obfuscationIndicators = [
      /\w{20,}/, // 異常に長い識別子
      /[0-9a-fA-F]{32,}/, // 長い16進数文字列
      /\\x[0-9a-fA-F]{2}/, // 16進エスケープシーケンス
      /\\u[0-9a-fA-F]{4}/, // Unicode エスケープシーケンス
      /eval\s*\(\s*['"]/ // eval with string literals
    ];
    
    return obfuscationIndicators.some(pattern => pattern.test(script));
  }
  
  private isValidHeaderName(name: string): boolean {
    // RFC 7230に準拠したヘッダー名検証
    return /^[a-zA-Z0-9!#$&'*+.^_`|~-]+$/.test(name);
  }
  
  private isDangerousHeader(name: string): boolean {
    const dangerousHeaders = [
      'host',
      'content-length',
      'transfer-encoding',
      'connection',
      'upgrade',
      'expect',
      'proxy-authorization'
    ];
    
    return dangerousHeaders.includes(name.toLowerCase());
  }
  
  private isValidHeaderValue(value: string): boolean {
    // 基本的なヘッダー値検証
    return typeof value === 'string' && value.length < 8192; // 8KB制限
  }
  
  private isProduction(): boolean {
    return process?.env?.NODE_ENV === 'production' || 
           !window.location?.hostname?.includes('localhost');
  }
  
  private isLocalhost(hostname: string): boolean {
    return hostname === 'localhost' || 
           hostname === '127.0.0.1' || 
           hostname.endsWith('.localhost');
  }
  
  private isPrivateIP(hostname: string): boolean {
    const privateIPRanges = [
      /^10\./,           // 10.0.0.0/8
      /^172\.(1[6-9]|2[0-9]|3[01])\./,  // 172.16.0.0/12
      /^192\.168\./,     // 192.168.0.0/16
      /^127\./,          // 127.0.0.0/8 (loopback)
      /^169\.254\./      // 169.254.0.0/16 (link-local)
    ];
    
    return privateIPRanges.some(pattern => pattern.test(hostname));
  }
}

// スクリプト実行サンドボックス
export class ScriptSandbox {
  private readonly TIMEOUT = 10000; // 10秒
  private securityValidator = new SecurityValidator();
  
  async executeScript(script: string, context: any): Promise<any> {
    // セキュリティ検証
    const securityResult = this.securityValidator.validateScript(script);
    if (!securityResult.isValid) {
      throw new Error(`Script contains dangerous patterns: ${securityResult.violations.map(v => v.message).join(', ')}`);
    }
    
    // 安全な実行環境作成
    const safeEnvironment = this.createSafeEnvironment(context);
    
    try {
      // スクリプト実行
      return await this.executeInSandbox(script, safeEnvironment);
    } catch (error) {
      logger.error('Script execution failed', error as Error, { script: script.substring(0, 100) });
      throw error;
    }
  }
  
  private createSafeEnvironment(context: any): any {
    const safeGlobals = {
      // 許可されたグローバルオブジェクト
      JSON: JSON,
      Date: Date,
      Math: Math,
      parseInt: parseInt,
      parseFloat: parseFloat,
      isNaN: isNaN,
      isFinite: isFinite,
      
      // 制限付きコンソール
      console: {
        log: (...args: any[]) => this.safeConsoleLog(args),
        warn: (...args: any[]) => this.safeConsoleWarn(args),
        error: (...args: any[]) => this.safeConsoleError(args)
      },
      
      // コンテキストオブジェクト
      ...context
    };
    
    // 危険なオブジェクトを無効化
    const restrictedGlobals = {
      eval: undefined,
      Function: undefined,
      setTimeout: undefined,
      setInterval: undefined,
      XMLHttpRequest: undefined,
      fetch: undefined,
      WebSocket: undefined,
      Worker: undefined,
      SharedArrayBuffer: undefined,
      window: undefined,
      document: undefined,
      location: undefined,
      history: undefined,
      localStorage: undefined,
      sessionStorage: undefined,
      indexedDB: undefined
    };
    
    return { ...safeGlobals, ...restrictedGlobals };
  }
  
  private async executeInSandbox(script: string, environment: any): Promise<any> {
    return new Promise((resolve, reject) => {
      // タイムアウト設定
      const timeout = setTimeout(() => {
        reject(new Error('Script execution timeout'));
      }, this.TIMEOUT);
      
      try {
        // Function constructor を使用した安全な実行
        const scriptFunction = new Function(
          ...Object.keys(environment),
          `"use strict"; ${script}`
        );
        
        const result = scriptFunction(...Object.values(environment));
        clearTimeout(timeout);
        resolve(result);
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }
  
  private safeConsoleLog(args: any[]): void {
    logger.info('Script console.log', { args: this.sanitizeArgs(args) });
  }
  
  private safeConsoleWarn(args: any[]): void {
    logger.warn('Script console.warn', { args: this.sanitizeArgs(args) });
  }
  
  private safeConsoleError(args: any[]): void {
    logger.error('Script console.error', undefined, { args: this.sanitizeArgs(args) });
  }
  
  private sanitizeArgs(args: any[]): any[] {
    return args.map(arg => {
      if (typeof arg === 'object' && arg !== null) {
        try {
          return JSON.parse(JSON.stringify(arg));
        } catch {
          return '[Circular or Non-serializable Object]';
        }
      }
      return arg;
    });
  }
}

// 暗号化サービス
export class EncryptionService {
  private readonly ALGORITHM = 'AES-GCM';
  private readonly KEY_LENGTH = 256;
  private readonly IV_LENGTH = 12;
  private readonly ITERATIONS = 100000;
  
  async generateMasterKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const passwordData = encoder.encode(password);
    
    // PBKDF2でキー導出
    const baseKey = await crypto.subtle.importKey(
      'raw',
      passwordData,
      'PBKDF2',
      false,
      ['deriveKey']
    );
    
    return await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: this.ITERATIONS,
        hash: 'SHA-256'
      },
      baseKey,
      {
        name: this.ALGORITHM,
        length: this.KEY_LENGTH
      },
      false,
      ['encrypt', 'decrypt']
    );
  }
  
  async encrypt(data: string, key: CryptoKey): Promise<EncryptedData> {
    const encoder = new TextEncoder();
    const dataBytes = encoder.encode(data);
    
    // ランダムIV生成
    const iv = crypto.getRandomValues(new Uint8Array(this.IV_LENGTH));
    
    // 暗号化実行
    const encryptedData = await crypto.subtle.encrypt(
      {
        name: this.ALGORITHM,
        iv: iv
      },
      key,
      dataBytes
    );
    
    return {
      algorithm: this.ALGORITHM,
      iv: Array.from(iv),
      data: Array.from(new Uint8Array(encryptedData)),
      timestamp: Date.now()
    };
  }
  
  async decrypt(encryptedData: EncryptedData, key: CryptoKey): Promise<string> {
    const iv = new Uint8Array(encryptedData.iv);
    const data = new Uint8Array(encryptedData.data);
    
    const decryptedData = await crypto.subtle.decrypt(
      {
        name: this.ALGORITHM,
        iv: iv
      },
      key,
      data
    );
    
    const decoder = new TextDecoder();
    return decoder.decode(decryptedData);
  }
  
  generateSalt(): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(32));
  }
}

interface EncryptedData {
  algorithm: string;
  iv: number[];
  data: number[];
  timestamp: number;
}

// グローバルインスタンス
export const securityValidator = new SecurityValidator();
export const scriptSandbox = new ScriptSandbox();
export const encryptionService = new EncryptionService();