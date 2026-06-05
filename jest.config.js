module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: ['src/**/*.js'],
  coverageDirectory: 'coverage',
  verbose: true,
  testTimeout: 60000,
  // Skip tests that require browser (timeout issues)
  testPathIgnorePatterns: ['/node_modules/'],
};
