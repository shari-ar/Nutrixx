import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const gitIsAvailable =
  spawnSync('git', ['--version'], { stdio: 'ignore' }).status === 0;

const hooksAreNotApplicable =
  process.env.CI === 'true' ||
  process.env.NODE_ENV === 'production' ||
  !existsSync('.git') ||
  !gitIsAvailable;

if (!hooksAreNotApplicable) {
  const { default: husky } = await import('husky');
  const error = husky();

  if (error) {
    throw new Error(error);
  }
}
