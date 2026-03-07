// Jest Configuration — T07 (Deployment & Monitoring Team)
// Uses .cjs for CJS compat with Jest 29 in "type":"module" projects

module.exports = {
  transform: {},
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/', '/T05_REWARD_SYSTEM/'],
  collectCoverageFrom: ['src/**/*.js', 'shared/**/*.js', '!**/node_modules/**'],
  coverageThreshold: { global: { branches: 50, functions: 50, lines: 50, statements: 50 } },
  testEnvironment: 'node',
  passWithNoTests: true,
};
