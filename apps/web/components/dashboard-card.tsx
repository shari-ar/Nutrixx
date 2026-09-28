import Link from 'next/link';

import { ProductIcon } from '@/components/product-icons';

import type { ProductIconName } from '@/components/product-icons';
import type { Route } from 'next';
import type { ReactNode } from 'react';

const accentStyles = {
  blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-300',
  green: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
  orange: 'bg-orange-500/10 text-orange-600 dark:text-orange-300',
  violet: 'bg-violet-500/10 text-violet-600 dark:text-violet-300',
} as const;

type DashboardCardProps = {
  accent: keyof typeof accentStyles;
  children: ReactNode;
  eyebrow: string;
  href: Route;
  icon: ProductIconName;
  title: string;
};

export function DashboardCard({
  accent,
  children,
  eyebrow,
  href,
  icon,
  title,
}: DashboardCardProps) {
  return (
    <Link
      className="group flex min-h-64 flex-col rounded-[1.75rem] border border-separator bg-surface/80 p-6 shadow-sm transition duration-200 hover:-translate-y-1 hover:border-accent/40 hover:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
      href={href}
    >
      <div className="flex items-start justify-between gap-4">
        <div className={`rounded-2xl p-3 ${accentStyles[accent]}`}>
          <ProductIcon className="size-6" name={icon} />
        </div>
        <ProductIcon
          className="size-5 text-muted transition-transform group-hover:translate-x-1"
          name="arrow"
        />
      </div>
      <p className="mt-7 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h2>
      <div className="mt-auto pt-5 text-sm leading-6 text-muted">
        {children}
      </div>
    </Link>
  );
}
