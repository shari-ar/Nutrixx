export type SiteConfig = typeof siteConfig;

export const siteConfig = {
  name: 'Nutrixx',
  description:
    'Personalized nutrition guidance built from food, activity, and optional health data.',
  navigation: [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/meals', label: 'Meals' },
    { href: '/foods', label: 'Foods' },
    { href: '/recipes', label: 'Recipes' },
    { href: '/nutrition', label: 'Nutrition' },
    { href: '/activity', label: 'Activity' },
  ] as const,
};
