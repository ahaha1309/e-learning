module.exports = {
  testEnvironment: 'node',
  clearMocks: true,
  restoreMocks: true,
  testMatch: ['**/tests/**/*.test.js'],
  verbose: true,
  forceExit: true,
  detectOpenHandles: true,
  coveragePathIgnorePatterns: [
    '/node_modules/'
  ]
};
