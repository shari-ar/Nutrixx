'use client';

import NextLink from 'next/link';
import { usePathname } from 'next/navigation';

import { BrandLogo } from '@/components/brand-logo';
import { ProductIcon } from '@/components/product-icons';
import { ThemeSwitch } from '@/components/theme-switch';
import { siteConfig } from '@/config/site';

export const Navbar = () => {
  const pathname = usePathname();

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

        <div className="hidden items-center gap-1 md:flex">
          {siteConfig.navigation.map((item) => {
            const isActive = pathname.startsWith(item.href);

            return (
              <NextLink
                key={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'bg-accent/10 text-accent'
                    : 'text-muted hover:bg-surface hover:text-foreground'
                }`}
                href={item.href}
              >
                {item.label}
              </NextLink>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          <NextLink
            aria-label="Settings"
            className="rounded-lg p-1 text-muted transition hover:text-foreground"
            href="/settings"
          >
            <ProductIcon className="size-5" name="settings" />
          </NextLink>
          <ThemeSwitch />
          <NextLink
            className="hidden rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition hover:opacity-90 sm:block"
            href="/start"
          >
            Start now
          </NextLink>
        </div>
      </header>

      <div className="flex gap-1 overflow-x-auto border-t border-separator px-4 py-2 md:hidden">
        {siteConfig.navigation.map((item) => (
          <NextLink
            key={item.href}
            className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm text-muted"
            href={item.href}
          >
            {item.label}
          </NextLink>
        ))}
      </div>
    </nav>
  );
};
