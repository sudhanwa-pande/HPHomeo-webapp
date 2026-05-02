"use client";

import { useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  isToday,
  startOfMonth,
  subMonths,
  isBefore,
  startOfDay,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  AvailabilityException,
  TimeRange,
  WeeklySchedule,
} from "@/types/doctor";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const DAY_KEYS: (keyof WeeklySchedule)[] = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
];

function totalMinutes(slots: TimeRange[]): number {
  return slots.reduce((sum, s) => {
    const [sh, sm] = s.start.split(":").map(Number);
    const [eh, em] = s.end.split(":").map(Number);
    return sum + Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
  }, 0);
}

function weekdayKey(date: Date): keyof WeeklySchedule {
  return DAY_KEYS[(getDay(date) + 6) % 7];
}

type DayTone = "off" | "light" | "medium" | "full" | "blocked" | "override";

function getDayTone(
  date: Date,
  weekly: WeeklySchedule,
  exceptionMap: Map<string, AvailabilityException>
): { tone: DayTone; label: string; minutes: number } {
  const key = format(date, "yyyy-MM-dd");
  const exc = exceptionMap.get(key);

  if (exc) {
    if (
      exc.status === "blocked" &&
      (!exc.time_slots || exc.time_slots.length === 0)
    ) {
      return { tone: "blocked", label: "Blocked", minutes: 0 };
    }
    if (exc.status === "blocked" && exc.time_slots?.length) {
      return {
        tone: "blocked",
        label: "Partially blocked",
        minutes: 0,
      };
    }
    const mins = totalMinutes(exc.time_slots ?? []);
    return {
      tone: "override",
      label: `Override · ${Math.round(mins / 60)}h`,
      minutes: mins,
    };
  }

  const slots = weekly[weekdayKey(date)];
  if (!slots.length) return { tone: "off", label: "Off", minutes: 0 };

  const mins = totalMinutes(slots);
  const hours = mins / 60;
  if (hours <= 3) return { tone: "light", label: `${hours.toFixed(1)}h`, minutes: mins };
  if (hours <= 6) return { tone: "medium", label: `${hours.toFixed(1)}h`, minutes: mins };
  return { tone: "full", label: `${hours.toFixed(1)}h`, minutes: mins };
}

const toneColors: Record<DayTone, string> = {
  off: "bg-gray-50 text-brand-subtext/40",
  light: "bg-emerald-50 text-emerald-700",
  medium: "bg-emerald-100 text-emerald-800",
  full: "bg-emerald-200 text-emerald-900",
  blocked: "bg-red-50 text-red-400",
  override: "bg-amber-50 text-amber-700",
};

const toneRing: Record<DayTone, string> = {
  off: "",
  light: "ring-emerald-200",
  medium: "ring-emerald-300",
  full: "ring-emerald-400",
  blocked: "ring-red-300",
  override: "ring-amber-300",
};

interface HeatmapCalendarProps {
  weekly: WeeklySchedule;
  exceptions: AvailabilityException[];
  onDayClick: (date: Date) => void;
  className?: string;
}

export function HeatmapCalendar({
  weekly,
  exceptions,
  onDayClick,
  className,
}: HeatmapCalendarProps) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));

  const exceptionMap = useMemo(
    () => new Map(exceptions.map((e) => [e.date, e])),
    [exceptions]
  );

  const days = useMemo(() => {
    const start = startOfMonth(month);
    const end = endOfMonth(month);
    const allDays = eachDayOfInterval({ start, end });

    const startPad = (getDay(start) + 6) % 7;
    const padBefore = Array.from({ length: startPad }, () => null);

    return [...padBefore, ...allDays];
  }, [month]);

  return (
    <div className={cn("select-none", className)}>
      {/* Month nav */}
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={() => setMonth((m) => subMonths(m, 1))}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-brand-subtext/50 transition-colors hover:bg-brand-bg hover:text-brand-dark"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-sm font-semibold text-brand-dark">
          {format(month, "MMMM yyyy")}
        </p>
        <button
          onClick={() => setMonth((m) => addMonths(m, 1))}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-brand-subtext/50 transition-colors hover:bg-brand-bg hover:text-brand-dark"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="mb-1.5 grid grid-cols-7 gap-1">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="text-center text-[10px] font-semibold uppercase tracking-wider text-brand-subtext/40"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1">
        <AnimatePresence>
          {days.map((day, i) => {
            if (!day) {
              return <div key={`pad-${i}`} className="aspect-square" />;
            }

            const { tone, label } = getDayTone(day, weekly, exceptionMap);
            const today = isToday(day);
            const past = isBefore(day, startOfDay(new Date()));

            return (
              <Tooltip key={day.toISOString()}>
                <TooltipTrigger
                  render={
                    <motion.button
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.008 }}
                      onClick={() => onDayClick(day)}
                      className={cn(
                        "relative aspect-square rounded-lg text-[11px] font-medium transition-all",
                        "hover:ring-2 hover:scale-105",
                        toneColors[tone],
                        toneRing[tone],
                        today && "ring-2 ring-brand ring-offset-1",
                        past && "opacity-50"
                      )}
                    />
                  }
                >
                  {format(day, "d")}
                  {tone === "blocked" && (
                    <span className="absolute bottom-0.5 left-1/2 h-0.5 w-2.5 -translate-x-1/2 rounded-full bg-red-400" />
                  )}
                  {tone === "override" && (
                    <span className="absolute bottom-0.5 left-1/2 h-0.5 w-2.5 -translate-x-1/2 rounded-full bg-amber-500" />
                  )}
                </TooltipTrigger>
                <TooltipContent>
                  {format(day, "EEE, d MMM")} · {label}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
        {[
          { tone: "off" as const, label: "Off" },
          { tone: "light" as const, label: "Low" },
          { tone: "full" as const, label: "Full" },
          { tone: "blocked" as const, label: "Blocked" },
          { tone: "override" as const, label: "Override" },
        ].map(({ tone, label }) => (
          <span key={tone} className="flex items-center gap-1.5 text-[10px] text-brand-subtext/60">
            <span
              className={cn(
                "h-2.5 w-2.5 rounded-[3px]",
                toneColors[tone]
              )}
            />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
