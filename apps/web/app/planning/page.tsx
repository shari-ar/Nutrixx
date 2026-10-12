import { PageHeader } from '@/components/page-header';
import { PlanningWorkspace } from '@/components/planning-workspace';

export default function PlanningPage() {
  return (
    <div className="py-12 sm:py-16">
      <PageHeader
        eyebrow="Local day planning"
        title="Your food plan"
        description="Create and review a one-day proposal using food data stored in this browser."
      />
      <div className="mt-10">
        <PlanningWorkspace />
      </div>
    </div>
  );
}
