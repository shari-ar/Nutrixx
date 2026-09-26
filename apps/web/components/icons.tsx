import type { IconSvgProps } from '@/types';

export const MoonFilledIcon = ({
  size = 24,
  width,
  height,
  ...props
}: IconSvgProps) => (
  <svg
    aria-hidden="true"
    focusable="false"
    height={size || height}
    role="presentation"
    viewBox="0 0 24 24"
    width={size || width}
    {...props}
  >
    <path
      d="M21.53 15.93c-.16-.27-.61-.69-1.73-.49a8.46 8.46 0 0 1-1.88.13 8.409 8.409 0 0 1-5.91-2.82 8.068 8.068 0 0 1-1.44-8.66c.44-1.01.13-1.54-.09-1.76s-.77-.55-1.83-.11a10.318 10.318 0 0 0-6.32 10.21 10.475 10.475 0 0 0 7.04 8.99 10 10 0 0 0 2.89.55c.16.01.32.02.48.02a10.5 10.5 0 0 0 8.47-4.27c.67-.93.49-1.519.32-1.79Z"
      fill="currentColor"
    />
  </svg>
);

export const SunFilledIcon = ({
  size = 24,
  width,
  height,
  ...props
}: IconSvgProps) => (
  <svg
    aria-hidden="true"
    focusable="false"
    height={size || height}
    role="presentation"
    viewBox="0 0 24 24"
    width={size || width}
    {...props}
  >
    <g fill="currentColor">
      <path d="M19 12a7 7 0 1 1-7-7 7 7 0 0 1 7 7Z" />
      <path d="M12 22.96a.969.969 0 0 1-1-.96v-.08a1 1 0 0 1 2 0 1.038 1.038 0 0 1-1 1.04Zm7.14-2.82a1.024 1.024 0 0 1-.71-.29l-.13-.13a1 1 0 0 1 1.41-1.41l.13.13a1 1 0 0 1 0 1.41.984.984 0 0 1-.7.29Zm-14.28 0a1.024 1.024 0 0 1-.71-.29 1 1 0 0 1 0-1.41l.13-.13a1 1 0 0 1 1.41 1.41l-.13.13a1 1 0 0 1-.7.29ZM22 13h-.08a1 1 0 0 1 0-2 1.038 1.038 0 0 1 1.04 1 .969.969 0 0 1-.96 1ZM2.08 13H2a1 1 0 0 1 0-2 1.038 1.038 0 0 1 1.04 1 .969.969 0 0 1-.96 1Zm16.93-7.01a1.024 1.024 0 0 1-.71-.29 1 1 0 0 1 0-1.41l.13-.13a1 1 0 0 1 1.41 1.41l-.13.13a.984.984 0 0 1-.7.29Zm-14.02 0a1.024 1.024 0 0 1-.71-.29l-.13-.14a1 1 0 0 1 1.41-1.41l.13.13a1 1 0 0 1 0 1.41.97.97 0 0 1-.7.3ZM12 3.04a.969.969 0 0 1-1-.96V2a1 1 0 0 1 2 0 1.038 1.038 0 0 1-1 1.04Z" />
    </g>
  </svg>
);
