module.exports = {
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
  ],
  maxWorkers: 1,
  projects: [
    {
      displayName: 'unit',
      testMatch: ['<rootDir>/tests/unit/**/*.test.ts'],
      testEnvironment: 'jsdom',
      preset: 'ts-jest',
      globals: {
        'ts-jest': {
          tsconfig: 'tsconfig.json'
        }
      },
      testTimeout: 90000
    },
    {
      displayName: 'integration', 
      testMatch: ['<rootDir>/tests/**/*.test.ts', '!<rootDir>/tests/unit/**/*.test.ts'],
      testEnvironment: 'node',
      preset: 'ts-jest',
      setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
      globals: {
        'ts-jest': {
          tsconfig: 'tsconfig.json'
        }
      },
      testTimeout: 90000,
      maxWorkers: 1
    }
  ]
};