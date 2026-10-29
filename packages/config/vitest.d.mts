export interface BaseVitestTestConfig {
  allowOnly: boolean;
  clearMocks: boolean;
  globals: boolean;
  passWithNoTests: boolean;
  restoreMocks: boolean;
  unstubEnvs: boolean;
  unstubGlobals: boolean;
}

export interface BaseCoverageThresholds {
  branches: number;
  functions: number;
  lines: number;
  statements: number;
}

export interface BaseCoverageConfig {
  provider: 'v8';
  reporter: string[];
  reportOnFailure: boolean;
  excludeAfterRemap: boolean;
  thresholds: Readonly<BaseCoverageThresholds>;
}

export const baseVitestTestConfig: Readonly<BaseVitestTestConfig>;
export const baseCoverageThresholds: Readonly<BaseCoverageThresholds>;
export const baseCoverageConfig: Readonly<BaseCoverageConfig>;
