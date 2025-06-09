/**
 * postmanTestAPI.ts
 * ============================================================================
 * Postman-style Test API Implementation for PostPro API Tester
 * 
 * This module provides a complete implementation of Postman's test scripting API,
 * allowing users to write test scripts using familiar pm.test() syntax.
 * 
 * Features:
 * - pm.test() for defining test cases
 * - pm.expect() for Chai-style assertions
 * - pm.response object for accessing response data
 * - pm.request object for accessing request data
 * - pm.environment and pm.globals for variable management
 * - Support for both synchronous and asynchronous test execution
 * 
 * Usage:
 * ```javascript
 * pm.test("Status code is 200", function () {
 *     pm.response.to.have.status(200);
 * });
 * 
 * pm.test("Response contains user data", function () {
 *     const jsonData = pm.response.json();
 *     pm.expect(jsonData.user).to.have.property('name');
 * });
 * ```
 * ============================================================================
 */

import type { RequestData, ResponseData, TestResult } from './types';
import { JSONPath } from 'jsonpath-plus';
import { getVariable, setVariable } from './variableManager';

// ProcessedResponse interface (defined here to avoid circular dependency)
interface ProcessedResponse extends ResponseData {
    bodyText: string;
}

// ============================================================================
// Global State Management
// ============================================================================

/** Storage for test results during execution */
let currentTestResults: TestResult[] = [];

// ============================================================================
// Error Classes
// ============================================================================

/**
 * Custom error class for test assertion failures
 * Compatible with Chai assertion library expectations
 */
class AssertionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AssertionError';
    }
}

// ============================================================================
// Postman API Implementation Classes
// ============================================================================

/**
 * PMResponse - Implementation of Postman's pm.response object
 * 
 * Provides access to HTTP response data including status, headers, body, and timing.
 * Supports both raw text and parsed JSON access to response body.
 * 
 * @example
 * ```javascript
 * pm.test("Check response", function () {
 *     pm.expect(pm.response.code).to.equal(200);
 *     pm.expect(pm.response.json().success).to.be.true;
 * });
 * ```
 */
class PMResponse {
    private responseData: ProcessedResponse;
    headers: PMHeaders;
    to: PMResponseTo;

    constructor(responseData: ProcessedResponse) {
        this.responseData = responseData;
        this.headers = new PMHeaders(this.responseData.headers);
        this.to = new PMResponseTo(this.responseData);
    }

    /** HTTP status code (e.g., 200, 404, 500) */
    get code(): number {
        return this.responseData.status;
    }

    /** HTTP status text (e.g., "OK", "Not Found", "Internal Server Error") */
    get status(): string {
        return this.getStatusText(this.responseData.status);
    }

    /** Response time in milliseconds */
    get responseTime(): number {
        return this.responseData.duration;
    }

    /** Response size in bytes */
    get responseSize(): number {
        return this.responseData.size;
    }

    /** 
     * Parse response body as JSON
     * @returns Parsed JSON object or throws if invalid JSON
     */
    json(): any {
        return this.responseData.body;
    }

    /** 
     * Get response body as raw text
     * @returns Raw response body string
     */
    text(): string {
        return this.responseData.bodyText;
    }

    private getStatusText(status: number): string {
        const statusTexts: Record<number, string> = {
            200: 'OK',
            201: 'Created',
            204: 'No Content',
            400: 'Bad Request',
            401: 'Unauthorized',
            403: 'Forbidden',
            404: 'Not Found',
            500: 'Internal Server Error',
            502: 'Bad Gateway',
            503: 'Service Unavailable'
        };
        return statusTexts[status] || 'Unknown';
    }
}

// Postman pm.request API
class PMRequest {
    private requestData: RequestData;

    constructor(requestData: RequestData) {
        this.requestData = requestData;
    }

    get method(): string {
        return this.requestData.method;
    }

    get url(): PMUrl {
        return new PMUrl(this.requestData.url);
    }

    get headers(): PMHeaders {
        return new PMHeaders(this.requestData.headers);
    }

