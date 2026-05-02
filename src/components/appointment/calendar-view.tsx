"use client";

import { useState, useMemo } from "react";
import { Calendar as CalendarIcon, Clock } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { AppointmentCard } from "./appointment-card";
import { formatDateLabel, formatTime } from "@/lib/appointment-utils";
import { cn } from "@/lib/utils";
import type { PatientAppointment } from "@/types/patient";

interface CalendarViewProps {
  appointments: PatientAppointment[];
  onPay?: (apt: PatientAppointment) => void;
  onCancel?: (id: string) => void;
  onReschedule?: (id: string) => void;
  isPaying?: boolean;
  onFindDoctor?: () => void;
  className?: string;
}

// Map status to dot color for the calendar
const STATUS_DOT_CLASS: Record<string, string> = {
  confirmed: "bg-brand",
  pending_payment: "bg-amber-400",
  completed: "bg-emerald-500",
  cancelled: "bg-gray-300",
  no_show: "bg-gray-300",
};

export function CalendarView({
  appointments,
  onPay,
  onCancel,
  onReschedule,
  isPaying,
  onFindDoctor,
  className,
}: CalendarViewProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  // Dates that have appointments, with status for coloring
  const appointmentsByDate = useMemo(() => {
    const map = new Map<string, PatientAppointment[]>();
    for (const apt of appointments) {
      const key = new Date(apt.scheduled_at).toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(apt);
    }
    return map;
  }, [appointments]);

  const appointmentDates = useMemo(() => {
    return new Set(appointmentsByDate.keys());
  }, [appointmentsByDate]);

  // Appointments for selected date, sorted by time
  const dayAppointments = useMemo(() => {
    const key = selectedDate.toDateString();
    return (appointmentsByDate.get(key) || []).sort(
      (a, b) =>
        new Date(a.scheduled_at).getTime() -
        new Date(b.scheduled_at).getTime(),
    );
  }, [appointmentsByDate, selectedDate]);

  // Count by status for selected date
  const dayCounts = useMemo(() => {
    const result = { confirmed: 0, completed: 0, cancelled: 0, pending: 0 };
    for (const apt of dayAppointments) {
      if (apt.status === "confirmed") result.confirmed++;
      else if (apt.status === "completed") result.completed++;
      else if (apt.status === "cancelled" || apt.status === "no_show") result.cancelled++;
      else if (apt.status === "pending_payment") result.pending++;
    }
    return result;
  }, [dayAppointments]);

  const handleSelect = (date: Date | undefined) => {
    if (date) setSelectedDate(date);
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Calendar */}
      <div className="rounded-2xl border border-gray-200/60 bg-white p-4">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={handleSelect}
          modifiers={{
            hasAppointment: (date) => appointmentDates.has(date.toDateString()),
          }}
          modifiersClassNames={{
            hasAppointment: "appointment-dot",
          }}
          className="mx-auto"
        />
      </div>

      {/* Day detail */}
      <div className="rounded-2xl border border-gray-200/60 bg-white p-4">
        {/* Day header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-gray-400" />
            <p className="text-sm font-semibold text-gray-900">
              {formatDateLabel(selectedDate)}
            </p>
          </div>
          {dayAppointments.length > 0 && (
            <div className="flex items-center gap-1.5">
              {dayCounts.confirmed > 0 && (
                <span className="flex items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-semibold text-brand">
                  {dayCounts.confirmed} active
                </span>
              )}
              {dayCounts.completed > 0 && (
                <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
                  {dayCounts.completed} done
                </span>
              )}
              {dayCounts.pending > 0 && (
                <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-600">
                  {dayCounts.pending} pending
                </span>
              )}
            </div>
          )}
        </div>

        {/* Day appointments */}
        {dayAppointments.length === 0 ? (
          <div className="mt-4 flex flex-col items-center rounded-xl border border-dashed border-gray-200/60 bg-gray-50/30 py-10 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
              <CalendarIcon className="h-4 w-4 text-gray-300" />
            </div>
            <p className="mt-3 text-sm font-medium text-gray-500">
              No appointments on this day
            </p>
            {onFindDoctor && (
              <button
                onClick={onFindDoctor}
                className="mt-2 text-xs font-medium text-brand hover:underline"
              >
                Book an appointment
              </button>
            )}
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {dayAppointments.map((apt) => (
              <AppointmentCard
                key={apt.appointment_id}
                appointment={apt}
                onPay={onPay}
                onCancel={onCancel}
                onReschedule={onReschedule}
                isPaying={isPaying}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
