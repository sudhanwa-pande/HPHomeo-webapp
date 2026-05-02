"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Copy, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { WeeklySchedule } from "@/types/doctor";

const DAYS: {
  key: keyof WeeklySchedule;
  label: string;
  short: string;
}[] = [
  { key: "mon", label: "Monday", short: "Mon" },
  { key: "tue", label: "Tuesday", short: "Tue" },
  { key: "wed", label: "Wednesday", short: "Wed" },
  { key: "thu", label: "Thursday", short: "Thu" },
  { key: "fri", label: "Friday", short: "Fri" },
  { key: "sat", label: "Saturday", short: "Sat" },
  { key: "sun", label: "Sunday", short: "Sun" },
];

interface WeeklyTimelineProps {
  weekly: WeeklySchedule;
  onChange: (weekly: WeeklySchedule) => void;
  readOnly?: boolean;
  className?: string;
}

export function WeeklyTimeline({
  weekly,
  onChange,
  readOnly = false,
  className,
}: WeeklyTimelineProps) {
  const [expandedDay, setExpandedDay] = useState<keyof WeeklySchedule | null>(
    null
  );
  const [copyFrom, setCopyFrom] = useState<keyof WeeklySchedule | null>(null);

  function toggleDay(day: keyof WeeklySchedule, on: boolean) {
    if (on && weekly[day].length === 0) {
      onChange({ ...weekly, [day]: [{ start: "09:00", end: "17:00" }] });
    } else if (!on) {
      onChange({ ...weekly, [day]: [] });
    }
  }

  function addSlot(day: keyof WeeklySchedule) {
    const existing = weekly[day];
    if (existing.length === 0) {
      onChange({ ...weekly, [day]: [{ start: "09:00", end: "17:00" }] });
      return;
    }
    const lastEnd = existing[existing.length - 1].end;
    const [h] = lastEnd.split(":").map(Number);
    if (h >= 22) {
      // No room for another slot at end of day — prepend a morning slot
      onChange({ ...weekly, [day]: [{ start: "06:00", end: "08:00" }, ...existing] });
      return;
    }
    const newStart = `${String(h + 1).padStart(2, "0")}:00`;
    const newEnd = `${String(Math.min(h + 4, 23)).padStart(2, "0")}:00`;
    onChange({ ...weekly, [day]: [...existing, { start: newStart, end: newEnd }] });
  }

  function updateSlot(
    day: keyof WeeklySchedule,
    index: number,
    field: "start" | "end",
    value: string
  ) {
    onChange({
      ...weekly,
      [day]: weekly[day].map((s, i) =>
        i === index ? { ...s, [field]: value } : s
      ),
    });
  }

  function removeSlot(day: keyof WeeklySchedule, index: number) {
    onChange({ ...weekly, [day]: weekly[day].filter((_, i) => i !== index) });
  }

  function copyDay(
    from: keyof WeeklySchedule,
    targets: (keyof WeeklySchedule)[]
  ) {
    const source = weekly[from];
    const updated = { ...weekly };
    for (const t of targets) updated[t] = source.map((s) => ({ ...s }));
    onChange(updated);
    setCopyFrom(null);
  }

  return (
    <div className={cn("space-y-1", className)}>
      {/* ── Copy bar ── */}
      <AnimatePresence>
        {copyFrom && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-brand/15 bg-brand/[0.04] px-4 py-2.5">
              <span className="text-xs font-medium text-brand">
                Copy {DAYS.find((d) => d.key === copyFrom)?.label} to:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {DAYS.filter((d) => d.key !== copyFrom).map(({ key, short }) => (
                  <button
                    key={key}
                    onClick={() => copyDay(copyFrom, [key])}
                    className="rounded-lg border border-border/30 bg-white px-2.5 py-1 text-[11px] font-medium text-brand-dark transition-colors hover:border-brand hover:text-brand"
                  >
                    {short}
                  </button>
                ))}
              </div>
              <div className="ml-auto flex gap-1.5">
                <button
                  onClick={() => {
                    const targets = DAYS.filter(
                      (d) =>
                        !["sat", "sun"].includes(d.key) &&
                        d.key !== copyFrom
                    ).map((d) => d.key);
                    copyDay(copyFrom, targets);
                  }}
                  className="rounded-lg bg-brand px-3 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-brand/90"
                >
                  Weekdays
                </button>
                <button
                  onClick={() =>
                    copyDay(
                      copyFrom,
                      DAYS.filter((d) => d.key !== copyFrom).map((d) => d.key)
                    )
                  }
                  className="rounded-lg bg-brand-dark px-3 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-brand-dark/90"
                >
                  All days
                </button>
                <button
                  onClick={() => setCopyFrom(null)}
                  className="ml-1 text-brand-subtext/50 hover:text-brand-dark"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Day rows ── */}
      {DAYS.map(({ key, label, short }, dayIndex) => {
        const slots = weekly[key];
        const isActive = slots.length > 0;
        const isExpanded = expandedDay === key;
        const isWeekend = key === "sat" || key === "sun";

        return (
          <motion.div
            key={key}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: dayIndex * 0.03 }}
            className={cn(
              "rounded-2xl border transition-all",
              isActive
                ? "border-border/20 bg-white"
                : "border-transparent bg-brand-bg/30",
              isExpanded && "border-brand/20 shadow-sm shadow-brand/5"
            )}
          >
            {/* Row header */}
            <div className="flex items-center gap-3 px-4 py-3 md:gap-4 md:px-5">
              {/* Day toggle */}
              {!readOnly && (
                <Switch
                  size="sm"
                  checked={isActive}
                  onCheckedChange={(on) => toggleDay(key, on)}
                />
              )}

              {/* Day label */}
              <div className="min-w-[5rem] md:min-w-[6.5rem]">
                <p
                  className={cn(
                    "text-sm font-semibold transition-colors",
                    isActive ? "text-brand-dark" : "text-brand-subtext/50"
                  )}
                >
                  <span className="hidden md:inline">{label}</span>
                  <span className="md:hidden">{short}</span>
                </p>
              </div>

              {/* Slot pills or "Unavailable" */}
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                {isActive ? (
                  slots.map((slot, index) => (
                    <button
                      key={index}
                      onClick={() =>
                        !readOnly &&
                        setExpandedDay(isExpanded ? null : key)
                      }
                      className={cn(
                        "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium tabular-nums transition-all",
                        isExpanded
                          ? "border-brand/30 bg-brand/8 text-brand-dark"
                          : "border-border/20 bg-brand-bg/40 text-brand-dark/80 hover:border-brand/20 hover:bg-brand/5"
                      )}
                    >
                      <span>{slot.start}</span>
                      <span className="text-brand-subtext/40">–</span>
                      <span>{slot.end}</span>
                    </button>
                  ))
                ) : (
                  <span className="text-xs text-brand-subtext/40">
                    Unavailable
                  </span>
                )}
              </div>

              {/* Actions */}
              {!readOnly && isActive && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() =>
                      setCopyFrom(copyFrom === key ? null : key)
                    }
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-lg transition-colors",
                      copyFrom === key
                        ? "bg-brand text-white"
                        : "text-brand-subtext/30 hover:bg-brand-bg hover:text-brand-subtext/60"
                    )}
                    title="Copy to other days"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() =>
                      setExpandedDay(isExpanded ? null : key)
                    }
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-brand-subtext/30 transition-colors hover:bg-brand-bg hover:text-brand-subtext/60"
                  >
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 transition-transform",
                        isExpanded && "rotate-180"
                      )}
                    />
                  </button>
                </div>
              )}
            </div>

            {/* Expanded slot editor */}
            <AnimatePresence>
              {isExpanded && isActive && !readOnly && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-2 border-t border-border/10 px-4 py-3 md:px-5">
                    {slots.map((slot, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-2 rounded-xl bg-brand-bg/30 px-3 py-2"
                      >
                        <div className="h-6 w-0.5 rounded-full bg-brand/40" />
                        <Input
                          type="time"
                          value={slot.start}
                          onChange={(e) =>
                            updateSlot(key, index, "start", e.target.value)
                          }
                          className="h-8 w-[7.5rem] text-xs"
                        />
                        <span className="text-xs text-brand-subtext/40">
                          to
                        </span>
                        <Input
                          type="time"
                          value={slot.end}
                          onChange={(e) =>
                            updateSlot(key, index, "end", e.target.value)
                          }
                          className="h-8 w-[7.5rem] text-xs"
                        />
                        <button
                          onClick={() => removeSlot(key, index)}
                          className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-brand-subtext/30 transition-colors hover:bg-red-50 hover:text-red-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => addSlot(key)}
                      className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border/30 py-2 text-xs font-medium text-brand-subtext/50 transition-colors hover:border-brand/30 hover:text-brand"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add time slot
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
}

/* ─── Mobile single-day view ─── */

interface MobileDayViewProps {
  weekly: WeeklySchedule;
  onChange: (weekly: WeeklySchedule) => void;
  className?: string;
}

export function MobileDayView({
  weekly,
  onChange,
  className,
}: MobileDayViewProps) {
  const [activeDay, setActiveDay] = useState<keyof WeeklySchedule>("mon");

  function addSlot() {
    const existing = weekly[activeDay];
    if (existing.length === 0) {
      onChange({ ...weekly, [activeDay]: [{ start: "09:00", end: "17:00" }] });
      return;
    }
    const lastEnd = existing[existing.length - 1].end;
    const [h] = lastEnd.split(":").map(Number);
    if (h >= 22) {
      onChange({ ...weekly, [activeDay]: [{ start: "06:00", end: "08:00" }, ...existing] });
      return;
    }
    const newStart = `${String(h + 1).padStart(2, "0")}:00`;
    const newEnd = `${String(Math.min(h + 4, 23)).padStart(2, "0")}:00`;
    onChange({
      ...weekly,
      [activeDay]: [...existing, { start: newStart, end: newEnd }],
    });
  }

  function updateSlot(index: number, field: "start" | "end", value: string) {
    onChange({
      ...weekly,
      [activeDay]: weekly[activeDay].map((s, i) =>
        i === index ? { ...s, [field]: value } : s
      ),
    });
  }

  function removeSlot(index: number) {
    onChange({
      ...weekly,
      [activeDay]: weekly[activeDay].filter((_, i) => i !== index),
    });
  }

  function copyToWeekdays() {
    const source = weekly[activeDay];
    const updated = { ...weekly };
    for (const d of DAYS) {
      if (!["sat", "sun"].includes(d.key) && d.key !== activeDay) {
        updated[d.key] = source.map((s) => ({ ...s }));
      }
    }
    onChange(updated);
  }

  const slots = weekly[activeDay];
  const dayInfo = DAYS.find((d) => d.key === activeDay)!;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Day picker */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {DAYS.map(({ key, short }) => {
          const active = key === activeDay;
          const hasSlots = weekly[key].length > 0;
          return (
            <button
              key={key}
              onClick={() => setActiveDay(key)}
              className={cn(
                "relative flex min-w-[3rem] flex-col items-center rounded-xl px-3 py-2.5 text-xs font-semibold transition-all",
                active
                  ? "bg-brand text-white shadow-md shadow-brand/20"
                  : "bg-brand-bg/50 text-brand-subtext hover:bg-brand-bg"
              )}
            >
              {short}
              {hasSlots && !active && (
                <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
              )}
            </button>
          );
        })}
      </div>

      {/* Day header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-brand-dark">
            {dayInfo.label}
          </p>
          <p className="text-xs text-brand-subtext">
            {slots.length > 0
              ? `${slots.length} time slot${slots.length > 1 ? "s" : ""}`
              : "No hours set"}
          </p>
        </div>
        <div className="flex gap-2">
          {slots.length > 0 && (
            <Button size="sm" variant="outline" onClick={copyToWeekdays}>
              <Copy className="h-3.5 w-3.5" /> Copy to weekdays
            </Button>
          )}
          <Button size="sm" onClick={addSlot}>
            <Plus className="h-3.5 w-3.5" /> Add slot
          </Button>
        </div>
      </div>

      {/* Slot cards */}
      <div className="space-y-2.5">
        {slots.length === 0 ? (
          <button
            onClick={addSlot}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border/30 py-10 transition-colors hover:border-brand/30 hover:bg-brand/[0.02]"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand/10">
              <Plus className="h-5 w-5 text-brand" />
            </div>
            <span className="text-sm font-medium text-brand-subtext">
              Add your first time slot
            </span>
          </button>
        ) : (
          <AnimatePresence>
            {slots.map((slot, index) => (
              <motion.div
                key={`${activeDay}-${index}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ delay: index * 0.05 }}
                className="flex items-center gap-3 rounded-2xl border border-border/20 bg-white px-4 py-3 shadow-sm"
              >
                <div className="h-8 w-1 rounded-full bg-brand" />
                <div className="flex flex-1 items-center gap-2">
                  <Input
                    type="time"
                    value={slot.start}
                    onChange={(e) =>
                      updateSlot(index, "start", e.target.value)
                    }
                    className="h-9 flex-1 text-sm"
                  />
                  <span className="text-xs font-medium text-brand-subtext/50">
                    to
                  </span>
                  <Input
                    type="time"
                    value={slot.end}
                    onChange={(e) =>
                      updateSlot(index, "end", e.target.value)
                    }
                    className="h-9 flex-1 text-sm"
                  />
                </div>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  className="shrink-0 text-brand-subtext/30 hover:bg-red-50 hover:text-red-500"
                  onClick={() => removeSlot(index)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
