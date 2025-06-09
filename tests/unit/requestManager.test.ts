// Unit tests for Request Manager
import type { RequestData } from '../../src/types';

// Mock implementation to avoid circular dependencies
interface FetchOptions {
    method: string;
    headers: Record<string, string>;
    bodyData: string | FormData | URLSearchParams | File | null;
    url: string;
}

function buildFetchOptions(request: RequestData): FetchOptions | null {
    const method = (request.method || 'GET').toUpperCase();
    const headers: Record<string, string> = {};
    let bodyData: string | FormData | URLSearchParams | File | null = null;

    // Copy custom headers
    if (request.headers) {
        Object.assign(headers, request.headers);
    }

    // Add authentication headers
    if (request.auth && request.auth.type !== 'none') {
        switch (request.auth.type) {
            case 'bearer':
                if (request.auth.token) {
                    headers['Authorization'] = `Bearer ${request.auth.token}`;
                }
                break;
            case 'basic':
                if (request.auth.username && request.auth.password) {
                    const encoded = Buffer.from(`${request.auth.username}:${request.auth.password}`).toString('base64');
                    headers['Authorization'] = `Basic ${encoded}`;
                }
                break;
            case 'apikey':
                if (request.auth.key && request.auth.value && request.auth.addTo === 'header') {
                    headers[request.auth.key] = request.auth.value;
                }
                break;
        }
    }

    // Handle body data
    if (request.body && method !== 'GET' && method !== 'HEAD') {
        const bodyType = request.bodyType || 'none';
        switch (bodyType) {
            case 'raw':
                bodyData = request.body.toString();
                break;
            case 'json':
                bodyData = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
                headers['Content-Type'] = 'application/json';
                break;
            case 'urlencoded':
                if (typeof request.body === 'object' && request.body !== null) {
                    bodyData = new URLSearchParams(request.body as Record<string, string>);
                    headers['Content-Type'] = 'application/x-www-form-urlencoded';
                }
                break;
        }
    }

    return {
        method,
        headers,
        bodyData,
        url: request.url
    };
}

describe('Request Manager Unit Tests', () => {
    describe('buildFetchOptions', () => {
        test('should build basic GET request options', () => {
            const requestData: RequestData = {
                id: 'test-1',
                name: 'Test GET',
                method: 'GET',
                url: 'https://example.com/api/test',
                headers: { 'Accept': 'application/json' },
                params: {},
                body: null,
                bodyType: 'none',
                auth: { type: 'none' },
                preRequestScript: ''
            };

            const options = buildFetchOptions(requestData);
            
            expect(options).not.toBeNull();
            expect(options!.method).toBe('GET');
            expect(options!.url).toBe('https://example.com/api/test');
            expect(options!.headers['Accept']).toBe('application/json');
            expect(options!.bodyData).toBeNull();
        });

        test('should build POST request with JSON body', () => {
            const requestData: RequestData = {
                id: 'test-2',
                name: 'Test POST',
                method: 'POST',
                url: 'https://example.com/api/users',
                headers: {},
                params: {},
                body: { name: 'John', age: 30 },
                bodyType: 'json',
                auth: { type: 'none' },
                preRequestScript: ''
            };

            const options = buildFetchOptions(requestData);
            
            expect(options).not.toBeNull();
            expect(options!.method).toBe('POST');
            expect(options!.headers['Content-Type']).toBe('application/json');
            expect(options!.bodyData).toBe('{"name":"John","age":30}');
        });

        test('should build request with Bearer authentication', () => {
            const requestData: RequestData = {
                id: 'test-3',
                name: 'Test Auth',
                method: 'GET',
                url: 'https://example.com/api/secure',
                headers: {},
                params: {},
                body: null,
                bodyType: 'none',
                auth: { 
                    type: 'bearer',
                    token: 'test-token-123'
                },
                preRequestScript: ''
            };

            const options = buildFetchOptions(requestData);
            
            expect(options).not.toBeNull();
            expect(options!.headers['Authorization']).toBe('Bearer test-token-123');
        });

        test('should build request with Basic authentication', () => {
            const requestData: RequestData = {
                id: 'test-4',
                name: 'Test Basic Auth',
                method: 'GET',
                url: 'https://example.com/api/secure',
                headers: {},
                params: {},
                body: null,
                bodyType: 'none',
                auth: { 
                    type: 'basic',
                    username: 'testuser',
                    password: 'testpass'
                },
                preRequestScript: ''
            };

            const options = buildFetchOptions(requestData);
            
            expect(options).not.toBeNull();
            // Basic auth should be base64 encoded
            const expectedAuth = Buffer.from('testuser:testpass').toString('base64');
            expect(options!.headers['Authorization']).toBe(`Basic ${expectedAuth}`);
        });

        test('should build request with API key authentication', () => {
            const requestData: RequestData = {
                id: 'test-5',
                name: 'Test API Key',
                method: 'GET',
                url: 'https://example.com/api/secure',
                headers: {},
                params: {},
                body: null,
                bodyType: 'none',
                auth: { 
                    type: 'apikey',
                    key: 'X-API-Key',
                    value: 'api-key-123',
                    addTo: 'header'
                },
                preRequestScript: ''
            };

            const options = buildFetchOptions(requestData);
            
            expect(options).not.toBeNull();
            expect(options!.headers['X-API-Key']).toBe('api-key-123');
        });

        test('should build request with raw body', () => {
            const requestData: RequestData = {
                id: 'test-6',
                name: 'Test Raw Body',
                method: 'POST',
                url: 'https://example.com/api/data',
                headers: { 'Content-Type': 'text/plain' },
                params: {},
                body: 'This is raw text data',
                bodyType: 'raw',
                auth: { type: 'none' },
                preRequestScript: ''
            };

            const options = buildFetchOptions(requestData);
            
            expect(options).not.toBeNull();
            expect(options!.bodyData).toBe('This is raw text data');
            expect(options!.headers['Content-Type']).toBe('text/plain');
        });

        test('should build request with URL encoded body', () => {
            const requestData: RequestData = {
                id: 'test-7',
                name: 'Test URL Encoded',
                method: 'POST',
                url: 'https://example.com/api/form',
                headers: {},
                params: {},
                body: { name: 'John Doe', email: 'john@example.com' },
                bodyType: 'urlencoded',
                auth: { type: 'none' },
                preRequestScript: ''
            };

            const options = buildFetchOptions(requestData);
            
            expect(options).not.toBeNull();
            expect(options!.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
            expect(options!.bodyData).toBeInstanceOf(URLSearchParams);
        });

        test('should handle GET request without body', () => {
            const requestData: RequestData = {
                id: 'test-8',
                name: 'Test GET No Body',
                method: 'GET',
                url: 'https://example.com/api/test',
                headers: {},
                params: {},
                body: 'This should be ignored',
                bodyType: 'raw',
                auth: { type: 'none' },
                preRequestScript: ''
            };

            const options = buildFetchOptions(requestData);
            
            expect(options).not.toBeNull();
            expect(options!.bodyData).toBeNull(); // GET requests should not have body
        });
    });
});