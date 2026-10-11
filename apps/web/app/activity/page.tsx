import { PageHeader } from '@/components/page-header';

import { ActivityLevelPanel } from './activity-level-panel';

export default function ActivityPage() {
  return (
    <div className="py-12 sm:py-16">
      <PageHeader
        description="Set your usual activity category to see a source-attributed estimate of daily weight-maintenance energy. Daily activity and sleep logging will arrive in a later stage."
        eyebrow="Activity and energy"
        title="Your activity context"
      />
      <div className="mt-10">
        <ActivityLevelPanel />
      </div>
    </div>
  );
}
