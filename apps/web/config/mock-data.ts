export type MealStatus = 'Completed' | 'Next' | 'Planned';

export type MockMeal = {
  calories: number;
  dateLabel: string;
  description: string;
  id: string;
  ingredients: string[];
  nutrients: Array<{ label: string; value: string }>;
  protein: number;
  status: MealStatus;
  steps: string[];
  time: string;
  title: string;
};

export const mockMeals: MockMeal[] = [
  {
    id: 'berry-yogurt-oats',
    title: 'Berry yogurt oats',
    time: '8:00 AM',
    dateLabel: 'Today',
    status: 'Completed',
    description: 'Creamy oats with Greek yogurt, berries, and pumpkin seeds.',
    calories: 410,
    protein: 24,
    ingredients: [
      'Rolled oats',
      'Greek yogurt',
      'Mixed berries',
      'Pumpkin seeds',
    ],
    steps: [
      'Soak the oats.',
      'Fold in the yogurt.',
      'Top with berries and seeds.',
    ],
    nutrients: [
      { label: 'Fiber', value: '9 g' },
      { label: 'Calcium', value: '31% DV' },
      { label: 'Iron', value: '18% DV' },
    ],
  },
  {
    id: 'roasted-salmon-bowl',
    title: 'Roasted salmon bowl',
    time: '12:30 PM',
    dateLabel: 'Today',
    status: 'Next',
    description: 'Salmon, brown rice, greens, and lemon-tahini dressing.',
    calories: 620,
    protein: 42,
    ingredients: [
      'Salmon fillet',
      'Brown rice',
      'Leafy greens',
      'Lemon tahini',
    ],
    steps: [
      'Roast the salmon.',
      'Warm the rice.',
      'Assemble and add dressing.',
    ],
    nutrients: [
      { label: 'Omega-3', value: '1.8 g' },
      { label: 'Vitamin D', value: '82% DV' },
      { label: 'Magnesium', value: '29% DV' },
    ],
  },
  {
    id: 'lentil-herb-soup',
    title: 'Lentil herb soup',
    time: '7:00 PM',
    dateLabel: 'Today',
    status: 'Planned',
    description: 'Red lentils, vegetables, fresh herbs, and whole-grain toast.',
    calories: 540,
    protein: 28,
    ingredients: [
      'Red lentils',
      'Seasonal vegetables',
      'Fresh herbs',
      'Whole-grain toast',
    ],
    steps: [
      'Simmer the lentils.',
      'Add vegetables and herbs.',
      'Serve with toast.',
    ],
    nutrients: [
      { label: 'Fiber', value: '17 g' },
      { label: 'Folate', value: '64% DV' },
      { label: 'Iron', value: '37% DV' },
    ],
  },
];

export function getMockMeal(id: string) {
  return mockMeals.find((meal) => meal.id === id);
}
