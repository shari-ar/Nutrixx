'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Navbar } from '@/components/navbar';
import { BrowserOnboardingStore } from '@/lib/browser-onboarding';

const publicPaths = new Set(['/', '/start']);

export function ApplicationShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [complete, setComplete] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  const isPublicPath = publicPaths.has(pathname);

  useEffect(() => {
    let active = true;
    void new BrowserOnboardingStore()
      .load()
      .then((profile) => {
        if (active) setComplete(profile !== null);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const markProfileComplete = () => {
      setFailed(false);
      setComplete(true);
    };
    window.addEventListener(
      'nutrixx:onboarding-profile-saved',
      markProfileComplete,
    );
    return () => {
      window.removeEventListener(
        'nutrixx:onboarding-profile-saved',
        markProfileComplete,
      );
    };
  }, []);

  useEffect(() => {
    if (complete === false && !isPublicPath) router.replace('/start');
  }, [complete, isPublicPath, router]);

  const gatePending = complete === null && !failed && !isPublicPath;
  const privateRouteBlocked = complete === false && !isPublicPath;
  return (
    <div className="relative flex min-h-screen flex-col">
      <Navbar onboardingComplete={complete === true} />
      <main className="container mx-auto max-w-7xl flex-grow px-6">
        {gatePending || privateRouteBlocked ? (
          <section className="py-16" role="status">
            <h1 className="text-3xl font-semibold">
              Starting your local profile
            </h1>
            <p className="mt-3 text-muted">
              Nutrixx needs your one-time starting profile before opening daily
              tools.
            </p>
          </section>
        ) : failed && !isPublicPath ? (
          <section className="py-16" role="alert">
            <h1 className="text-3xl font-semibold">
              Local profile access needs attention
            </h1>
            <p className="mt-3 text-muted">
              Review browser storage, then retry this route.
            </p>
            <Link
              className="mt-5 inline-block font-semibold text-accent"
              href="/settings"
            >
              Open Storage Settings
            </Link>
          </section>
        ) : (
          children
        )}
      </main>
      <footer className="w-full border-t border-separator py-5">
        <p className="mx-auto max-w-7xl px-6 text-sm text-muted">
          Nutrixx · Personal nutrition, designed around real life
        </p>
      </footer>
    </div>
  );
}
