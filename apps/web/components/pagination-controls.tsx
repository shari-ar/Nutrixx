export interface PaginationControlsProps {
  readonly label: string;
  readonly pageIndex: number;
  readonly pageSize: number;
  readonly total: number;
  readonly onPageChange: (pageIndex: number) => void;
}

/** Keeps large result sets bounded to one rendered page. */
export function PaginationControls({
  label,
  pageIndex,
  pageSize,
  total,
  onPageChange,
}: PaginationControlsProps) {
  const pageCount = Math.ceil(total / pageSize);
  if (pageCount <= 1) return null;
  const first = pageIndex * pageSize + 1;
  const last = Math.min(total, first + pageSize - 1);
  return (
    <nav
      aria-label={`${label} pagination`}
      className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"
    >
      <p aria-live="polite" className="text-muted">
        {first.toLocaleString('en-US')}–{last.toLocaleString('en-US')} of{' '}
        {total.toLocaleString('en-US')} · Page {pageIndex + 1} of {pageCount}
      </p>
      <div className="flex gap-2">
        <button
          className="rounded-xl border border-separator px-4 py-2 disabled:opacity-50"
          disabled={pageIndex === 0}
          onClick={() => onPageChange(pageIndex - 1)}
          type="button"
        >
          Previous
        </button>
        <button
          className="rounded-xl border border-separator px-4 py-2 disabled:opacity-50"
          disabled={pageIndex + 1 >= pageCount}
          onClick={() => onPageChange(pageIndex + 1)}
          type="button"
        >
          Next
        </button>
      </div>
    </nav>
  );
}
