'use client';

import { useEffect, useMemo, useState } from 'react';

import { BrowserPlanningStore } from '@/lib/browser-planning';

interface PlanningDashboardSummaryProps {
  readonly store?: Pick<BrowserPlanningStore, 'load' | 'cancelActiveWorkers'>;
}

export function PlanningDashboardSummary({
  store,
}: PlanningDashboardSummaryProps = {}) {
  const planning = useMemo(() => store ?? new BrowserPlanningStore(), [store]);
  const [summary, setSummary] = useState(
    'Open the planner for your next suggested meal.',
  );
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    void planning
      .load(controller.signal)
      .then((snapshot) => {
        if (!active) return;
        if (!snapshot.run) {
          setSummary('Find your next meal from the local catalog.');
          return;
        }
        if (snapshot.loggedMealId) {
          setSummary('Your selected meal was recorded. Find a new next meal.');
          return;
        }
        if (!snapshot.fresh) {
          setSummary('Your nutrition context changed. Refresh your next meal.');
          return;
        }
        const key =
          snapshot.intention?.candidateKey ??
          snapshot.run.result.ranked[0]?.candidateKey;
        const candidate = snapshot.run.explanations.find(
          (item) => item.candidateKey === key,
        );
        setSummary(
          candidate
            ? `${snapshot.intention ? 'Selected' : 'Top ranked'}: ${candidate.displayName}`
            : 'Open the ranked catalog to review available foods.',
        );
      })
      .catch(() => {
        if (active) setSummary('Open the planner to review local storage.');
      });
    return () => {
      active = false;
      controller.abort();
      planning.cancelActiveWorkers();
    };
  }, [planning]);
  return <span>{summary}</span>;
}
