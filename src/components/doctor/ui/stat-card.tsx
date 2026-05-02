import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  trend?: string;
  helper?: string;
  iconBg?: string;
  iconColor?: string;
  loading?: boolean;
  className?: string;
}

export function StatCard({
  icon: Icon,
  label,
  value,
  trend,
  helper,
  iconBg = "bg-brand/10",
  iconColor = "text-brand",
  loading = false,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "surface-panel surface-subtle px-5 py-5 transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_34px_rgba(15,23,42,0.08)]",
        className
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">{label}</p>
          {loading ? (
            <Skeleton className="mt-3 h-9 w-16" />
          ) : (
            <p className="type-ui-metric mt-2.5">
              {value}
            </p>
          )}
          {helper ? <p className="type-muted mt-2">{helper}</p> : null}
        </div>
        <div
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/80 shadow-sm",
            iconBg
          )}
        >
          <Icon className={cn("h-5 w-5", iconColor)} />
        </div>
      </div>
      {trend ? <p className="type-caption mt-4 text-brand-ink-soft">{trend}</p> : null}
    </div>
  );
}
