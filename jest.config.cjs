/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: '<rootDir>/tsconfig.test.json',
      },
    ],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  clearMocks: true,
  restoreMocks: true,
  collectCoverageFrom: [
    'src/core/**/*.ts',
    'src/values/**/*.ts',
    'src/physics/**/*.ts',
    'src/steering.ts',
    'src/flowField.ts',
    'src/operators/**/*.ts',
    'src/adapters/**/*.ts',
    'src/effects/**/*.ts',
    'src/utils/**/*.ts',
  ],
  // Regression floors, set a few points below the measured baseline (2026-11-22: global 90.2% statements,
  // 81.2% branches, 94.5% functions, 93.7% lines; src/core 92.5 / 84.6 / 91.5 / 95.7). They exist to stop
  // coverage from silently eroding, not as targets: raise them deliberately when coverage improves.
  // Jest excludes files matched by a path threshold from the global figure.
  coverageThreshold: {
    global: { statements: 88, branches: 78, functions: 92, lines: 91 },
    './src/core/': { statements: 90, branches: 82, functions: 88, lines: 93 },
  },
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
};
