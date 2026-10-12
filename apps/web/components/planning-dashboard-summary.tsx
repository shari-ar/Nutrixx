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
        if (
          !snapshot.activeFresh ||
          !snapshot.activeRun ||
          snapshot.activeRun.outcome.status !== 'READY'
        ) {
          setSummary(
            snapshot.active
              ? 'Your previous plan needs a fresh review.'
              : 'Build and accept a local day plan.',
          );
          return;
        }
        const selection = snapshot.activeRun.outcome.draft.selections[0];
        const slot = snapshot.activeRun.input.slots.find(
          (item) => item.slotId === selection?.slotId,
        );
        const candidate =
          slot?.state === 'open'
            ? slot.candidates.find(
                (item) => item.candidateId === selection?.candidateId,
              )
            : undefined;
        setSummary(
          candidate
            ? `${slot?.label}: ${candidate.displayNameSnapshot}`
            : 'Open your current day plan.',
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
