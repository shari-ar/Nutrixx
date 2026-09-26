'use client';

import NextLink from 'next/link';

import { BrandLogo } from '@/components/brand-logo';
import { ThemeSwitch } from '@/components/theme-switch';

export const Navbar = () => {
  return (
    <nav className="sticky top-0 z-40 w-full border-b border-separator bg-background/70 backdrop-blur-lg">
      <header className="mx-auto flex h-16 max-w-[1280px] items-center justify-between gap-4 px-6">
        <NextLink
          aria-label="Nutrixx home"
          className="rounded-xl bg-white px-2.5 py-1.5"
          href="/"
        >
          <BrandLogo className="h-7 w-auto" priority sizes="124px" />
        </NextLink>

        <ThemeSwitch />
      </header>
    </nav>
  );
};
