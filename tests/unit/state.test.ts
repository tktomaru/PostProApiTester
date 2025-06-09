// Unit tests for State management
import type { AppState, Collection, RequestData } from '../../src/types';

describe('State Management Unit Tests', () => {
    let mockState: AppState;

    beforeEach(() => {
        // Reset mock state before each test
        mockState = {
            collections: [],
            scenarios: [],
            history: [],
            environments: [],
            currentCollection: null,
            currentScenario: null,
            currentEnvironment: null,
            currentRequest: null,
            variables: {
                global: {},
                collection: {},
                environment: {}
            },
            sidebarState: {
                expandedCollections: new Set(),
                expandedScenarios: new Set()
            }
        };
    });

    describe('Collection Management', () => {
        test('should add new collection to state', () => {
            const newCollection: Collection = {
                id: 'col-1',
                name: 'Test Collection',
                description: 'A test collection',
                requests: []
            };

            mockState.collections.push(newCollection);
            
            expect(mockState.collections).toHaveLength(1);
            expect(mockState.collections[0].id).toBe('col-1');
            expect(mockState.collections[0].name).toBe('Test Collection');
        });

        test('should find collection by id', () => {
            const collection1: Collection = {
                id: 'col-1',
                name: 'Collection 1',
                requests: []
            };
            const collection2: Collection = {
                id: 'col-2',
                name: 'Collection 2',
                requests: []
            };

            mockState.collections = [collection1, collection2];
            
            const found = mockState.collections.find(c => c.id === 'col-2');
            expect(found).toBeDefined();
            expect(found?.name).toBe('Collection 2');
        });

        test('should remove collection from state', () => {
            const collection1: Collection = {
                id: 'col-1',
                name: 'Collection 1',
                requests: []
            };
            const collection2: Collection = {
                id: 'col-2',
                name: 'Collection 2',
                requests: []
            };

            mockState.collections = [collection1, collection2];
            
            mockState.collections = mockState.collections.filter(c => c.id !== 'col-1');
            
            expect(mockState.collections).toHaveLength(1);
            expect(mockState.collections[0].id).toBe('col-2');
        });
    });

    describe('Request Management', () => {
        test('should add request to collection', () => {
            const collection: Collection = {
                id: 'col-1',
                name: 'Test Collection',
                requests: []
            };

            const request: RequestData = {
                id: 'req-1',
                name: 'Test Request',
                method: 'GET',
                url: 'https://api.example.com/test',
                headers: {},
                params: {},
                body: null,
                bodyType: 'none',
                auth: { type: 'none' },
                preRequestScript: ''
            };

            collection.requests.push(request);
            mockState.collections = [collection];
            
            expect(collection.requests).toHaveLength(1);
            expect(collection.requests[0].name).toBe('Test Request');
        });

        test('should set current request', () => {
            const request: RequestData = {
                id: 'req-1',
                name: 'Current Request',
                method: 'POST',
                url: 'https://api.example.com/users',
                headers: { 'Content-Type': 'application/json' },
                params: {},
                body: { name: 'John' },
                bodyType: 'json',
                auth: { type: 'none' },
                preRequestScript: ''
            };

            mockState.currentRequest = request;
            
            expect(mockState.currentRequest).toBeDefined();
            expect(mockState.currentRequest?.method).toBe('POST');
            expect(mockState.currentRequest?.name).toBe('Current Request');
        });
    });

    describe('Variable Management', () => {
        test('should manage global variables', () => {
            mockState.variables.global = {
                'baseUrl': { value: 'https://api.example.com', description: 'Base API URL' },
                'apiKey': { value: 'test-key-123', description: 'API authentication key' }
            };
            
            expect(Object.keys(mockState.variables.global)).toHaveLength(2);
            expect(mockState.variables.global['baseUrl'].value).toBe('https://api.example.com');
        });

        test('should manage environment variables', () => {
            mockState.variables.environment = {
                'token': { value: 'env-token-456', description: 'Environment specific token' }
            };
            
            expect(mockState.variables.environment['token'].value).toBe('env-token-456');
        });

        test('should manage collection variables', () => {
            mockState.variables.collection = {
                'col-1': {
                    'collectionVar': { value: 'collection-specific-value', description: 'Collection variable' }
                }
            };
            
            expect(mockState.variables.collection['col-1']['collectionVar'].value)
                .toBe('collection-specific-value');
        });
    });

    describe('Current State Management', () => {
        test('should set current collection', () => {
            mockState.currentCollection = 'col-1';
            
            expect(mockState.currentCollection).toBe('col-1');
        });

        test('should set current environment', () => {
            mockState.currentEnvironment = 'env-dev';
            
            expect(mockState.currentEnvironment).toBe('env-dev');
        });

        test('should set current scenario', () => {
            mockState.currentScenario = 'scenario-1';
            
            expect(mockState.currentScenario).toBe('scenario-1');
        });

        test('should clear current states', () => {
            mockState.currentCollection = 'col-1';
            mockState.currentEnvironment = 'env-dev';
            mockState.currentScenario = 'scenario-1';
            
            // Clear states
            mockState.currentCollection = null;
            mockState.currentEnvironment = null;
            mockState.currentScenario = null;
            
            expect(mockState.currentCollection).toBeNull();
            expect(mockState.currentEnvironment).toBeNull();
            expect(mockState.currentScenario).toBeNull();
        });
    });

    describe('Sidebar State Management', () => {
        test('should manage expanded collections', () => {
            mockState.sidebarState?.expandedCollections.add('col-1');
            mockState.sidebarState?.expandedCollections.add('col-2');
            
            expect(mockState.sidebarState?.expandedCollections.has('col-1')).toBe(true);
            expect(mockState.sidebarState?.expandedCollections.has('col-2')).toBe(true);
            expect(mockState.sidebarState?.expandedCollections.has('col-3')).toBe(false);
        });

        test('should toggle expanded state', () => {
            const collectionId = 'col-1';
            
            // Add to expanded
            mockState.sidebarState?.expandedCollections.add(collectionId);
            expect(mockState.sidebarState?.expandedCollections.has(collectionId)).toBe(true);
            
            // Remove from expanded
            mockState.sidebarState?.expandedCollections.delete(collectionId);
            expect(mockState.sidebarState?.expandedCollections.has(collectionId)).toBe(false);
        });
    });

    describe('History Management', () => {
        test('should add items to history', () => {
            const historyItem = {
                id: 'hist-1',
                timestamp: new Date().toISOString(),
                request: {
                    id: 'req-1',
                    name: 'Test Request',
                    method: 'GET',
                    url: 'https://api.example.com/test',
                    headers: {},
                    params: {},
                    body: null,
                    bodyType: 'none' as const,
                    auth: { type: 'none' as const },
                    preRequestScript: ''
                },
                response: {
                    status: 200,
                    statusText: 'OK',
                    headers: { 'content-type': 'application/json' },
                    duration: 150,
                    size: 1024,
                    body: { success: true },
                    bodyText: '{"success":true}'
                }
            };

            mockState.history.push(historyItem);
            
            expect(mockState.history).toHaveLength(1);
            expect(mockState.history[0].request.method).toBe('GET');
            expect(mockState.history[0].response.status).toBe(200);
        });

        test('should limit history size', () => {
            const maxHistorySize = 100;
            
            // Add more than max items
            for (let i = 0; i < 150; i++) {
                mockState.history.push({
                    id: `hist-${i}`,
                    timestamp: new Date().toISOString(),
                    request: {} as RequestData,
                    response: {} as any
                });
            }
            
            // Simulate trimming to max size
            if (mockState.history.length > maxHistorySize) {
                mockState.history = mockState.history.slice(-maxHistorySize);
            }
            
            expect(mockState.history).toHaveLength(maxHistorySize);
            expect(mockState.history[0].id).toBe('hist-50'); // Should keep latest 100
        });
    });
});