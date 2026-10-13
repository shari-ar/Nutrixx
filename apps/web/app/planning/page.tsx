import { PageHeader } from '@/components/page-header';
import { PlanningWorkspace } from '@/components/planning-workspace';

export default function PlanningPage() {
  return (
    <div className="py-12 sm:py-16">
      <PageHeader
        eyebrow="Local next-meal planning"
        title="Your next meal"
        description="Review a complete local ranking for your next eating occasion, choose a food, and record what you actually ate."
      />
      <div className="mt-10">
        <PlanningWorkspace />
      </div>
    </div>
  );
}
