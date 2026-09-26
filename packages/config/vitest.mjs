export const baseVitestTestConfig = Object.freeze({
  allowOnly: false,
  clearMocks: true,
  globals: false,
  passWithNoTests: false,
  restoreMocks: true,
  unstubEnvs: true,
  unstubGlobals: true,
});

export const baseCoverageThresholds = Object.freeze({
  branches: 80,
  functions: 80,
  lines: 80,
  statements: 80,
});
