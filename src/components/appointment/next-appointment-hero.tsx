"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Calendar, Clock, MapPin, MonitorPlay, Video, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DoctorAvatar } from "./doctor-info-card";
import { AppointmentStatusBadge } from "./appointment-status-badge";
import { useCountdown } from "@/hooks/use-countdown";
import { formatDate, formatTime, canJoinCall } from "@/lib/appointment-utils";
import { cn } from "@/lib/utils";
import type { PatientAppointment } from "@/types/patient";
import type { StatusVariant } from "@/components/doctor/ui/status-badge";

interface NextAppointmentHeroProps {
  appointment: PatientAppointment;
  className?: string;
}

function CountdownSegment({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-lg font-bold tabular-nums leading-none text-gray-900">
        {String(value).padStart(2, "0")}
      </span>
      <span className="mt-1 text-[10px] font-medium uppercase tracking-wider text-gray-400">
        {label}
      </span>
    </div>
  );
}

export function NextAppointmentHero({
  appointment: apt,
  className,
}: NextAppointmentHeroProps) {
  const router = useRouter();
  const countdown = useCountdown(apt.scheduled_at);
  const joinable = canJoinCall(apt);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className={cn(
        "relative overflow-hidden rounded-2xl border border-gray-200/60 bg-white",
        className,
      )}
    >
      {/* Subtle gradient background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(88,155,255,0.06),transparent_50%)]" />

      <div className="relative p-5 sm:p-6">
        {/* Header badge */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
              Next Appointment
            </span>
          </div>
          <AppointmentStatusBadge
            status={apt.status as StatusVariant}
            size="xs"
          />
        </div>

        {/* Main content */}
        <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          {/* Doctor info */}
          <div className="flex items-center gap-4">
            <DoctorAvatar name={apt.doctor_name} size="lg" />
            <div>
              <p className="text-base font-bold tracking-tight text-gray-900">
                {apt.doctor_name}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {formatDate(apt.scheduled_at)}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatTime(apt.scheduled_at)}
                </span>
                <span className="flex items-center gap-1">
                  {apt.mode === "online" ? (
                    <MonitorPlay className="h-3 w-3 text-brand" />
                  ) : (
                    <MapPin className="h-3 w-3" />
                  )}
                  {apt.mode === "online" ? "Online" : "Walk-in"}
                </span>
              </div>
            </div>
          </div>

          {/* Countdown + CTA */}
          <div className="flex flex-col items-end gap-3">
            {/* Segmented countdown */}
            {!countdown.isExpired && (
              <div className="flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-2.5 ring-1 ring-gray-100">
                {countdown.days > 0 && (
                  <>
                    <CountdownSegment value={countdown.days} label="days" />
                    <span className="text-lg font-light text-gray-300">:</span>
                  </>
                )}
                <CountdownSegment value={countdown.hours} label="hrs" />
                <span className="text-lg font-light text-gray-300">:</span>
                <CountdownSegment value={countdown.minutes} label="min" />
                {countdown.days === 0 && (
                  <>
                    <span className="text-lg font-light text-gray-300">:</span>
                    <CountdownSegment value={countdown.seconds} label="sec" />
                  </>
                )}
              </div>
            )}

            {countdown.isExpired && apt.status === "confirmed" && (
              <div className="flex items-center gap-1.5 rounded-xl bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600" />
                </span>
                Ready to start
              </div>
            )}

            {/* Action button */}
            <div className="flex items-center gap-3">
              {apt.consultation_fee > 0 && (
                <span className="text-sm font-bold text-gray-900">
                  ₹{apt.consultation_fee}
                </span>
              )}
              {joinable ? (
                <Button
                  onClick={() =>
                    router.push(
                      `/patient/appointments/${apt.appointment_id}/waiting-room`,
                    )
                  }
                  className="gap-1.5 rounded-xl bg-emerald-600 shadow-lg shadow-emerald-600/15 hover:bg-emerald-700"
                >
                  <Video className="h-4 w-4" />
                  Join Call
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() =>
                    router.push(`/patient/appointments/${apt.appointment_id}`)
                  }
                  className="gap-1.5 rounded-xl"
                >
                  View Details
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
