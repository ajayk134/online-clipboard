/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  forceExit: true,
  maxWorkers: 1,
  testTimeout: 30000,
  verbose: true,
};
