import { spawnSync } from 'node:child_process';

import { workspaceGroups } from '@nutrixx/config/workspaces';

const [groupName, scriptName] = process.argv.slice(2);
if (!groupName || !scriptName || !Object.hasOwn(workspaceGroups, groupName)) {
  throw new TypeError(
    `Usage: node scripts/run-workspace-group.mjs <${Object.keys(workspaceGroups).join('|')}> <script>`,
  );
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const workspaces = workspaceGroups[groupName];
for (const workspace of workspaces) {
  const result = spawnSync(
    npm,
    ['run', scriptName, `--workspace=@nutrixx/${workspace}`],
    { stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
