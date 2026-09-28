type PageHeaderProps = {
  description: string;
  eyebrow: string;
  title: string;
};

export function PageHeader({ description, eyebrow, title }: PageHeaderProps) {
  return (
    <header className="max-w-3xl">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">
        {eyebrow}
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
        {title}
      </h1>
      <p className="mt-4 text-base leading-7 text-muted sm:text-lg">
        {description}
      </p>
    </header>
  );
}
