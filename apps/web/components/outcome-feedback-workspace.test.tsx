import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BrowserOnboardingStore } from '@/lib/browser-onboarding';

import { OutcomeFeedbackWorkspace } from './outcome-feedback-workspace';

const NOW = '2026-10-14T10:00:00.000Z';

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  localStorage.clear();
  await new BrowserOnboardingStore({
    storage: localStorage,
    indexedDB,
    keyRange: IDBKeyRange,
    createId: () => crypto.randomUUID(),
    now: () => NOW,
    timeZone: () => 'UTC',
  }).save({
    ageYears: 30,
    heightCentimeters: '170',
    weightKilograms: '70',
    physiologicalReference: 'female',
    primaryGoal: 'maintain',
    foodRestrictions: [],
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('optional outcome feedback UI', () => {
  it('saves local weight and lab observations and clearly separates them from food ranking', async () => {
    render(<OutcomeFeedbackWorkspace />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save weight' })).toBeEnabled(),
    );
    expect(
      screen.getByText(/never change the next-meal ranking/i),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Weight (kg)'), {
      target: { value: '72.5' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save weight' }));
    await waitFor(() =>
      expect(screen.getByText(/72.5 kg/)).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByLabelText('Test name'), {
      target: { value: 'Ferritin' },
    });
    fireEvent.change(screen.getByLabelText('Reported value'), {
      target: { value: '45' },
    });
    fireEvent.change(screen.getByLabelText('Unit as reported'), {
      target: { value: 'ng/mL' },
    });
    fireEvent.change(screen.getByLabelText('Laboratory as reported'), {
      target: { value: 'Example Lab' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save lab result' }));
    await waitFor(() =>
      expect(screen.getByText(/Ferritin · ng\/mL/)).toBeInTheDocument(),
    );
    expect(
      screen.getByText(/Review results with your clinician/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]!);
    expect(screen.getByText(/72.5 kg/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));
    await waitFor(() =>
      expect(screen.queryByText(/72.5 kg/)).not.toBeInTheDocument(),
    );
  });
});