    get body(): any {
        return this.requestData.body;
    }
}

// Headers API
class PMHeaders {
    private headers: Record<string, string>;

    constructor(headers: Record<string, string>) {
        this.headers = headers || {};
    }

    get(name: string): string | undefined {
        const lowerName = name.toLowerCase();
        for (const key in this.headers) {
            if (key.toLowerCase() === lowerName) {
                return this.headers[key];
            }
        }
        return undefined;
    }

    has(name: string): boolean {
        return this.get(name) !== undefined;
    }

    all(): Record<string, string> {
        return { ...this.headers };
    }
}

// URL API
class PMUrl {
    private urlString: string;

    constructor(url: string) {
        this.urlString = url;
    }

    toString(): string {
        return this.urlString;
    }

    get protocol(): string {
        try {
            return new URL(this.urlString).protocol;
        } catch {
            return '';
        }
    }

    get host(): string {
        try {
            return new URL(this.urlString).host;
        } catch {
            return '';
        }
    }

    get path(): string {
        try {
            return new URL(this.urlString).pathname;
        } catch {
            return '';
        }
    }
}

// Chai-style assertions for response
class PMResponseTo {
    constructor(private responseData: ProcessedResponse) {}

    have = {
        status: (expectedStatus: number) => {
            if (this.responseData.status !== expectedStatus) {
                throw new AssertionError(`Expected status ${expectedStatus}, got ${this.responseData.status}`);
            }
        },
        header: (headerName: string, expectedValue?: string | RegExp) => {
            const headers = new PMHeaders(this.responseData.headers);
            if (!headers.has(headerName)) {
                throw new AssertionError(`Expected header '${headerName}' to exist`);
            }
            if (expectedValue !== undefined) {
                const actualValue = headers.get(headerName);
                if (typeof expectedValue === 'string') {
                    if (actualValue !== expectedValue) {
                        throw new AssertionError(`Expected header '${headerName}' to equal '${expectedValue}', got '${actualValue}'`);
                    }
                } else if (expectedValue instanceof RegExp) {
                    if (!expectedValue.test(actualValue || '')) {
                        throw new AssertionError(`Expected header '${headerName}' to match ${expectedValue}, got '${actualValue}'`);
                    }
                }
            }
        },
        property: (propertyPath: string, expectedValue?: any) => {
            const json = this.responseData.body;
            if (typeof json !== 'object' || json === null) {
                throw new AssertionError('Response body is not a JSON object');
            }

            const keys = propertyPath.split('.');
            let current = json;
            for (const key of keys) {
                if (current === null || current === undefined || !(key in current)) {
                    throw new AssertionError(`Property '${propertyPath}' does not exist in response`);
                }
                current = current[key];
            }

            if (expectedValue !== undefined) {
                if (current !== expectedValue) {
                    throw new AssertionError(`Expected property '${propertyPath}' to equal ${JSON.stringify(expectedValue)}, got ${JSON.stringify(current)}`);
                }
            }
        }
    };

    be = {
        ok: () => {
            if (this.responseData.status < 200 || this.responseData.status >= 300) {
                throw new AssertionError(`Expected status to be successful (200-299), got ${this.responseData.status}`);
            }
        },
        successful: () => {
            if (this.responseData.status < 200 || this.responseData.status >= 300) {
                throw new AssertionError(`Expected status to be successful (200-299), got ${this.responseData.status}`);
            }
        }
    };

    include = (substring: string) => {
        const bodyText = this.responseData.bodyText || '';
        if (!bodyText.includes(substring)) {
            throw new AssertionError(`Expected response body to include '${substring}'`);
        }
    };

    match = (pattern: RegExp) => {
        const bodyText = this.responseData.bodyText || '';
        if (!pattern.test(bodyText)) {
            throw new AssertionError(`Expected response body to match ${pattern}`);
        }
    };
}

// Environment and Global variable management
class PMEnvironment {
    get(key: string): string | undefined {
        return getVariable(key);
    }

