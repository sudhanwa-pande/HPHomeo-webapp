import { cn } from "@/lib/utils";

interface InfoRowProps {
  label: string;
  value?: string | React.ReactNode | null;
  className?: string;
}

export function InfoRow({ label, value, className }: InfoRowProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <span className="type-caption shrink-0 uppercase tracking-[0.18em]">{label}</span>
      <span className="type-body-sm text-right font-medium capitalize text-brand-dark">
        {value ?? "-"}
      </span>
    </div>
  );
}
