import { cn } from "@/lib/utils";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  align?: "start" | "center";
  compact?: boolean;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  icon,
  meta,
  actions,
  className,
  align = "start",
  compact = false,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 md:flex-row md:items-start md:justify-between",
        compact && "gap-3 md:min-h-11 md:items-center",
        align === "center" && "md:items-center",
        className
      )}
    >
      <div className={cn("flex min-w-0 items-start gap-3", compact && "gap-2.5 md:items-center")}>
        {icon ? (
          <div
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border/40 bg-brand-bg/80 text-brand",
              compact && "h-10 w-10 rounded-xl"
            )}
          >
            {icon}
          </div>
        ) : null}
        <div className={cn("min-w-0", compact && "min-h-10")}>
          {eyebrow ? <p className="eyebrow mb-1">{eyebrow}</p> : null}
          <h2 className={cn("type-ui-section", compact && "leading-none")}>
            {title}
          </h2>
          {description && (
            <p className="type-muted mt-1 max-w-3xl">
              {description}
            </p>
          )}
          {meta ? <div className={cn("mt-2 flex flex-wrap items-center gap-2", compact && "mt-1.5")}>{meta}</div> : null}
        </div>
      </div>
      {actions ? <div className={cn("flex flex-wrap items-center gap-2", compact && "md:self-start")}>{actions}</div> : null}
    </div>
  );
}
