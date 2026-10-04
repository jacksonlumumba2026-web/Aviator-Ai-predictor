import Link from "next/link";

export function EmptyState({
  icon,
  title,
  description,
  href,
  cta,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  description: React.ReactNode;
  href?: string;
  cta?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && (
        <div className="mb-5 grid size-12 place-items-center rounded-2xl border border-line-strong bg-white/[0.03] text-ink-2 [&>svg]:size-5">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">{description}</p>
      {href && cta && (
        <Link
          href={href}
          className="mt-6 inline-flex h-10 items-center rounded-xl border border-line-strong bg-white/[0.04] px-4 text-sm font-medium text-ink transition hover:bg-white/[0.08]"
        >
          {cta}
        </Link>
      )}
      {children}
    </div>
  );
}
