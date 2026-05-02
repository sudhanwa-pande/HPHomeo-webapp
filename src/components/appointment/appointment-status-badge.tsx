"use client";

import { motion, AnimatePresence } from "framer-motion";
import { StatusBadge, type StatusVariant } from "@/components/doctor/ui/status-badge";
import { cn } from "@/lib/utils";

interface AppointmentStatusBadgeProps {
  status: StatusVariant;
  label?: string;
  dot?: boolean;
  size?: "xs" | "sm";
  animated?: boolean;
  className?: string;
}

export function AppointmentStatusBadge({
  status,
  label,
  dot,
  size = "sm",
  animated = true,
  className,
}: AppointmentStatusBadgeProps) {
  if (!animated) {
    return (
      <StatusBadge
        variant={status}
        label={label}
        dot={dot}
        size={size}
        className={className}
      />
    );
  }

  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={status}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className={cn("inline-flex", className)}
      >
        <StatusBadge
          variant={status}
          label={label}
          dot={dot}
          size={size}
        />
      </motion.span>
    </AnimatePresence>
  );
}
