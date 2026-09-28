import type { SVGProps } from 'react';

export type ProductIconName =
  | 'activity'
  | 'arrow'
  | 'check'
  | 'droplet'
  | 'home'
  | 'meal'
  | 'nutrition'
  | 'plus'
  | 'settings';

const paths: Record<ProductIconName, string[]> = {
  activity: ['M4 13h3l2-6 4 10 2-4h5', 'M5 20h14'],
  arrow: ['m9 18 6-6-6-6'],
  check: ['m5 12 4 4L19 6'],
  droplet: ['M12 3s6 6.2 6 11a6 6 0 0 1-12 0c0-4.8 6-11 6-11Z'],
  home: ['m3 11 9-8 9 8', 'M5 10v10h14V10', 'M9 20v-6h6v6'],
  meal: [
    'M4 3v7a3 3 0 0 0 3 3V3',
    'M7 13v8',
    'M15 3v18',
    'M15 3c3 1 5 4 5 7v2h-5',
  ],
  nutrition: [
    'M12 21c4-3 7-7.1 7-11a4 4 0 0 0-7-2 4 4 0 0 0-7 2c0 3.9 3 8 7 11Z',
    'M12 8V4',
    'M9 4h6',
  ],
  plus: ['M12 5v14', 'M5 12h14'],
  settings: [
    'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
    'M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21h-4v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3v-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.5V3h4v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.1v4h-.1a1.7 1.7 0 0 0-1.5 1Z',
  ],
};

type ProductIconProps = SVGProps<SVGSVGElement> & {
  name: ProductIconName;
};

export function ProductIcon({ name, ...props }: ProductIconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      {...props}
    >
      {paths[name].map((path) => (
        <path d={path} key={path} />
      ))}
    </svg>
  );
}
