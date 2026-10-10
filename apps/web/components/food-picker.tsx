'use client';

import { useState } from 'react';

import type { BrowserStageTwoStore, FoodChoice } from '@/lib/browser-stage-two';

export function FoodPicker({
  includeRecipes = false,
  label = 'Find a food',
  onSelect,
  store,
}: {
  includeRecipes?: boolean;
  label?: string;
  onSelect: (choice: FoodChoice) => void;
  store: Pick<BrowserStageTwoStore, 'searchFoods'>;
}) {
  const [results, setResults] = useState<readonly FoodChoice[]>([]);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    setSearching(true);
    setError(null);
    try {
      setResults(await store.searchFoods(query, includeRecipes));
    } catch {
      setError(
        'Local food search is unavailable. Retry or review Storage Settings.',
      );
    } finally {
      setSearching(false);
    }
  }

  return (
    <div>
      <div className="flex gap-2">
        <label className="min-w-0 flex-1 text-sm font-medium">
          {label}
          <input
            className="mt-2 w-full rounded-xl border border-separator bg-background/70 px-3 py-2.5"
            name="query"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                search().catch(() => undefined);
              }
            }}
            placeholder="Search by food name or category"
            type="search"
            value={query}
          />
        </label>
        <button
          className="mt-7 rounded-xl border border-separator px-4 py-2 text-sm font-semibold"
          disabled={searching}
          onClick={() => {
            search().catch(() => undefined);
          }}
          type="button"
        >
          {searching ? 'Searching…' : 'Search'}
        </button>
      </div>
      {error ? (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {results.length > 0 ? (
        <ul
          aria-label="Food search results"
          className="mt-3 max-h-72 space-y-2 overflow-auto"
        >
          {results.map((choice) => (
            <li key={choice.key}>
              <button
                className="w-full rounded-xl border border-separator bg-background/50 p-3 text-left hover:border-accent"
                onClick={() => onSelect(choice)}
                type="button"
              >
                <span className="block font-semibold">{choice.name}</span>
                <span className="mt-1 block text-xs text-muted">
                  {choice.description}
                </span>
                <span className="mt-1 block text-xs text-muted">
                  {choice.provenance} · {choice.completeness}
                </span>
                {choice.approximatePriceUsdPer100g !== undefined ? (
                  <span className="mt-1 block text-xs text-muted">
                    Approx. ${choice.approximatePriceUsdPer100g} / 100 g
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
