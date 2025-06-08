// Common types for the API Tester application

export interface RequestData {
  id: string;
  name: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  params: Record<string, string>;
  body: string | Record<string, string> | null;
  bodyType: string;
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
}

export interface HistoryItem {
  id: string;
  timestamp: string;
  request: RequestData;
  response: ResponseData;
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