// Unit tests for Postman API implementation
import { executePostmanTestScript, isPostmanStyleScript } from '../../src/postmanTestAPI';
import type { RequestData, TestResult } from '../../src/types';

// Mock variable manager
jest.mock('../../src/variableManager', () => ({
    getVariable: jest.fn((key: string) => `mock-${key}`),
    setVariable: jest.fn(() => Promise.resolve())
}));

// Mock JSONPath
jest.mock('jsonpath-plus', () => ({
    JSONPath: {
        query: jest.fn()
    }
}));

// Mock ProcessedResponse interface
interface ProcessedResponse {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    duration: number;
    size: number;
    body: any;
    bodyText: string;
    testResults?: TestResult[];
}

describe('Postman API Tests', () => {
    const mockRequestData: RequestData = {
        id: 'test-request-1',
        name: 'Test Request',
        method: 'GET',
        url: 'https://example.com/api/test',
        headers: { 'Content-Type': 'application/json' },
        params: { page: '1' },
        body: null,
        bodyType: 'none',
        auth: { type: 'none' },
        preRequestScript: '',
        testScript: ''
    };

    const mockResponseData: ProcessedResponse = {
        status: 200,
        statusText: 'OK',
        headers: {
            'content-type': 'application/json',
            'x-custom-header': 'test-value'
        },
        duration: 150,
        size: 1024,
        body: {
            success: true,
            data: {
                id: 123,
                name: 'Test User',
                items: ['item1', 'item2', 'item3']
            }
        },
        bodyText: '{"success":true,"data":{"id":123,"name":"Test User","items":["item1","item2","item3"]}}'
    };

    beforeEach(() => {
        // Clear global pm state
        (global as any).pm = undefined;
    });

    describe('isPostmanStyleScript', () => {
        test('should detect Postman-style scripts', () => {
            expect(isPostmanStyleScript('pm.test("test", function() {});')).toBe(true);
            expect(isPostmanStyleScript('pm.expect(123).to.equal(123);')).toBe(true);
            expect(isPostmanStyleScript('pm.response.to.have.status(200);')).toBe(true);
            expect(isPostmanStyleScript('pm.environment.set("key", "value");')).toBe(true);
            expect(isPostmanStyleScript('console.log(pm.request.url);')).toBe(true);
        });

        test('should not detect non-Postman scripts', () => {
            expect(isPostmanStyleScript('status 200')).toBe(false);
            expect(isPostmanStyleScript('bodyContains "success"')).toBe(false);
            expect(isPostmanStyleScript('console.log("test");')).toBe(false);
            expect(isPostmanStyleScript('// just a comment')).toBe(false);
        });
    });

    describe('executePostmanTestScript', () => {
        test('should execute simple status check test', async () => {
            const testScript = `
                pm.test("Status code is 200", function () {
                    pm.response.to.have.status(200);
                });
            `;

            const results = await executePostmanTestScript(testScript, mockResponseData, mockRequestData);
            
            expect(results).toHaveLength(1);
            expect(results[0].name).toBe('Status code is 200');
            expect(results[0].passed).toBe(true);
            expect(results[0].error).toBeUndefined();
        });

        test('should handle failing status check test', async () => {
            const testScript = `
                pm.test("Status code is 404", function () {
                    pm.response.to.have.status(404);
                });
            `;

            const results = await executePostmanTestScript(testScript, mockResponseData, mockRequestData);
            
            expect(results).toHaveLength(1);
            expect(results[0].name).toBe('Status code is 404');
            expect(results[0].passed).toBe(false);
            expect(results[0].error).toContain('Expected status 404, got 200');
        });

        test('should execute multiple tests', async () => {
            const testScript = `
                pm.test("Status code is 200", function () {
                    pm.response.to.have.status(200);
                });

                pm.test("Response has correct content type", function () {
                    pm.response.to.have.header("content-type", "application/json");
                });

                pm.test("Response body contains success", function () {
                    const json = pm.response.json();
                    pm.expect(json.success).to.be.true;
                });
            `;

            const results = await executePostmanTestScript(testScript, mockResponseData, mockRequestData);
            
            expect(results).toHaveLength(3);
            expect(results.every(r => r.passed)).toBe(true);
        });

        test('should test JSON response properties', async () => {
            const testScript = `
                pm.test("Response data validation", function () {
                    const json = pm.response.json();
                    pm.expect(json.data.id).to.equal(123);
                    pm.expect(json.data.name).to.equal("Test User");
                    pm.expect(json.data.items).to.have.length(3);
                    pm.expect(json.data.items).to.include("item2");
                });
            `;

            const results = await executePostmanTestScript(testScript, mockResponseData, mockRequestData);
            
            expect(results).toHaveLength(1);
            expect(results[0].passed).toBe(true);
        });

        test('should test request properties', async () => {
            const testScript = `
                pm.test("Request validation", function () {
                    pm.expect(pm.request.method).to.equal("GET");
                    pm.expect(pm.request.url.toString()).to.include("example.com");
                    pm.expect(pm.request.headers.get("content-type")).to.equal("application/json");
                });
            `;

            const results = await executePostmanTestScript(testScript, mockResponseData, mockRequestData);
            
            expect(results).toHaveLength(1);
            expect(results[0].passed).toBe(true);
        });

        test('should handle response headers', async () => {
            const testScript = `
                pm.test("Header tests", function () {
                    pm.response.to.have.header("content-type");
                    pm.response.to.have.header("x-custom-header", "test-value");
                    pm.response.to.have.header("content-type", /json/);
                });
            `;

            const results = await executePostmanTestScript(testScript, mockResponseData, mockRequestData);
            
            expect(results).toHaveLength(1);
            expect(results[0].passed).toBe(true);
        });

        test('should test response time and size', async () => {
            const testScript = `
                pm.test("Performance tests", function () {
                    pm.expect(pm.response.responseTime).to.be.below(1000);
                    pm.expect(pm.response.responseSize).to.be.above(100);
                    pm.expect(pm.response.code).to.equal(200);
                });
            `;

            const results = await executePostmanTestScript(testScript, mockResponseData, mockRequestData);
            
            expect(results).toHaveLength(1);
            expect(results[0].passed).toBe(true);
        });

        test('should handle environment variables', async () => {
            const testScript = `
                pm.test("Environment variable tests", function () {
                    pm.environment.set("testKey", "testValue");
                    pm.globals.set("globalKey", "globalValue");
                    
                    const envValue = pm.environment.get("testKey");
                    const globalValue = pm.globals.get("globalKey");
                    
                    pm.expect(envValue).to.equal("mock-testKey");
                    pm.expect(globalValue).to.equal("mock-globalKey");
                });
            `;

            const results = await executePostmanTestScript(testScript, mockResponseData, mockRequestData);
            
            expect(results).toHaveLength(1);
            expect(results[0].passed).toBe(true);
        });

        test('should handle script execution errors', async () => {
            const testScript = `
                pm.test("Error test", function () {
                    throw new Error("Test error");
                });
            `;

            const results = await executePostmanTestScript(testScript, mockResponseData, mockRequestData);
            
            expect(results).toHaveLength(1);
            expect(results[0].passed).toBe(false);
            expect(results[0].error).toBe('Test error');
        });

        test('should handle syntax errors', async () => {
            const testScript = `
                pm.test("Syntax error test", function () {
                    invalid javascript syntax here
                });
            `;

            const results = await executePostmanTestScript(testScript, mockResponseData, mockRequestData);
            
            expect(results).toHaveLength(1);
            expect(results[0].name).toBe('Script Execution Error');
            expect(results[0].passed).toBe(false);
            expect(results[0].error).toContain('Unexpected');
        });

        test('should test array and object operations', async () => {
            const testScript = `
                pm.test("Array and object tests", function () {
                    const json = pm.response.json();
                    
                    pm.expect(json).to.have.property("data");
                    pm.expect(json.data).to.have.property("items");
                    pm.expect(json.data.items).to.be.an("array");
                    pm.expect(json.data.items).to.have.length(3);
                    pm.expect(json.data.items[0]).to.equal("item1");
                });
            `;

            const results = await executePostmanTestScript(testScript, mockResponseData, mockRequestData);
            
            expect(results).toHaveLength(1);
            expect(results[0].passed).toBe(true);
        });

        test('should test response text operations', async () => {
            const testScript = `
                pm.test("Response text tests", function () {
                    pm.response.to.include("success");
                    pm.response.to.include("Test User");
                    pm.response.to.match(/\\{"success":true/);
                    
                    const text = pm.response.text();
                    pm.expect(text).to.include("items");
                });
            `;

            const results = await executePostmanTestScript(testScript, mockResponseData, mockRequestData);
            
            expect(results).toHaveLength(1);
            expect(results[0].passed).toBe(true);
        });
    });
});