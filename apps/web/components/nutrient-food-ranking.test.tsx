import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { NutrientFoodRanking } from './nutrient-food-ranking';

describe('nutrient food ranking', () => {
  it('states the comparison basis and lists high-source foods', async () => {
    render(
      <NutrientFoodRanking
        loadFoods={async () => ({
          catalogEntryCount: 8_156,
          nutrient: {
            componentId: 'nutrient.vitc',
            accessCode: 'VITC',
            name: 'Vitamin C',
            unit: 'mg',
            direction: 'ENCOURAGE',
            dailyValueAmount: 90,
            knownFoodCount: 6_000,
            highSourceCount: 300,
            highSourceShare: 0.05,
            topFoods: [
              {
                candidateKey: 'food:orange',
                displayName: 'Orange, raw',
                amountPer100Grams: '53.2',
                unit: 'mg',
                percentDailyValuePer100Grams: 59.1,
                sourceId: 'usda-fdc',
              },
            ],
          },
        })}
        slug="vitc"
      />,
    );

    expect(
      await screen.findByRole('heading', {
        name: 'Foods notable for Vitamin C',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('Orange, raw')).toBeInTheDocument();
    expect(screen.getByText('59.1% DV')).toBeInTheDocument();
    expect(screen.getByText(/per 100 g edible/)).toBeInTheDocument();
    expect(screen.getByText('Strong contribution')).toBeInTheDocument();
  });

  it('uses an amount ranking when no FDA Daily Value exists', async () => {
    render(
      <NutrientFoodRanking
        loadFoods={async () => ({
          catalogEntryCount: 8_156,
          nutrient: {
            componentId: 'food-component.lutein',
            accessCode: 'LUT',
            name: 'Lutein',
            unit: 'ug',
            direction: 'UNSPECIFIED',
            dailyValueAmount: null,
            knownFoodCount: 1_500,
            highSourceCount: null,
            highSourceShare: null,
            topFoods: [
              {
                candidateKey: 'food:kale',
                displayName: 'Kale, raw',
                amountPer100Grams: '6261',
                unit: 'ug',
                percentDailyValuePer100Grams: null,
                sourceId: 'usda-fdc',
              },
            ],
          },
        })}
        slug="lut"
      />,
    );

    expect(await screen.findByText('Kale, raw')).toBeInTheDocument();
    expect(screen.getByText('Amount ranking')).toBeInTheDocument();
    expect(screen.getByText(/has no FDA Daily Value/)).toBeInTheDocument();
  });
});
