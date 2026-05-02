"use client";

import { CheckCircle2, Circle, Clock, Phone, XCircle, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatShortDate, formatTime } from "@/lib/appointment-utils";

interface TimelineStep {
  label: string;
  timestamp?: string | null;
  status: "completed" | "active" | "upcoming" | "cancelled";
  icon: React.ComponentType<{ className?: string }>;
}

interface AppointmentTimelineProps {
  appointment: {
    status: string;
    created_at: string;
    scheduled_at: string;
    call_status?: string;
    completed_at?: string | null;
    cancelled_at?: string | null;
    confirmed_at?: string | null;
    no_show_at?: string | null;
  };
  className?: string;
}

function deriveSteps(apt: AppointmentTimelineProps["appointment"]): TimelineStep[] {
  const steps: TimelineStep[] = [];

  // Step 1: Booked
  steps.push({
    label: "Booked",
    timestamp: apt.created_at,
    status: "completed",
    icon: CheckCircle2,
  });

  // Step 2: Confirmed
  if (apt.status === "cancelled") {
    steps.push({
      label: "Confirmed",
      timestamp: apt.confirmed_at,
      status: apt.confirmed_at ? "completed" : "cancelled",
      icon: apt.confirmed_at ? CheckCircle2 : XCircle,
    });
  } else if (apt.status === "pending_payment") {
    steps.push({
      label: "Awaiting Payment",
      timestamp: null,
      status: "active",
      icon: Clock,
    });
  } else {
    steps.push({
      label: "Confirmed",
      timestamp: apt.confirmed_at,
      status: "completed",
      icon: CheckCircle2,
    });
  }

  // Step 3: Cancelled branch
  if (apt.status === "cancelled") {
    steps.push({
      label: "Cancelled",
      timestamp: apt.cancelled_at,
      status: "cancelled",
      icon: XCircle,
    });
    return steps;
  }

  // Step 3: No Show branch
  if (apt.status === "no_show") {
    steps.push({
      label: "No Show",
      timestamp: apt.no_show_at,
      status: "cancelled",
      icon: AlertTriangle,
    });
    return steps;
  }

  // Step 3: In Progress (for ongoing)
  if (apt.status === "confirmed") {
    const isInCall = apt.call_status === "connected" || apt.call_status === "disconnected" || apt.call_status === "waiting";
    steps.push({
      label: isInCall ? "In Consultation" : "Consultation",
      timestamp: null,
      status: isInCall ? "active" : "upcoming",
      icon: isInCall ? Phone : Circle,
    });
    steps.push({
      label: "Completed",
      timestamp: null,
      status: "upcoming",
      icon: Circle,
    });
    return steps;
  }

  // Step 3 & 4: Completed
  if (apt.status === "completed") {
    steps.push({
      label: "Consultation",
      timestamp: null,
      status: "completed",
      icon: CheckCircle2,
    });
    steps.push({
      label: "Completed",
      timestamp: apt.completed_at,
      status: "completed",
      icon: CheckCircle2,
    });
  }

  return steps;
}

const stepStyles = {
  completed: {
    icon: "text-emerald-600",
    line: "bg-emerald-300",
    label: "text-gray-900 font-medium",
    time: "text-gray-500",
    ring: "ring-emerald-100",
  },
  active: {
    icon: "text-brand animate-pulse",
    line: "bg-gray-200",
    label: "text-brand font-semibold",
    time: "text-brand/70",
    ring: "ring-brand/20",
  },
  upcoming: {
    icon: "text-gray-300",
    line: "bg-gray-200",
    label: "text-gray-400",
    time: "text-gray-300",
    ring: "ring-gray-100",
  },
  cancelled: {
    icon: "text-red-500",
    line: "bg-red-200",
    label: "text-red-600 font-medium",
    time: "text-red-400",
    ring: "ring-red-100",
  },
};

export function AppointmentTimeline({
  appointment,
  className,
}: AppointmentTimelineProps) {
  const steps = deriveSteps(appointment);

  return (
    <div className={cn("rounded-2xl border border-gray-200/60 bg-white p-5", className)}>
      <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-400">
        Appointment Progress
      </h3>
      <div className="relative">
        {steps.map((step, i) => {
          const style = stepStyles[step.status];
          const Icon = step.icon;
          const isLast = i === steps.length - 1;

          return (
            <div key={`${step.label}-${i}`} className="flex gap-3">
              {/* Icon column */}
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white ring-2",
                    style.ring,
                  )}
                >
                  <Icon className={cn("h-4 w-4", style.icon)} />
                </div>
                {!isLast && (
                  <div className={cn("my-1 h-8 w-0.5 rounded-full", style.line)} />
                )}
              </div>

              {/* Content */}
              <div className={cn("pb-6", isLast && "pb-0")}>
                <p className={cn("text-sm", style.label)}>{step.label}</p>
                {step.timestamp && (
                  <p className={cn("text-xs", style.time)}>
                    {formatShortDate(step.timestamp)} at {formatTime(step.timestamp)}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
