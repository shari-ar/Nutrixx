const FOOD_GROUPS: Readonly<Record<string, string>> = {
  'Dairy and Egg Products': '01',
  'Poultry Products': '05',
  'Breakfast Cereals': '08',
  'Fruits and Fruit Juices': '09',
  'Pork Products': '10',
  'Vegetables and Vegetable Products': '11',
  'Nut and Seed Products': '12',
  'Beef Products': '13',
  Beverages: '14',
  'Finfish and Shellfish Products': '15',
  'Legumes and Legume Products': '16',
  'Lamb, Veal, and Game Products': '17',
  'Cereal Grains and Pasta': '20',
};

export function usdaFoodGroupFromCategory(
  category: string,
): string | undefined {
  return FOOD_GROUPS[category];
}
