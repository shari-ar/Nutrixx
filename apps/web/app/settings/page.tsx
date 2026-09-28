import { PageHeader } from '@/components/page-header';

const groups = [
  ['Profile', 'Starting inputs and preferences'],
  ['Local data', 'Device storage, export, and deletion controls'],
  ['Backup', 'Manual backup and restore status'],
  ['Advanced', 'Experimental local processing controls'],
];

export default function SettingsPage() {
  return (
    <div className="py-12 sm:py-16">
      <PageHeader
        description="A future home for transparent control over preferences, local data, backups, and advanced processing."
        eyebrow="Settings"
        title="Your data, your control"
      />
      <div className="mt-10 divide-y divide-separator overflow-hidden rounded-[1.5rem] border border-separator bg-surface/75">
        {groups.map(([title, description]) => (
          <section
            key={title}
            className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6"
          >
            <div>
              <h2 className="font-semibold">{title}</h2>
              <p className="mt-1 text-sm text-muted">{description}</p>
            </div>
            <span className="text-xs font-semibold uppercase tracking-widest text-muted">
              Stage 1+
            </span>
          </section>
        ))}
      </div>
    </div>
  );
}
