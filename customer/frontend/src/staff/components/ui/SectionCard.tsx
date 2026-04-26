import { type ReactNode } from 'react';

export const SectionCard = ({
  title,
  subtitle,
  eyebrow,
  actions,
  children,
  className = '',
  contentClassName = '',
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  contentClassName?: string;
}) => (
  <section className={`rounded-lg border bg-white dark:bg-slate-800 p-4 shadow-sm ${className}`}>
    {(title || subtitle || eyebrow || actions) ? (
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow ? <p className="text-[11px] font-semibold uppercase text-[#2B7A87]">{eyebrow}</p> : null}
          {title ? <h2 className="text-lg font-semibold leading-tight">{title}</h2> : null}
          {subtitle ? <p className="mt-1 text-sm text-[#6B7280]">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    ) : null}
    <div className={contentClassName}>{children}</div>
  </section>
);
