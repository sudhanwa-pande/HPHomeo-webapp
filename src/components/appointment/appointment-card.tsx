"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Calendar,
  Clock,
  CreditCard,
  Loader2,
  MapPin,
  MonitorPlay,
  MoreHorizontal,
  RefreshCw,
  Video,
  CalendarClock,
  X,
  Download,
  Receipt,
  Star,
  ClipboardList,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AppointmentStatusBadge } from "./appointment-status-badge";
import { DoctorAvatar } from "./doctor-info-card";
import {
  formatDate,
  formatTime,
  formatRelativeTime,
  canCancel,
  canJoinCall,
  canReschedule,
} from "@/lib/appointment-utils";
import { useCountdown } from "@/hooks/use-countdown";
import { cn } from "@/lib/utils";
import type { PatientAppointment } from "@/types/patient";
import type { StatusVariant } from "@/components/doctor/ui/status-badge";

interface AppointmentCardProps {
  appointment: PatientAppointment;
  variant?: "patient" | "doctor";
  onPay?: (apt: PatientAppointment) => void;
  onCancel?: (id: string) => void;
  onReschedule?: (id: string) => void;
  isPaying?: boolean;
  className?: string;
}

export function AppointmentCard({
  appointment: apt,
  variant = "patient",
  onPay,
  onCancel,
  onReschedule,
  isPaying,
  className,
}: AppointmentCardProps) {
  const router = useRouter();
  const joinable = canJoinCall(apt);
  const cancellable = canCancel(apt);
  const reschedulable = canReschedule(apt);
  const needsPay =
    apt.status === "pending_payment" && apt.payment_choice === "pay_now";
  const isUpcoming =
    apt.status === "confirmed" &&
    new Date(apt.scheduled_at).getTime() > Date.now();
  const countdown = useCountdown(isUpcoming ? apt.scheduled_at : null);

  const handleClick = () => {
    router.push(`/patient/appointments/${apt.appointment_id}`);
  };

  // Determine the left accent color based on status
  const accentColor =
    apt.status === "confirmed"
      ? "border-l-brand"
      : apt.status === "completed"
        ? "border-l-emerald-400"
        : apt.status === "pending_payment"
          ? "border-l-amber-400"
          : apt.status === "cancelled" || apt.status === "no_show"
            ? "border-l-gray-300"
            : "border-l-gray-200";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
      onClick={handleClick}
      className={cn(
        "group relative cursor-pointer overflow-hidden rounded-2xl border border-gray-200/60 border-l-[3px] bg-white p-4 transition-shadow duration-200 hover:shadow-[0_8px_30px_rgba(15,23,42,0.07)]",
        accentColor,
        className,
      )}
    >
      {/* Pending payment shimmer overlay */}
      {needsPay && (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-amber-50/40 via-transparent to-amber-50/40" />
      )}

      {/* Top row: Doctor info + status */}
      <div className="relative flex items-start gap-3">
        <DoctorAvatar name={apt.doctor_name} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-900">
                {apt.doctor_name}
              </p>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500">
                {apt.mode === "online" ? (
                  <MonitorPlay className="h-3 w-3 text-brand" />
                ) : (
                  <MapPin className="h-3 w-3" />
                )}
                <span>{apt.mode === "online" ? "Online" : "Walk-in"}</span>
                {apt.appointment_type === "follow_up" && (
                  <>
                    <span className="text-gray-300">·</span>
                    <span className="font-medium text-violet-600">Follow-up</span>
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
      <div className="mt-3 flex items-center gap-3 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {formatDate(apt.scheduled_at)}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {formatTime(apt.scheduled_at)}
        </span>
        <span className="ml-auto font-semibold text-gray-800">
          {apt.consultation_fee > 0 ? `₹${apt.consultation_fee}` : "Free"}
        </span>
      </div>

      {/* Indicators row: countdown, prescription badge, urgency */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {/* Countdown chip for upcoming appointments */}
        {isUpcoming && !countdown.isExpired && countdown.totalSeconds < 86400 && (
          <span className="inline-flex items-center gap-1 rounded-md bg-brand/8 px-2 py-0.5 text-[11px] font-semibold text-brand">
            <Clock className="h-2.5 w-2.5" />
            in {countdown.label}
          </span>
        )}

        {/* Appointment time reached */}
        {isUpcoming && countdown.isExpired && (
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
            <Clock className="h-2.5 w-2.5" />
            Now
          </span>
        )}

        {/* Pending payment urgency */}
        {needsPay && (
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
            <AlertCircle className="h-2.5 w-2.5" />
            Payment due
          </span>
        )}

        {/* Prescription ready badge */}
        {apt.status === "completed" && (
          <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-600">
            <ClipboardList className="h-2.5 w-2.5" />
            Rx ready
          </span>
        )}

        {/* Review badge */}
        {apt.review && (
          <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-600">
            <Star className="h-2.5 w-2.5 fill-amber-500" />
            {apt.review.rating}
          </span>
        )}

        {/* Relative time (non-upcoming) */}
        {!isUpcoming && !needsPay && (
          <span className="text-[11px] text-gray-400">
            {formatRelativeTime(apt.scheduled_at)}
          </span>
        )}
      </div>

      {/* Bottom row: Actions */}
      <div className="mt-3 flex items-center justify-end gap-1.5">
        <div
          className="flex items-center gap-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Primary CTA */}
          {joinable && (
            <Button
              size="sm"
              onClick={() =>
                router.push(
                  `/patient/appointments/${apt.appointment_id}/waiting-room`,
                )
              }
              className="h-7 gap-1 rounded-lg bg-emerald-600 px-3 text-[11px] font-semibold shadow-sm shadow-emerald-600/20 hover:bg-emerald-700"
            >
              <Video className="h-3 w-3" />
              Join
            </Button>
          )}

          {needsPay && onPay && (
            <Button
              size="sm"
              onClick={() => onPay(apt)}
              disabled={isPaying}
              className="h-7 gap-1 rounded-lg bg-brand px-3 text-[11px] font-semibold hover:bg-brand/90"
            >
              {isPaying ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <CreditCard className="h-3 w-3" />
              )}
              Pay Now
            </Button>
          )}

          {/* Follow-up indicator */}
          {apt.is_follow_up_eligible && !apt.follow_up_used && (
            <span className="rounded-md bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-600">
              Follow-up available
            </span>
          )}

          {/* Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200/60 bg-white text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[160px] rounded-xl">
              <DropdownMenuItem
                onClick={() =>
                  router.push(`/patient/appointments/${apt.appointment_id}`)
                }
              >
                View Details
              </DropdownMenuItem>

              {apt.status === "completed" && (
                <DropdownMenuItem
                  onClick={() =>
                    router.push(
                      `/patient/prescriptions?appointment=${apt.appointment_id}`,
                    )
                  }
                >
                  <Download className="mr-2 h-3.5 w-3.5" />
                  Prescription
                </DropdownMenuItem>
              )}

              {(apt.payment_status === "paid" ||
                apt.payment_status === "refunded") && (
                <DropdownMenuItem
                  onClick={() =>
                    router.push(
                      `/patient/receipts?appointment=${apt.appointment_id}`,
                    )
                  }
                >
                  <Receipt className="mr-2 h-3.5 w-3.5" />
                  Receipt
                </DropdownMenuItem>
              )}

              {apt.is_follow_up_eligible && !apt.follow_up_used && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() =>
                      router.push(
                        `/patient/book/${apt.doctor_id}?followUp=${apt.appointment_id}`,
                      )
                    }
                  >
                    <RefreshCw className="mr-2 h-3.5 w-3.5" />
                    Book Follow-up
                  </DropdownMenuItem>
                </>
              )}

              {reschedulable && onReschedule && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onReschedule(apt.appointment_id)}>
                    <CalendarClock className="mr-2 h-3.5 w-3.5" />
                    Reschedule
                  </DropdownMenuItem>
                </>
              )}

              {cancellable && onCancel && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onCancel(apt.appointment_id)}
                    className="text-red-500 focus:bg-red-50 focus:text-red-600"
                  >
                    <X className="mr-2 h-3.5 w-3.5" />
                    Cancel
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </motion.div>
  );
}
