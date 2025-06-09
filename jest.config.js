module.exports = {
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
  ],
  maxWorkers: 1,
  testTimeout: 90000,
  projects: [
    {
      displayName: 'unit',
      testMatch: ['<rootDir>/tests/unit/**/*.test.ts'],
      testEnvironment: 'jsdom',
      preset: 'ts-jest',
      testTimeout: 90000
    },
    {
      displayName: 'integration', 
      testMatch: ['<rootDir>/tests/**/*.test.ts', '!<rootDir>/tests/unit/**/*.test.ts'],
      testEnvironment: 'node',
      preset: 'ts-jest',
      setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
      testTimeout: 90000,
      maxWorkers: 1
    }
  ]
};