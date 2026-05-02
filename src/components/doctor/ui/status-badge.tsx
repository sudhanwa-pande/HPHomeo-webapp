import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

type StatusVariant =
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no_show"
  | "pending_payment"
  | "pending"
  | "approved"
  | "rejected"
  | "new"
  | "follow_up"
  | "draft"
  | "final"
  | "online"
  | "walk_in"
  | "info"
  | "success"
  | "warning"
  | "error"
  | "neutral"
  | "waiting"
  | "stale"
  | "profile_incomplete"
  | "risk";

interface StatusConfig {
  bg: string;
  text: string;
  label: string;
}

const STATUS_MAP: Record<StatusVariant, StatusConfig> = {
  // Appointment statuses
  confirmed: { bg: "bg-status-info-bg", text: "text-status-info-text", label: "Confirmed" },
  completed: { bg: "bg-status-success-bg", text: "text-status-success-text", label: "Completed" },
  cancelled: { bg: "bg-status-error-bg", text: "text-status-error-text", label: "Cancelled" },
  no_show: { bg: "bg-status-warning-bg", text: "text-status-warning-text", label: "No Show" },
  pending_payment: { bg: "bg-violet-50", text: "text-violet-700", label: "Pending Payment" },

  // Verification
  pending: { bg: "bg-status-warning-bg", text: "text-status-warning-text", label: "Pending" },
  approved: { bg: "bg-status-success-bg", text: "text-status-success-text", label: "Approved" },
  rejected: { bg: "bg-status-error-bg", text: "text-status-error-text", label: "Rejected" },

  // Appointment types
  new: { bg: "bg-brand/10", text: "text-brand", label: "New" },
  follow_up: { bg: "bg-status-success-bg", text: "text-status-success-text", label: "Follow-up" },

  // Prescription
  draft: { bg: "bg-status-warning-bg", text: "text-status-warning-text", label: "Draft" },
  final: { bg: "bg-status-success-bg", text: "text-status-success-text", label: "Final" },

  // Mode
  online: { bg: "bg-status-info-bg", text: "text-status-info-text", label: "Online" },
  walk_in: { bg: "bg-status-neutral-bg", text: "text-status-neutral-text", label: "Walk-in" },

  // Semantic
  info: { bg: "bg-status-info-bg", text: "text-status-info-text", label: "Info" },
  success: { bg: "bg-status-success-bg", text: "text-status-success-text", label: "Success" },
  warning: { bg: "bg-status-warning-bg", text: "text-status-warning-text", label: "Warning" },
  error: { bg: "bg-status-error-bg", text: "text-status-error-text", label: "Error" },
  neutral: { bg: "bg-status-neutral-bg", text: "text-status-neutral-text", label: "" },
  waiting: { bg: "bg-emerald-100", text: "text-emerald-700", label: "Waiting" },
  stale: { bg: "bg-slate-200", text: "text-slate-700", label: "Stale" },
  profile_incomplete: { bg: "bg-amber-100", text: "text-amber-700", label: "Profile Incomplete" },
  risk: { bg: "bg-rose-100", text: "text-rose-700", label: "Risk" },
};

interface StatusBadgeProps {
  variant: StatusVariant;
  label?: string;
  dot?: boolean;
  size?: "xs" | "sm";
  className?: string;
}

export function StatusBadge({
  variant,
  label,
  dot = false,
  size = "sm",
  className,
}: StatusBadgeProps) {
  const config = STATUS_MAP[variant];
  const displayLabel = label ?? config.label;

  if (dot) {
    return (
      <span className={cn("inline-flex items-center gap-1.5", className)}>
        <span className={cn("h-2 w-2 shrink-0 rounded-full", config.bg, config.text.replace("text-", "bg-"))} />
        <span className={cn("type-caption font-medium text-brand-dark", size === "xs" && "text-[10px]")}>
          {displayLabel}
        </span>
      </span>
    );
  }

  return (
    <Badge
      className={cn(
        "inline-flex items-center rounded-full border-0 font-semibold shadow-none",
        config.bg,
        config.text,
        size === "xs" ? "h-5 px-2 py-0 text-[10px]" : "h-6 px-2.5 py-0 text-[11px]",
        className
      )}
      variant="secondary"
    >
      {displayLabel}
    </Badge>
  );
}

export { STATUS_MAP };
export type { StatusVariant };
