export type WorkspaceGroup =
  | 'acceptance'
  | 'agentCuration'
  | 'allPackages'
  | 'dataQuality'
  | 'persistenceContract'
  | 'referenceCandidate'
  | 'referencePublish'
  | 'testBuild'
  | 'testPackages';

export const workspaceGroups: Readonly<
  Record<WorkspaceGroup, readonly string[]>
>;
