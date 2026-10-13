'use client';

import { useEffect, useState } from 'react';

import { BrowserPlanningStore } from '@/lib/browser-planning';

export function PlanningDashboardSummary() {
  const [summary, setSummary] = useState(
    'Open the planner for your next suggested meal.',
  );
  useEffect(() => {
    let active = true;
    void new BrowserPlanningStore()
      .load()
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
    };
  }, []);
  return <span>{summary}</span>;
}
