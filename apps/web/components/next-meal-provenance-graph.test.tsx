import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  NextMealProvenanceGraph,
  type ProvenanceGraphNodeV1,
} from './next-meal-provenance-graph';

const nodes = [
  {
    id: 'recorded',
    stage: 'INPUT',
    label: 'Recorded intake',
    value: '2 mg',
    source: 'One accepted meal record',
    derivation: 'Summed inside the rule window.',
  },
  {
    id: 'target',
    stage: 'CALCULATION',
    label: 'Comparison target',
    value: '18 mg',
    source: 'National reference',
    derivation: 'Compared with projected intake.',
  },
  {
    id: 'rank',
    stage: 'OUTCOME',
    label: 'Candidate rank',
    value: '#1',
    source: 'Validated ranking output',
    derivation: 'Ordered by the active objective hierarchy.',
  },
] satisfies ProvenanceGraphNodeV1[];

describe('next-meal provenance graph', () => {
  it('reveals the origin and use of each selected value', () => {
    render(<NextMealProvenanceGraph nodes={nodes} />);
    expect(screen.getByText('One accepted meal record')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Comparison target: 18 mg' }),
    );
    expect(screen.getByText('National reference')).toBeInTheDocument();
    expect(
      screen.getByText('Compared with projected intake.'),
    ).toBeInTheDocument();
  });
});
