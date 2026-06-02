import React from "react";

export function SectionShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border/60 bg-white p-3.5 shadow-[0_4px_20px_rgba(15,23,42,0.03)] sm:p-6">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2 sm:mb-4 sm:gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-brand-dark">{title}</h3>
          {description && (
            <p className="mt-0.5 text-xs text-brand-subtext">{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
      {children}
    </section>
  );
}

export function InfoLabel({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-subtext/70">
        {label}
      </p>
      <p className="mt-0.5 text-sm text-brand-dark">{value || "-"}</p>
    </div>
  );
}
