import { notFound } from 'next/navigation';

import { Stage4AcceptanceWorkspace } from '@/components/stage-4-acceptance-workspace';

export default function Stage4AcceptancePage() {
  if (process.env['NEXT_PUBLIC_STAGE4_ACCEPTANCE_ENABLED'] !== 'true')
    notFound();
  return <Stage4AcceptanceWorkspace />;
}
