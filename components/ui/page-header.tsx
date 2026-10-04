import { Reveal } from "./reveal";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <Reveal className="mb-10 flex flex-col gap-6 md:mb-12 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl">
        <p className="mb-3 inline-flex items-center gap-2 text-[11px] font-medium tracking-[0.18em] text-brand uppercase">
          <span className="h-px w-6 bg-brand/60" />
          {eyebrow}
        </p>
        <h1 className="text-3xl font-semibold tracking-[-0.03em] text-balance text-ink md:text-[44px] md:leading-[1.05]">{title}</h1>
        {description && <p className="mt-4 text-[15px] leading-relaxed text-ink-2 text-pretty">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </Reveal>
  );
}