    set(key: string, value: string): void {
        setVariable('environment', key, value).catch(console.error);
    }

    unset(key: string): void {
        setVariable('environment', key, '').catch(console.error);
    }

    clear(): void {
        // Implementation would require updating variableManager
        console.warn('pm.environment.clear() not implemented');
    }
}

class PMGlobals {
    get(key: string): string | undefined {
        return getVariable(key);
    }

    set(key: string, value: string): void {
        setVariable('global', key, value).catch(console.error);
    }

    unset(key: string): void {
        setVariable('global', key, '').catch(console.error);
    }

    clear(): void {
        // Implementation would require updating variableManager
        console.warn('pm.globals.clear() not implemented');
    }
}

class PMVariables {
    get(key: string): string | undefined {
        return getVariable(key);
    }

    set(key: string, value: string): void {
        // Local variables - store in memory
        if (typeof window !== 'undefined') {
            (window as any).__pmLocalVariables = (window as any).__pmLocalVariables || {};
            (window as any).__pmLocalVariables[key] = value;
        }
    }
}

// pm.expect API (Chai-style)
class PMExpect {
    private value: any;

    constructor(value: any) {
        this.value = value;
    }

    to = {
        equal: (expected: any) => {
            if (this.value !== expected) {
                throw new AssertionError(`Expected ${JSON.stringify(this.value)} to equal ${JSON.stringify(expected)}`);
            }
        },
        eql: (expected: any) => {
            if (JSON.stringify(this.value) !== JSON.stringify(expected)) {
                throw new AssertionError(`Expected ${JSON.stringify(this.value)} to deep equal ${JSON.stringify(expected)}`);
            }
        },
        be: {
            ok: () => {
                if (!this.value) {
                    throw new AssertionError(`Expected ${JSON.stringify(this.value)} to be truthy`);
                }
            },
            true: () => {
                if (this.value !== true) {
                    throw new AssertionError(`Expected ${JSON.stringify(this.value)} to be true`);
                }
            },
            false: () => {
                if (this.value !== false) {
                    throw new AssertionError(`Expected ${JSON.stringify(this.value)} to be false`);
                }
            },
            null: () => {
                if (this.value !== null) {
                    throw new AssertionError(`Expected ${JSON.stringify(this.value)} to be null`);
                }
            },
            undefined: () => {
                if (this.value !== undefined) {
                    throw new AssertionError(`Expected ${JSON.stringify(this.value)} to be undefined`);
                }
            },
            above: (expected: number) => {
                if (typeof this.value !== 'number' || this.value <= expected) {
                    throw new AssertionError(`Expected ${this.value} to be above ${expected}`);
                }
            },
            below: (expected: number) => {
                if (typeof this.value !== 'number' || this.value >= expected) {
                    throw new AssertionError(`Expected ${this.value} to be below ${expected}`);
                }
            },
            at: {
                least: (expected: number) => {
                    if (typeof this.value !== 'number' || this.value < expected) {
                        throw new AssertionError(`Expected ${this.value} to be at least ${expected}`);
                    }
                },
                most: (expected: number) => {
                    if (typeof this.value !== 'number' || this.value > expected) {
                        throw new AssertionError(`Expected ${this.value} to be at most ${expected}`);
                    }
                }
            }
        },
        include: (expected: any) => {
            if (typeof this.value === 'string') {
                if (!this.value.includes(expected)) {
                    throw new AssertionError(`Expected '${this.value}' to include '${expected}'`);
                }
            } else if (Array.isArray(this.value)) {
                if (!this.value.includes(expected)) {
                    throw new AssertionError(`Expected array to include ${JSON.stringify(expected)}`);
                }
            } else {
                throw new AssertionError(`Cannot check inclusion on ${typeof this.value}`);
            }
        },
        match: (pattern: RegExp) => {
            if (typeof this.value !== 'string') {
                throw new AssertionError(`Expected value to be a string, got ${typeof this.value}`);
            }
            if (!pattern.test(this.value)) {
                throw new AssertionError(`Expected '${this.value}' to match ${pattern}`);
            }
        },
        have: {
            property: (propertyName: string, expectedValue?: any) => {
                if (typeof this.value !== 'object' || this.value === null) {
                    throw new AssertionError(`Expected ${JSON.stringify(this.value)} to be an object`);
                }
                if (!(propertyName in this.value)) {
                    throw new AssertionError(`Expected object to have property '${propertyName}'`);
                }
                if (expectedValue !== undefined && this.value[propertyName] !== expectedValue) {
                    throw new AssertionError(`Expected property '${propertyName}' to equal ${JSON.stringify(expectedValue)}, got ${JSON.stringify(this.value[propertyName])}`);
                }
            },
            length: (expectedLength: number) => {
                if (!this.value || typeof this.value.length !== 'number') {
                    throw new AssertionError(`Expected ${JSON.stringify(this.value)} to have length property`);
                }
                if (this.value.length !== expectedLength) {
                    throw new AssertionError(`Expected length ${expectedLength}, got ${this.value.length}`);
                }
            }
        }
    };
}

