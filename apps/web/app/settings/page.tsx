import { PageHeader } from '@/components/page-header';

import { StorageStatusPanel } from './storage-status-panel';

export default function SettingsPage() {
  return (
    <div className="py-12 sm:py-16">
      <PageHeader
        description="See where your Free data lives, reduce eviction risk, create a recovery copy, or explicitly clear this browser profile."
        eyebrow="Settings · Storage"
        title="Storage and recovery"
      />
      <StorageStatusPanel />
    </div>
  );
}
