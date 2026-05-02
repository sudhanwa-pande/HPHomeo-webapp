"use client";

import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PatientAppointment } from "@/types/patient";
import { isUpcoming } from "@/lib/appointment-utils";

type TabFilter = "all" | "upcoming" | "completed" | "cancelled";

interface QuickStatsStripProps {
  appointments: PatientAppointment[];
  activeTab: TabFilter;
  onTabChange: (tab: TabFilter) => void;
  className?: string;
}

const TAB_COLORS: Record<TabFilter, { active: string; badge: string }> = {
  all: { active: "bg-gray-900 text-white", badge: "bg-white/20 text-white" },
  upcoming: { active: "bg-brand text-white", badge: "bg-white/25 text-white" },
  completed: { active: "bg-emerald-600 text-white", badge: "bg-white/25 text-white" },
  cancelled: { active: "bg-gray-600 text-white", badge: "bg-white/20 text-white" },
};

export function QuickStatsStrip({
  appointments,
  activeTab,
  onTabChange,
  className,
}: QuickStatsStripProps) {
  const counts = {
    all: appointments.length,
    upcoming: appointments.filter(isUpcoming).length,
    completed: appointments.filter((a) => a.status === "completed").length,
    cancelled: appointments.filter(
      (a) => a.status === "cancelled" || a.status === "no_show",
    ).length,
  };

  const pendingPayment = appointments.filter(
    (a) => a.status === "pending_payment",
  ).length;

  const tabs: { key: TabFilter; label: string; count: number }[] = [
    { key: "all", label: "All", count: counts.all },
    { key: "upcoming", label: "Upcoming", count: counts.upcoming },
    { key: "completed", label: "Completed", count: counts.completed },
    { key: "cancelled", label: "Cancelled", count: counts.cancelled },
  ];

  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      {/* Tab pills */}
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-gray-200/60 bg-white p-1 scrollbar-none">
        {tabs.map((t) => {
          const isActive = activeTab === t.key;
          const colors = TAB_COLORS[t.key];
          return (
            <button
              key={t.key}
              onClick={() => onTabChange(t.key)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150",
                isActive ? colors.active : "text-gray-500 hover:text-gray-900 hover:bg-gray-50",
              )}
            >
              {t.label}
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                  isActive ? colors.badge : "bg-gray-100 text-gray-400",
                )}
              >
                {t.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Pending payment alert */}
      {pendingPayment > 0 && (
        <button
          onClick={() => onTabChange("all")}
          className="flex items-center gap-2.5 rounded-xl border border-amber-200/60 bg-gradient-to-r from-amber-50/80 to-amber-50/40 px-3.5 py-2.5 text-left transition-colors hover:from-amber-50 hover:to-amber-50/60"
        >
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100">
            <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
          </div>
          <div>
            <span className="text-xs font-semibold text-amber-800">
              {pendingPayment} payment{pendingPayment > 1 ? "s" : ""} pending
            </span>
            <span className="ml-1 text-[11px] text-amber-600">
              — complete to confirm your appointment{pendingPayment > 1 ? "s" : ""}
            </span>
          </div>
        </button>
      )}
    </div>
  );
}
