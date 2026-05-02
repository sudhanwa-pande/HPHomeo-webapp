"use client";

import { motion } from "framer-motion";
import {
  Calendar,
  CheckCircle2,
  Ban,
  MapPin,
  MonitorPlay,
  Star,
} from "lucide-react";
import { format, parseISO } from "date-fns";

import { AppointmentStatusBadge } from "@/components/appointment/appointment-status-badge";
import { formatRelativeTime } from "@/lib/appointment-utils";
import { cn } from "@/lib/utils";
import type { DoctorAppointment } from "@/types/doctor";
import type { StatusVariant } from "@/components/doctor/ui/status-badge";

interface DoctorAppointmentCardProps {
  appointment: DoctorAppointment;
  onClick?: (id: string) => void;
  className?: string;
}

export function DoctorAppointmentCard({
  appointment: apt,
  onClick,
  className,
}: DoctorAppointmentCardProps) {
  const initials =
    apt.patient.full_name
      ?.split(" ")
      .slice(0, 2)
      .map((n) => n[0])
      .join("")
      .toUpperCase() || "P";

  const canComplete =
    apt.status === "confirmed" && apt.prescription_status === "final";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
      onClick={() => onClick?.(apt.appointment_id)}
      className={cn(
        "group cursor-pointer rounded-2xl border border-border/60 bg-white p-4 transition-shadow duration-200 hover:shadow-[0_8px_30px_rgba(15,23,42,0.06)]",
        className,
      )}
    >
      {/* Top row: Patient info + status */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-brand/10 bg-brand/10 text-[11px] font-bold text-brand">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-brand-dark">
                {apt.patient.full_name}
              </p>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-brand-subtext">
                {apt.patient.age ? `${apt.patient.age}y` : ""}
                {apt.patient.sex ? ` / ${apt.patient.sex}` : ""}
                <span className="text-border">·</span>
                {apt.mode === "online" ? (
                  <MonitorPlay className="h-3 w-3 text-brand" />
                ) : (
                  <MapPin className="h-3 w-3" />
                )}
                <span>{apt.mode === "online" ? "Online" : "Walk-in"}</span>
                {apt.appointment_type === "follow_up" && (
                  <>
                    <span className="text-border">·</span>
                    <span className="text-violet-600">Follow-up</span>
                  </>
                )}
              </div>
            </div>
            <AppointmentStatusBadge
              status={apt.status as StatusVariant}
              size="xs"
            />
          </div>
        </div>
      </div>

      {/* Middle row: Date, time, fee */}
      <div className="mt-3 flex items-center gap-4 text-xs text-brand-subtext">
        <span className="flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {format(parseISO(apt.scheduled_at), "dd MMM yyyy")}
        </span>
        <span>{format(parseISO(apt.scheduled_at), "hh:mm a")}</span>
        <span className="ml-auto font-medium text-brand-dark">
          ₹{(apt.fee || 0).toLocaleString("en-IN")}
        </span>
      </div>

      {/* Bottom row: Prescription status + relative time + indicators */}
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[11px] text-brand-subtext/60">
          {formatRelativeTime(apt.scheduled_at)}
        </span>

        <div className="flex items-center gap-2">
          {apt.prescription_status === "final" && (
            <span className="flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
              <CheckCircle2 className="h-3 w-3" />
              Rx Finalized
            </span>
          )}
          {apt.prescription_status === "draft" && (
            <span className="flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
              Rx Draft
            </span>
          )}
          {canComplete && (
            <span className="flex items-center gap-1 rounded-lg bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-brand">
              Ready to complete
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export function DoctorAppointmentCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border/60 bg-white p-4">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 animate-pulse rounded-2xl bg-gray-100" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-32 animate-pulse rounded-lg bg-gray-100" />
          <div className="h-3 w-24 animate-pulse rounded-lg bg-gray-100" />
        </div>
        <div className="h-5 w-16 animate-pulse rounded-full bg-gray-100" />
      </div>
      <div className="mt-3 flex items-center gap-4">
        <div className="h-3 w-20 animate-pulse rounded bg-gray-100" />
        <div className="h-3 w-12 animate-pulse rounded bg-gray-100" />
        <div className="ml-auto h-3 w-10 animate-pulse rounded bg-gray-100" />
      </div>
      <div className="mt-3 flex items-center justify-between">
        <div className="h-3 w-16 animate-pulse rounded bg-gray-100" />
        <div className="h-4 w-20 animate-pulse rounded bg-gray-100" />
      </div>
    </div>
  );
}
