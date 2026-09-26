'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-accent">
        Nutrixx
      </p>
      <h2 className="mt-3 text-3xl font-semibold">Something went wrong</h2>
      <p className="mt-3 text-muted">The page could not be loaded.</p>
      <button
        className="mt-6 rounded-full bg-accent px-5 py-2 font-medium text-accent-foreground"
        onClick={
          // Attempt to recover by trying to re-render the segment
          () => reset()
        }
      >
        Try again
      </button>
    </div>
  );
}
