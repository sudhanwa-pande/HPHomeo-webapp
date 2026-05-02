"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, Sunrise, Sun, Sunset, Sparkles } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/loading";
import api from "@/lib/api";
import {
  toDateString,
  formatDateLabel,
  formatSlotTime,
  groupSlotsByTimeOfDay,
  generateDateOptions,
} from "@/lib/appointment-utils";
import { cn } from "@/lib/utils";

const TIME_ICONS = {
  sunrise: Sunrise,
  sun: Sun,
  sunset: Sunset,
};

interface SlotPickerProps {
  doctorId: string;
  selectedDate: Date;
  selectedSlot: string | null;
  onDateChange: (date: Date) => void;
  onSlotChange: (slot: string) => void;
  variant?: "week" | "calendar" | "both";
  groupByTimeOfDay?: boolean;
  showSuggestions?: boolean;
  maxDate?: Date;
  className?: string;
}

export function SlotPicker({
  doctorId,
  selectedDate,
  selectedSlot,
  onDateChange,
  onSlotChange,
  variant = "both",
  groupByTimeOfDay = true,
  showSuggestions = false,
  maxDate,
  className,
}: SlotPickerProps) {
  const dateString = toDateString(selectedDate);

  const { data: slotsData, isLoading: slotsLoading } = useQuery({
    queryKey: ["public", "doctor", doctorId, "slots", dateString],
    queryFn: async ({ signal }) => {
      const { data } = await api.get<{ day: string; slots: string[] }>(
        `/public/doctors/${doctorId}/slots`,
        { params: { day: dateString }, signal },
      );
      return data;
    },
    enabled: !!doctorId,
  });

  const slots = slotsData?.slots || [];
  const slotGroups = useMemo(
    () => (groupByTimeOfDay ? groupSlotsByTimeOfDay(slots) : null),
    [slots, groupByTimeOfDay],
  );

  // Suggestion slots (next available across 3 days)
  const { data: suggestions } = useQuery({
    queryKey: ["public", "doctor", doctorId, "slot-suggestions"],
    queryFn: async () => {
      const results: string[] = [];
      const today = new Date();
      for (let i = 0; i < 3 && results.length < 5; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        const { data } = await api.get<{ day: string; slots: string[] }>(
          `/public/doctors/${doctorId}/slots`,
          { params: { day: toDateString(d) } },
        );
        for (const slot of data.slots) {
          if (results.length >= 5) break;
          if (new Date(slot).getTime() > Date.now()) results.push(slot);
        }
      }
      return results;
    },
    enabled: showSuggestions && !!doctorId,
  });

  const weekDates = useMemo(() => generateDateOptions(7), []);

  const handleCalendarSelect = (date: Date | undefined) => {
    if (date) {
      onDateChange(date);
      onSlotChange("");
    }
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className={cn("space-y-4", className)}>
      {/* Suggestions */}
      {showSuggestions && suggestions && suggestions.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-gray-500">
            <Sparkles className="h-3.5 w-3.5 text-brand" />
            Next available
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((slot) => {
              const d = new Date(slot);
              return (
                <button
                  key={slot}
                  onClick={() => {
                    onDateChange(d);
                    onSlotChange(slot);
                  }}
                  className={cn(
                    "rounded-xl border-2 px-3 py-2 text-xs font-medium transition-all",
                    selectedSlot === slot
                      ? "border-brand bg-brand/5 text-brand shadow-sm"
                      : "border-gray-200/60 text-gray-700 hover:border-brand/30",
                  )}
                >
                  <span className="block font-semibold">
                    {formatDateLabel(d)}
                  </span>
                  <span className="text-[11px]">{formatSlotTime(slot)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Date selection */}
      {(variant === "week" || variant === "both") && (
        <div>
          <p className="mb-2 text-xs font-semibold text-gray-500">
            Quick select
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {weekDates.map((date) => {
              const isSelected =
                date.toDateString() === selectedDate.toDateString();
              const isPast = maxDate && date > maxDate;
              return (
                <button
                  key={date.toISOString()}
                  onClick={() => {
                    onDateChange(date);
                    onSlotChange("");
                  }}
                  disabled={!!isPast}
                  className={cn(
                    "flex shrink-0 flex-col items-center rounded-xl border-2 px-3 py-2 transition-all duration-200",
                    isSelected
                      ? "border-brand bg-brand/5 text-brand shadow-lg shadow-brand/10"
                      : isPast
                        ? "border-gray-100 text-gray-300 cursor-not-allowed"
                        : "border-gray-200/60 text-gray-500 hover:border-brand/30",
                  )}
                >
                  <span className="text-[10px] font-semibold uppercase">
                    {date.toLocaleDateString("en-IN", { weekday: "short" })}
                  </span>
                  <span className="text-lg font-bold">{date.getDate()}</span>
                  <span className="text-[10px]">
                    {date.toLocaleDateString("en-IN", { month: "short" })}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {(variant === "calendar" || variant === "both") && (
        <div>
          {variant === "both" && (
            <p className="mb-2 text-xs font-semibold text-gray-500">
              Or pick from calendar
            </p>
          )}
          <div className="rounded-2xl border border-gray-200/60 bg-white p-3">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={handleCalendarSelect}
              disabled={(date) => {
                const d = new Date(date);
                d.setHours(0, 0, 0, 0);
                if (d < today) return true;
                if (maxDate && d > maxDate) return true;
                return false;
              }}
              className="mx-auto"
            />
          </div>
        </div>
      )}

      {/* Time slots */}
      <div>
        <p className="mb-2 text-xs font-semibold text-gray-500">
          Available slots for {formatDateLabel(selectedDate)}
        </p>

        {slotsLoading ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 rounded-xl" />
            ))}
          </div>
        ) : slots.length === 0 ? (
          <div className="rounded-xl bg-gray-50 py-8 text-center ring-1 ring-gray-100">
            <Clock className="mx-auto mb-2 h-6 w-6 text-gray-300" />
            <p className="text-sm text-gray-500">No slots available</p>
            <p className="text-xs text-gray-400">Try another date</p>
          </div>
        ) : groupByTimeOfDay && slotGroups ? (
          <div className="space-y-4">
            {slotGroups.map((group) => {
              const Icon = TIME_ICONS[group.icon];
              return (
                <div key={group.label}>
                  <div className="mb-2 flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5 text-gray-400" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      {group.label}
                    </span>
                    <span className="text-[10px] text-gray-300">
                      ({group.slots.length})
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                    {group.slots.map((slot) => (
                      <button
                        key={slot}
                        onClick={() => onSlotChange(slot)}
                        className={cn(
                          "rounded-xl border-2 py-2.5 text-sm font-medium transition-all",
                          selectedSlot === slot
                            ? "border-brand bg-brand/5 text-brand shadow-sm"
                            : "border-gray-200/60 text-gray-900 hover:border-brand/30",
                        )}
                      >
                        {formatSlotTime(slot)}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
            {slots.map((slot) => (
              <button
                key={slot}
                onClick={() => onSlotChange(slot)}
                className={cn(
                  "rounded-xl border-2 py-2.5 text-sm font-medium transition-all",
                  selectedSlot === slot
                    ? "border-brand bg-brand/5 text-brand shadow-sm"
                    : "border-gray-200/60 text-gray-900 hover:border-brand/30",
                )}
              >
                {formatSlotTime(slot)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