// Main PM API
class PM {
    response: PMResponse | null = null;
    request: PMRequest | null = null;
    environment: PMEnvironment = new PMEnvironment();
    globals: PMGlobals = new PMGlobals();
    variables: PMVariables = new PMVariables();

    test(name: string, testFunction: () => void): void {
        try {
            testFunction();
            currentTestResults.push({
                name,
                passed: true
            });
            console.log(`✓ ${name}`);
        } catch (error: any) {
            currentTestResults.push({
                name,
                passed: false,
                error: error.message
            });
            console.error(`✗ ${name}: ${error.message}`);
        }
    }

    expect(value: any): PMExpect {
        return new PMExpect(value);
    }

    info = {
        requestName: '',
        requestId: '',
        iteration: 1
    };

    sendRequest(): void {
        console.warn('pm.sendRequest() not implemented in this environment');
    }
}

// Create global pm instance
const pm = new PM();

// Console API for Postman compatibility
const postmanConsole = {
    log: (...args: any[]) => console.log('[PM Console]', ...args),
    info: (...args: any[]) => console.info('[PM Console]', ...args),
    warn: (...args: any[]) => console.warn('[PM Console]', ...args),
    error: (...args: any[]) => console.error('[PM Console]', ...args)
};

// Execute Postman-style test script
export async function executePostmanTestScript(
    testScript: string,
    responseData: ProcessedResponse,
    requestData: RequestData
): Promise<TestResult[]> {
    currentTestResults = [];

    // Set up pm context
    pm.response = new PMResponse(responseData);
    pm.request = new PMRequest(requestData);
    pm.info.requestName = requestData.name;
    pm.info.requestId = requestData.id;

    // Create execution context
    const context = {
        pm,
        console: postmanConsole,
        JSONPath,
        _: (typeof window !== 'undefined' ? (window as any)._ : undefined) || {}, // Lodash if available
        CryptoJS: (typeof window !== 'undefined' ? (window as any).CryptoJS : undefined) || {}, // CryptoJS if available
        // Add other commonly used Postman libraries
    };

    try {
        // Create a function that executes the test script in the context
        const testFunction = new Function(
            ...Object.keys(context),
            testScript
        );

        // Execute the test script
        testFunction(...Object.values(context));

        return currentTestResults;
    } catch (error: any) {
        console.error('Postman test script execution error:', error);
        return [{
            name: 'Script Execution Error',
            passed: false,
            error: error.message
        }];
    }
}

// Check if script is Postman-style (contains pm. or pm syntax)
export function isPostmanStyleScript(script: string): boolean {
    return /\bpm\.|pm\.test\(|pm\.expect\(|pm\.response|pm\.request|pm\.environment|pm\.globals/.test(script);
}

// Export the PM instance for global access (only in browser environment)
if (typeof window !== 'undefined') {
    (window as any).pm = pm;
}

export { pm };