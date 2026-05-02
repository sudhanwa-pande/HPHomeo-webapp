import { AlertTriangle, CheckCircle2, Clock3, Inbox, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type StateTone = "loading" | "success" | "warning" | "empty" | "stale";

const toneMap: Record<
  StateTone,
  {
    icon: React.ComponentType<{ className?: string }>;
    shell: string;
    iconShell: string;
    title: string;
  }
> = {
  loading: {
    icon: RefreshCw,
    shell: "border-brand/20 bg-status-info-bg/60",
    iconShell: "bg-white text-status-info-text",
    title: "Loading",
  },
  success: {
    icon: CheckCircle2,
    shell: "border-emerald-200 bg-status-success-bg/70",
    iconShell: "bg-white text-status-success-text",
    title: "Up to date",
  },
  warning: {
    icon: AlertTriangle,
    shell: "border-amber-200 bg-status-warning-bg/70",
    iconShell: "bg-white text-status-warning-text",
    title: "Needs attention",
  },
  empty: {
    icon: Inbox,
    shell: "border-border/60 bg-brand-bg/50",
    iconShell: "bg-white text-brand-subtext",
    title: "Nothing here",
  },
  stale: {
    icon: Clock3,
    shell: "border-slate-200 bg-status-neutral-bg/80",
    iconShell: "bg-white text-status-neutral-text",
    title: "Data may be stale",
  },
};

interface StatePanelProps {
  tone: StateTone;
  title?: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function StatePanel({
  tone,
  title,
  description,
  actionLabel,
  onAction,
  className,
}: StatePanelProps) {
  const config = toneMap[tone];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-3xl border px-5 py-4 md:flex-row md:items-center md:justify-between",
        config.shell,
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl", config.iconShell)}>
          <Icon className={cn("h-4 w-4", tone === "loading" && "animate-spin")} />
        </div>
        <div>
          <p className="type-label text-brand-dark">{title ?? config.title}</p>
          <p className="type-body-sm mt-1 text-brand-subtext">{description}</p>
        </div>
      </div>
      {actionLabel && onAction ? (
        <Button variant="outline" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
