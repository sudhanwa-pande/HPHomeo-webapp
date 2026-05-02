import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  size?: "sm" | "default" | "lg";
}

const sizeMap = {
  sm: "py-6",
  default: "py-14",
  lg: "py-20",
};

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
  size = "default",
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/60 bg-brand-bg/35 px-6 text-center text-brand-subtext",
        sizeMap[size],
        className
      )}
    >
      <div className={cn("mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-brand-subtext shadow-sm", size === "sm" && "mb-2 h-10 w-10 rounded-xl")}>
        <Icon className={cn("h-5 w-5 opacity-70", size === "sm" && "h-4 w-4")} />
      </div>
      <p className={cn("type-h3", size === "sm" && "type-ui-section")}>{title}</p>
      {description && (
        <p className={cn("type-muted mt-1 max-w-md", size === "sm" && "max-w-xs")}>{description}</p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
