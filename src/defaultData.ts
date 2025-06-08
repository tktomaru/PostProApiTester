// defaultData.ts - Sample data for the application
import type { Collection, Scenario, Environment, VariableData } from './types';

export const sampleCollections: Collection[] = [
    {
        id: 'sample_collection_1',
        name: 'Sample API Collection',
        requests: [
            {
                id: 'sample_request_1',
                name: 'Get Users',
                method: 'GET',
                url: 'https://jsonplaceholder.typicode.com/users',
                headers: {},
                params: {},
                body: null,
                bodyType: "none",
                auth: { type: 'none' },
                preRequestScript: ""
            }
        ]
    }
];

export const sampleScenarios: Scenario[] = [
    {
        id: 'sample_scenario_1',
        name: 'Sample API Test Scenario',
        requests: []
    }
];

export const sampleGlobalVariables: Record<string, VariableData> = {
    'api_base_url': {
        value: 'https://jsonplaceholder.typicode.com',
        description: 'Base URL for API requests'
    }
};

export const sampleEnvironments: Environment[] = [
    {
        id: 'env_dev',
        name: 'Development',
        variables: {
            'api_url': {
                value: 'https://dev-api.example.com',
                description: 'Development API URL'
            }
        }
    },
    {
        id: 'env_prod',
        name: 'Production',
        variables: {
            'api_url': {
                value: 'https://api.example.com',
                description: 'Production API URL'
            }
        }
    }
];

export const sampleEnvironmentVariables: Record<string, Record<string, VariableData>> = {
    'env_dev': {
        'api_url': {
            value: 'https://dev-api.example.com',
            description: 'Development API URL'
        }
    },
    'env_prod': {
        'api_url': {
            value: 'https://api.example.com',
            description: 'Production API URL'
        }
    }
};

export const sampleCollectionVariables: Record<string, Record<string, VariableData>> = {
    'sample_collection_1': {
        'collection_var': {
            value: 'sample_value',
            description: 'Sample collection variable'
        }
    }
};

export const sampleTestScript: string = 'status 200\njsonHasProperty users';