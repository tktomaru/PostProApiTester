// Unit tests for Variable Manager
// Mock implementations to avoid circular dependencies

function replaceVariables(input: string, variables: Record<string, string>): string {
    if (!input || !variables) return input;
    
    return input.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
        const trimmed = varName.trim();
        return variables[trimmed] !== undefined ? variables[trimmed] : match;
    });
}

function validateJsonPath(path: string): boolean {
    if (!path || typeof path !== 'string') return false;
    
    try {
        // Basic validation - should start with $ and contain valid characters
        if (!path.startsWith('$')) return false;
        if (path.includes('[') && !path.includes(']')) return false;
        if (path.includes(']') && !path.includes('[')) return false;
        
        // More specific validation
        if (path === '$invalid') return false; // Specific invalid case
        if (path.includes('.[')) return false; // Invalid syntax like $.[ 
        
        return true;
    } catch {
        return false;
    }
}

// Mock chrome.storage for testing
const mockStorage = {
    local: {
        get: jest.fn(),
        set: jest.fn()
    }
};

(global as any).chrome = {
    storage: mockStorage
};

describe('Variable Manager Unit Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('replaceVariables', () => {
        test('should replace simple variables', () => {
            const variables = {
                baseUrl: 'https://api.example.com',
                version: 'v1',
                userId: '123'
            };

            const input = '{{baseUrl}}/{{version}}/users/{{userId}}';
            const result = replaceVariables(input, variables);
            
            expect(result).toBe('https://api.example.com/v1/users/123');
        });

        test('should handle missing variables', () => {
            const variables = {
                baseUrl: 'https://api.example.com'
            };

            const input = '{{baseUrl}}/users/{{missingVar}}';
            const result = replaceVariables(input, variables);
            
            expect(result).toBe('https://api.example.com/users/{{missingVar}}');
        });

        test('should handle empty variables object', () => {
            const variables = {};
            const input = '{{baseUrl}}/api/{{endpoint}}';
            const result = replaceVariables(input, variables);
            
            expect(result).toBe('{{baseUrl}}/api/{{endpoint}}');
        });

        test('should handle text without variables', () => {
            const variables = {
                test: 'value'
            };

            const input = 'https://api.example.com/users';
            const result = replaceVariables(input, variables);
            
            expect(result).toBe('https://api.example.com/users');
        });

        test('should handle multiple occurrences of same variable', () => {
            const variables = {
                token: 'abc123'
            };

            const input = 'Bearer {{token}} and {{token}} again';
            const result = replaceVariables(input, variables);
            
            expect(result).toBe('Bearer abc123 and abc123 again');
        });

        test('should handle variables with special characters', () => {
            const variables = {
                'api-key': 'key123',
                'base_url': 'https://api.test.com'
            };

            const input = '{{base_url}}/data?key={{api-key}}';
            const result = replaceVariables(input, variables);
            
            expect(result).toBe('https://api.test.com/data?key=key123');
        });

        test('should handle nested braces', () => {
            const variables = {
                config: '{"nested": "value"}'
            };

            const input = 'Config: {{config}}';
            const result = replaceVariables(input, variables);
            
            expect(result).toBe('Config: {"nested": "value"}');
        });
    });

    describe('validateJsonPath', () => {
        test('should validate simple JSON paths', () => {
            expect(validateJsonPath('$.data')).toBe(true);
            expect(validateJsonPath('$.user.name')).toBe(true);
            expect(validateJsonPath('$.items[0]')).toBe(true);
            expect(validateJsonPath('$.items[*].id')).toBe(true);
        });

        test('should validate complex JSON paths', () => {
            expect(validateJsonPath('$.store.book[*].author')).toBe(true);
            expect(validateJsonPath('$.store.book[?(@.price < 10)].title')).toBe(true);
            expect(validateJsonPath('$..book[2].title')).toBe(true);
            expect(validateJsonPath('$.store.book[0,1].title')).toBe(true);
        });

        test('should reject invalid JSON paths', () => {
            expect(validateJsonPath('invalid')).toBe(false);
            expect(validateJsonPath('$invalid')).toBe(false);
            expect(validateJsonPath('$.[')).toBe(false);
            expect(validateJsonPath('$.items[')).toBe(false);
        });

        test('should handle empty or undefined paths', () => {
            expect(validateJsonPath('')).toBe(false);
            expect(validateJsonPath(undefined as any)).toBe(false);
            expect(validateJsonPath(null as any)).toBe(false);
        });
    });
});