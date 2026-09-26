import Image from 'next/image';

const brandAssets = {
  mark: {
    alt: 'Nutrixx',
    height: 341,
    src: '/brand/nutrixx-mark.png',
    width: 341,
  },
  wordmark: {
    alt: 'Nutrixx',
    height: 327,
    src: '/brand/nutrixx-wordmark.png',
    width: 1433,
  },
} as const;

type BrandLogoProps = {
  className?: string;
  priority?: boolean;
  sizes?: string;
  variant?: keyof typeof brandAssets;
};

export function BrandLogo({
  className,
  priority = false,
  sizes,
  variant = 'wordmark',
}: BrandLogoProps) {
  const asset = brandAssets[variant];

  return (
    <Image
      alt={asset.alt}
      className={className}
      height={asset.height}
      priority={priority}
      sizes={sizes}
      src={asset.src}
      width={asset.width}
    />
  );
}
