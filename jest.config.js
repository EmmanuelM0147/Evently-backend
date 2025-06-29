export default {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  
  // Disable all transformations to use native ES modules
  transform: {},
  
  // Module name mapping for relative imports (handles .js extensions in imports)
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  
  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/app.js',
    '!src/config/database.js',
    '!src/**/*.test.js',
    '!src/**/__tests__/**'
  ],
  
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  
  coverageReporters: ['text', 'lcov', 'html'],
  coverageDirectory: 'coverage',
  
  // Test configuration
  testMatch: [
    '<rootDir>/tests/**/*.test.js'
  ],
  
  testTimeout: 30000,
  verbose: true,
  collectCoverage: true,
  
  // Module resolution
  moduleDirectories: ['node_modules', 'src'],
  moduleFileExtensions: ['js', 'json', 'node'],
  
  // Transform ignore patterns for node_modules that need transformation
  transformIgnorePatterns: [
    'node_modules/(?!(supertest|socket\\.io-client)/)'
  ],
  
  // Global teardown and error handling
  globalTeardown: undefined,
  
  // Improved error handling for ES modules
  extensionsToTreatAsEsm: [], // Empty array instead of ['.js'] since package.json has "type": "module"
  
  // Jest environment options for better ES module support
  testEnvironmentOptions: {
    customExportConditions: ['node', 'node-addons']
  }
};