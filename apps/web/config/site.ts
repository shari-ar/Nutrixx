import { PRODUCT_DESCRIPTION, PRODUCT_NAME } from '@nutrixx/config/application';

export type SiteConfig = typeof siteConfig;

export const siteConfig = {
  name: PRODUCT_NAME,
  description: PRODUCT_DESCRIPTION,
  navigation: [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/planning', label: 'Planning' },
    { href: '/meals', label: 'Meals' },
    { href: '/foods', label: 'Foods' },
    { href: '/recipes', label: 'Recipes' },
    { href: '/nutrition', label: 'Nutrition' },
    { href: '/activity', label: 'Activity' },
  ] as const,
};
