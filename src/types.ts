// Common types for the API Tester application

/** A single form-data field, either text or file (base64). */
export interface FormDataField {
  key: string;
  type: 'text' | 'file';
  value?: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  fileContent?: string;
}


export interface RequestData {
  id: string;
  name: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  params: Record<string, string>;
  /** now allows our serialized form-data array too */
  body:
  | null
  | string
  | Record<string, string>
  | FormDataField[]
  | File;
  bodyType: 'none' | 'raw' | 'json' | 'form-data' | 'urlencoded' | 'binary';
  auth: AuthConfig;
  preRequestScript: string;
  testScript?: string;
  timestamp?: number;
  status?: number;
  responseHeaders?: Record<string, string>;
  duration?: number;
  error?: string;
  folder?: string;
  description?: string;
  lastRequestExecution?: RequestExecution;
  lastResponseExecution?: ResponseExecution;
}

export interface AuthConfig {
  type: 'none' | 'basic' | 'bearer' | 'apikey' | 'oauth2';
  username?: string;
  password?: string;
  token?: string;
  key?: string;
  value?: string;
  addTo?: 'header' | 'query';
  accessToken?: string;
  tokenType?: string;
}

export interface Collection {
  id: string;
  name: string;
  description?: string;
  requests: RequestData[];
  variables?: Record<string, string>;
}

export interface Scenario {
  id: string;
  name: string;
  description?: string;
  requests: RequestData[];
}

export interface ResponseData {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  duration: number;
  size: number;
  body: any;
  bodyText: string;
  testResults?: TestResult[];
}

export interface HistoryItem {
  id: string;
  timestamp: string;
  request: RequestData;
  response: ResponseData;
  testScript?: string;
}

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

export interface Environment {
  id: string;
  name: string;
  created: string;
  variables: Record<string, VariableData>;
}

export interface VariableData {
  value: string;
  description: string;
}

export interface AppState {
  collections: Collection[];
  scenarios: Scenario[];
  history: HistoryItem[];
  environments: Environment[];
  currentCollection: string | null;
  currentScenario: string | null;
  currentEnvironment: string | null;
  currentRequest: RequestData | null;
  variables: {
    global: Record<string, VariableData>;
    collection: Record<string, Record<string, VariableData>>;
    environment: Record<string, VariableData>;
  };
  sidebarState?: {
    expandedCollections: Set<string>;
    expandedScenarios: Set<string>;
  };
}

export interface RequestExecution {
  timestamp: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  params: Record<string, string>;
  body: string | Record<string, string> | null;
  auth: AuthConfig;
  folder: string;
  description: string;
  bodyType: string;
  preRequestScript: string;
}

export interface ResponseExecution {
  status: number;
  duration: number;
  size: number;
  timestamp: string;
  headers: Record<string, string>;
  body: any;
  testResults?: TestResult[];
  [key: string]: any;  // 動的なプロパティアクセスをサポート
}

export interface InterceptedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string | Record<string, string> | null;
  timestamp: number;
  status?: number;
  responseHeaders?: Record<string, string>;
  duration?: number;
  error?: string;
}

// Error handling types
export enum ErrorCategory {
  REQUEST = 'REQUEST',
  NETWORK = 'NETWORK',
  SCRIPT = 'SCRIPT',
  STORAGE = 'STORAGE',
  VALIDATION = 'VALIDATION',
  SECURITY = 'SECURITY',
  SYSTEM = 'SYSTEM'
}

export interface ErrorData {
  code: string;
  category: ErrorCategory;
  name: string;
  message: string;
  timestamp: string;
  context?: Record<string, any>;
  stack?: string;
}

export abstract class AppError extends Error {
  abstract readonly code: string;
  abstract readonly category: ErrorCategory;
  readonly timestamp: string;
  readonly context?: Record<string, any>;
  
  constructor(message: string, context?: Record<string, any>) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = new Date().toISOString();
    this.context = context;
  }
  
  toJSON(): ErrorData {
    return {
      code: this.code,
      category: this.category,
      name: this.name,
      message: this.message,
      timestamp: this.timestamp,
      context: this.context,
      stack: this.stack
    };
  }
}

export class RequestError extends AppError {
  readonly code = 'REQUEST_ERROR';
  readonly category = ErrorCategory.REQUEST;
}

export class NetworkError extends AppError {
  readonly code = 'NETWORK_ERROR';
  readonly category = ErrorCategory.NETWORK;
}

export class ScriptError extends AppError {
  readonly code = 'SCRIPT_ERROR';
  readonly category = ErrorCategory.SCRIPT;
}

export class StorageError extends AppError {
  readonly code = 'STORAGE_ERROR';
  readonly category = ErrorCategory.STORAGE;
}

export class ValidationError extends AppError {
  readonly code = 'VALIDATION_ERROR';
  readonly category = ErrorCategory.VALIDATION;
}

export class SecurityError extends AppError {
  readonly code = 'SECURITY_ERROR';
  readonly category = ErrorCategory.SECURITY;
}

// Performance monitoring types
export interface MetricData {
  name: string;
  value: number;
  timestamp: number;
  metadata?: any;
}

export interface MetricsSummary {
  count: number;
  avg: number;
  min: number;
  max: number;
  p95: number;
}

export interface PerformanceTimer {
  id: string;
  startTime: number;
  category: string;
}

// Script execution types
export interface ScriptContext {
  request?: RequestData;
  response?: ResponseData;
  variables?: Record<string, any>;
  environment?: Record<string, any>;
  globals?: Record<string, any>;
}

export interface ScriptResult {
  success: boolean;
  output?: any;
  error?: string;
  logs?: string[];
  duration?: number;
}

// Validation types
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

// Security types
export interface SecurityValidationResult {
  isValid: boolean;
  violations: SecurityViolation[];
}

export interface SecurityViolation {
  type: string;
  message: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  pattern?: string;
}

// Enhanced request execution types
export interface ProcessedRequest extends RequestData {
  processedUrl: string;
  processedHeaders: Record<string, string>;
  processedBody: any;
  executionId: string;
}

export interface RequestResult {
  success: boolean;
  request: ProcessedRequest;
  response?: ResponseData;
  error?: ErrorData;
  duration: number;
  testResults?: TestResult[];
  executionId: string;
}