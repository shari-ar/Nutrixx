import { useMemo, useState } from 'react';

export interface ProvenanceGraphNodeV1 {
  readonly id: string;
  readonly stage: 'INPUT' | 'CALCULATION' | 'OUTCOME';
  readonly label: string;
  readonly value: string;
  readonly source: string;
  readonly derivation: string;
}

const STAGES = [
  ['INPUT', 'Inputs'],
  ['CALCULATION', 'Calculated values'],
  ['OUTCOME', 'Ranking outcome'],
] as const;

export function NextMealProvenanceGraph({
  nodes,
}: {
  readonly nodes: readonly ProvenanceGraphNodeV1[];
}) {
  const [selectedId, setSelectedId] = useState(nodes[0]?.id ?? '');
  const selected = useMemo(
    () => nodes.find((node) => node.id === selectedId) ?? nodes[0],
    [nodes, selectedId],
  );

  return (
    <section aria-label="Interactive value provenance graph">
      <div className="space-y-2">
        {STAGES.map(([stage, label], stageIndex) => {
          const stageNodes = nodes.filter((node) => node.stage === stage);
          if (stageNodes.length === 0) return null;
          return (
            <div key={stage}>
              {stageIndex > 0 ? (
                <div
                  aria-hidden="true"
                  className="py-1 text-center text-accent"
                >
                  ↓
                </div>
              ) : null}
              <p className="mb-2 text-center text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
                {label}
              </p>
              <div
                className={`grid gap-2 ${
                  stageNodes.length > 1 ? 'sm:grid-cols-3' : ''
                }`}
              >
                {stageNodes.map((node) => {
                  const active = node.id === selected?.id;
                  return (
                    <button
                      aria-label={`${node.label}: ${node.value}`}
                      aria-pressed={active}
                      className={`rounded-xl border p-3 text-left transition ${
                        active
                          ? 'border-accent bg-accent/10 shadow-sm'
                          : 'border-separator bg-background hover:border-accent/40'
                      }`}
                      key={node.id}
                      onClick={() => setSelectedId(node.id)}
                      type="button"
                    >
                      <span className="block text-xs text-muted">
                        {node.label}
                      </span>
                      <strong className="mt-1 block break-words text-sm">
                        {node.value}
                      </strong>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {selected ? (
        <div
          aria-live="polite"
          className="mt-3 rounded-xl border border-accent/20 bg-accent/5 p-3 text-xs"
        >
          <p className="font-semibold">{selected.label}</p>
          <dl className="mt-2 grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-muted">Origin</dt>
              <dd className="mt-0.5">{selected.source}</dd>
            </div>
            <div>
              <dt className="text-muted">How Nutrixx used it</dt>
              <dd className="mt-0.5">{selected.derivation}</dd>
            </div>
          </dl>
        </div>
      ) : null}
    </section>
  );
}
