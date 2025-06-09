module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testTimeout: 90000,
  maxWorkers: 1, // Run tests sequentially to avoid conflicts
  testSequencer: '<rootDir>/tests/testSequencer.js',
  projects: [
    {
      displayName: 'unit',
      testMatch: ['<rootDir>/tests/unit/**/*.test.ts'],
      testEnvironment: 'jsdom',
      preset: 'ts-jest'
    },
    {
      displayName: 'integration',
      testMatch: ['<rootDir>/tests/**/*.test.ts', '!<rootDir>/tests/unit/**/*.test.ts'],
      testEnvironment: 'node',
      preset: 'ts-jest',
      setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
      testTimeout: 90000,
      maxWorkers: 1,
      testSequencer: '<rootDir>/tests/testSequencer.js'
    }
  ]
};