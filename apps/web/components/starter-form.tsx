'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import {
  BrowserOnboardingStore,
  type StartingProfileFormValues,
} from '@/lib/browser-onboarding';

import type { StartingProfileV1 } from '@nutrixx/user-context';

type OnboardingStore = Pick<BrowserOnboardingStore, 'load' | 'save'>;

type StarterFormProps = {
  collapseWhenComplete?: boolean;
  heading?: string;
  store?: OnboardingStore;
};

const fieldClassName =
  'mt-2 w-full rounded-xl border border-separator bg-background/70 px-3 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20';

export function StarterForm({
  collapseWhenComplete = true,
  heading = 'Build your starting point',
  store,
}: StarterFormProps) {
  const router = useRouter();
  const [profile, setProfile] = useState<StartingProfileV1 | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;

  useEffect(() => {
    let active = true;
    const onboardingStore = store ?? new BrowserOnboardingStore();
    void onboardingStore
      .load()
      .then((result) => {
        if (active) setProfile(result);
      })
      .catch(() => {
        if (active) {
          setError(
            'Your local profile could not be opened. Retry or review local storage settings.',
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [store]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const values: StartingProfileFormValues = {
      ageYears: Number(form.get('ageYears')),
      heightCentimeters: String(form.get('heightCentimeters')),
      weightKilograms: String(form.get('weightKilograms')),
      physiologicalReference: String(
        form.get('physiologicalReference'),
      ) as StartingProfileFormValues['physiologicalReference'],
      primaryGoal: String(
        form.get('primaryGoal'),
      ) as StartingProfileFormValues['primaryGoal'],
      foodRestrictions: String(form.get('foodRestrictions') ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    };
    try {
      const saved = await (store ?? new BrowserOnboardingStore()).save(values);
      setProfile(saved);
      router.push('/dashboard');
    } catch {
      setError(
        'Your profile remains unchanged. Check browser storage access and try again.',
      );
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div
        className="rounded-[2rem] border border-separator bg-surface/90 p-8"
        role="status"
      >
        Opening your local starting profile…
      </div>
    );
  }

  if (profile && collapseWhenComplete && !editing) {
    return (
      <section className="rounded-[2rem] border border-separator bg-surface/90 p-8 shadow-xl shadow-black/5">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">
          Starting point ready
        </p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight">
          Continue where you left off.
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Your essential profile is saved in this browser. Daily use begins in
          your dashboard.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            className="rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground"
            href="/dashboard"
          >
            Continue to dashboard
          </Link>
          <button
            className="rounded-xl border border-separator px-5 py-3 text-sm font-semibold"
            onClick={() => setEditing(true)}
            type="button"
          >
            Edit starting profile
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="rounded-[2rem] border border-separator bg-surface/90 p-6 shadow-2xl shadow-black/5 backdrop-blur sm:p-8 dark:shadow-black/25">
      <div className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">
          About one minute · one time
        </p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
          {heading}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Enter only the essentials for an initial estimate. You can update them
          later.
        </p>
      </div>

      {error ? (
        <div
          className="mb-5 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm"
          role="alert"
        >
          {error}{' '}
          <Link className="font-semibold underline" href="/settings">
            Open storage settings
          </Link>
        </div>
      ) : null}

      <form
        key={profile?.updatedAt ?? 'new-profile'}
        aria-label="Nutrition starting profile"
        className="space-y-6"
        onSubmit={(event) => {
          handleSubmit(event).catch(() => {
            setError('Your profile remains unchanged. Please try again.');
            setSaving(false);
          });
        }}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-sm font-medium">
            Age
            <input
              required
              className={fieldClassName}
              defaultValue={profile?.ageYears}
              max={120}
              min={18}
              name="ageYears"
              placeholder="32"
              type="number"
            />
          </label>
          <label className="text-sm font-medium">
            Height (cm)
            <input
              required
              className={fieldClassName}
              defaultValue={profile?.heightCentimeters}
              max={250}
              min={100}
              name="heightCentimeters"
              placeholder="172"
              step="0.1"
              type="number"
            />
          </label>
          <label className="text-sm font-medium">
            Weight (kg)
            <input
              required
              className={fieldClassName}
              defaultValue={profile?.weightKilograms}
              max={350}
              min={30}
              name="weightKilograms"
              placeholder="68"
              step="0.1"
              type="number"
            />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Physiological reference
            <select
              required
              className={fieldClassName}
              defaultValue={profile?.physiologicalReference ?? ''}
              name="physiologicalReference"
            >
              <option disabled value="">
                Choose a reference
              </option>
              <option value="female">Female reference</option>
              <option value="male">Male reference</option>
              <option value="unsure">I am not sure</option>
            </select>
          </label>
          <label className="text-sm font-medium">
            Primary goal
            <select
              required
              className={fieldClassName}
              defaultValue={profile?.primaryGoal ?? ''}
              name="primaryGoal"
            >
              <option disabled value="">
                Choose your goal
              </option>
              <option value="maintain">Maintain weight</option>
              <option value="lose">Lose weight</option>
              <option value="gain">Gain weight</option>
            </select>
          </label>
        </div>

        <label className="block text-sm font-medium">
          Food restrictions or allergies
          <input
            className={fieldClassName}
            defaultValue={profile?.foodRestrictions.join(', ')}
            name="foodRestrictions"
            placeholder="For example: vegetarian, peanut allergy"
            type="text"
          />
        </label>

        {profile ? null : (
          <label className="flex items-start gap-3 rounded-2xl border border-separator bg-background/55 p-4 text-sm leading-6">
            <input
              required
              aria-describedby="adult-confirmation-note"
              className="mt-1 size-4 accent-[var(--color-accent)]"
              name="adultConfirmation"
              type="checkbox"
            />
            <span id="adult-confirmation-note">
              I confirm that I am at least 18 years old and understand that
              Nutrixx provides general wellness guidance, not medical advice.
            </span>
          </label>
        )}

        <button
          className="w-full rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground disabled:opacity-60"
          disabled={saving}
          type="submit"
        >
          {saving ? 'Saving locally…' : 'Save and open dashboard'}
        </button>

        <p className="text-center text-xs leading-5 text-muted">
          Saved only in this browser. {offline ? 'Offline mode is active.' : ''}
        </p>
      </form>
    </div>
  );
}
