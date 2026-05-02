import { cn } from "@/lib/utils";

interface SectionCardProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: "sm" | "default" | "lg";
  elevated?: boolean;
  tone?: "default" | "subtle" | "danger" | "warning";
}

const paddingMap = {
  sm: "p-3.5 md:p-4",
  default: "p-4 md:p-5",
  lg: "p-4.5 md:p-5.5",
};

const toneMap = {
  default: "bg-white",
  subtle: "surface-subtle",
  danger: "bg-red-50/80",
  warning: "bg-amber-50/80",
};

export function SectionCard({
  padding = "default",
  elevated = false,
  tone = "default",
  className,
  children,
  ...props
}: SectionCardProps) {
  return (
    <div
      className={cn(
        "surface-panel",
        toneMap[tone],
        elevated && "shadow-[0_16px_40px_rgba(15,23,42,0.08)]",
        paddingMap[padding],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
