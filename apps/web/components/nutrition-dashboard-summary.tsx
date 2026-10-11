'use client';

import { useEffect, useRef, useState } from 'react';

import { BrowserNutritionStateStore } from '@/lib/browser-nutrition-state';

type NutritionReader = Pick<BrowserNutritionStateStore, 'load'>;

export function NutritionDashboardSummary({
  store,
}: {
  store?: NutritionReader;
}) {
  const runtimeRef = useRef<NutritionReader | null>(store ?? null);
  const [summary, setSummary] = useState<string>(
    'Opening your recorded nutrition…',
  );

  useEffect(() => {
    let active = true;
    void Promise.resolve()
      .then(() => {
        const runtime =
          store ?? runtimeRef.current ?? new BrowserNutritionStateStore();
        runtimeRef.current = runtime;
        return runtime.load();
      })
      .then(({ market, window }) => {
        if (!active) return;
        const count = window.current.recordedMealCount;
        if (count === 0) {
          setSummary('Log a meal to start your recorded-intake view.');
          return;
        }
        const known = window.current.nutrients.filter(
          (nutrient) => nutrient.evidence === 'known-for-recorded-meals',
        ).length;
        setSummary(
          `${count} meal(s) recorded today · ${known} of ${window.current.nutrients.length} nutrients have complete composition for those meals.${market === null ? ' Choose a reference region for comparisons.' : ''}`,
        );
      })
      .catch(() => {
        if (active) setSummary('Open Nutrition to refresh local results.');
      });
    return () => {
      active = false;
    };
  }, [store]);

  return <span>{summary}</span>;
}
