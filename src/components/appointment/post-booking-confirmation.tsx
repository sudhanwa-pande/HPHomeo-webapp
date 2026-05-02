"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  CalendarPlus,
  CheckCircle2,
  ArrowRight,
  Copy,
  Check,
  Share2,
  Shield,
  MonitorPlay,
  MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate, formatTime } from "@/lib/appointment-utils";
import { cn } from "@/lib/utils";

interface PostBookingConfirmationProps {
  appointmentId: string;
  doctorName: string;
  scheduledAt: string;
  mode: "online" | "walk_in";
  fee: number;
  appointmentType: "new" | "follow_up";
  isFollowUp: boolean;
  paidOnline?: boolean;
}

function generateGoogleCalendarUrl({
  doctorName,
  scheduledAt,
  mode,
}: {
  doctorName: string;
  scheduledAt: string;
  mode: string;
}): string {
  const start = new Date(scheduledAt);
  const end = new Date(start.getTime() + 30 * 60000);

  const fmt = (d: Date) =>
    d
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Appointment with ${doctorName}`,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: `${mode === "online" ? "Online video consultation" : "Walk-in visit"} with ${doctorName}`,
  });

  return `https://calendar.google.com/calendar/event?${params.toString()}`;
}

function generateICSContent({
  doctorName,
  scheduledAt,
  mode,
}: {
  doctorName: string;
  scheduledAt: string;
  mode: string;
}): string {
  const start = new Date(scheduledAt);
  const end = new Date(start.getTime() + 30 * 60000);

  const fmt = (d: Date) =>
    d
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:Appointment with ${doctorName}`,
    `DESCRIPTION:${mode === "online" ? "Online video consultation" : "Walk-in visit"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function downloadICS(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function PostBookingConfirmation({
  appointmentId,
  doctorName,
  scheduledAt,
  mode,
  fee,
  appointmentType,
  isFollowUp,
  paidOnline,
}: PostBookingConfirmationProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const refCode = appointmentId.slice(0, 8).toUpperCase();

  const handleCopy = async () => {
    await navigator.clipboard.writeText(refCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareText = `Appointment booked with ${doctorName} on ${formatDate(scheduledAt)} at ${formatTime(scheduledAt)}. Ref: ${refCode}`;

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Appointment Confirmed", text: shareText });
      } catch {
        // User cancelled share
      }
    } else {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="mx-auto max-w-lg"
    >
      {/* Success header */}
      <div className="rounded-2xl border border-gray-200/60 bg-white p-8 text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.15, type: "spring", stiffness: 200, damping: 12 }}
          className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 ring-8 ring-emerald-50/50"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.3, type: "spring", stiffness: 300 }}
          >
            <CheckCircle2 className="h-10 w-10 text-emerald-600" />
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <h2 className="text-xl font-bold tracking-tight text-gray-900">
            {isFollowUp ? "Follow-up " : ""}Appointment Confirmed
          </h2>
          <p className="mt-1.5 text-sm text-gray-500">
            {paidOnline
              ? "Payment received — you\u2019re all set!"
              : "Your appointment has been successfully booked"}
          </p>
        </motion.div>

        {/* Payment confirmation badge */}
        {paidOnline && fee > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="mx-auto mt-4 flex w-fit items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700"
          >
            <Shield className="h-4 w-4" />
            ₹{fee} paid successfully
          </motion.div>
        )}

        {/* Reference code */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="mx-auto mt-5 flex w-fit items-center gap-2 rounded-xl bg-gray-50 px-4 py-2.5 ring-1 ring-gray-100"
        >
          <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
            Ref
          </span>
          <span className="font-mono text-sm font-bold tracking-wider text-gray-900">
            {refCode}
          </span>
          <button
            onClick={handleCopy}
            className="ml-1 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        </motion.div>
      </div>

      {/* Summary card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="mt-3 rounded-2xl border border-gray-200/60 bg-white p-5"
      >
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Doctor</span>
            <span className="font-semibold text-gray-900">{doctorName}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Date</span>
            <span className="font-semibold text-gray-900">
              {formatDate(scheduledAt)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Time</span>
            <span className="font-semibold text-gray-900">
              {formatTime(scheduledAt)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Mode</span>
            <span className="flex items-center gap-1.5 font-semibold text-gray-900">
              {mode === "online" ? (
                <MonitorPlay className="h-3.5 w-3.5 text-brand" />
              ) : (
                <MapPin className="h-3.5 w-3.5 text-gray-400" />
              )}
              {mode === "online" ? "Online (Video)" : "Walk-in"}
            </span>
          </div>
          <div className="border-t border-gray-100 pt-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-gray-900">Total</span>
              <span className="text-base font-bold text-brand">
                {fee === 0 ? "Free" : `₹${fee}`}
              </span>
            </div>
            {fee > 0 && (
              <p className="mt-1 text-right text-[11px] text-gray-400">
                {paidOnline
                  ? "Paid via Razorpay"
                  : appointmentType === "follow_up"
                    ? "Follow-up consultation"
                    : "New consultation"}
              </p>
            )}
          </div>
        </div>
      </motion.div>

      {/* Notification info */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }}
        className="mt-3 rounded-2xl border border-gray-200/60 bg-white px-5 py-4"
      >
        <p className="text-center text-xs text-gray-500">
          Confirmation details have been sent via WhatsApp & email.
        </p>
      </motion.div>

      {/* Calendar + share actions */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="mt-3 grid grid-cols-3 gap-2"
      >
        <button
          onClick={() => {
            const url = generateGoogleCalendarUrl({
              doctorName,
              scheduledAt,
              mode,
            });
            window.open(url, "_blank");
          }}
          className="flex flex-col items-center gap-1.5 rounded-xl border border-gray-200/60 bg-white px-3 py-3.5 text-center transition-colors hover:bg-gray-50"
        >
          <CalendarPlus className="h-4.5 w-4.5 text-gray-500" />
          <span className="text-[11px] font-medium text-gray-600">
            Google Cal
          </span>
        </button>
        <button
          onClick={() => {
            const ics = generateICSContent({
              doctorName,
              scheduledAt,
              mode,
            });
            downloadICS(ics, `appointment-${appointmentId}.ics`);
          }}
          className="flex flex-col items-center gap-1.5 rounded-xl border border-gray-200/60 bg-white px-3 py-3.5 text-center transition-colors hover:bg-gray-50"
        >
          <CalendarPlus className="h-4.5 w-4.5 text-gray-500" />
          <span className="text-[11px] font-medium text-gray-600">
            Apple Cal
          </span>
        </button>
        <button
          onClick={handleShare}
          className="flex flex-col items-center gap-1.5 rounded-xl border border-gray-200/60 bg-white px-3 py-3.5 text-center transition-colors hover:bg-gray-50"
        >
          <Share2 className="h-4.5 w-4.5 text-gray-500" />
          <span className="text-[11px] font-medium text-gray-600">
            Share
          </span>
        </button>
      </motion.div>

      {/* Primary actions */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="mt-4 flex flex-col gap-2"
      >
        <Button
          onClick={() =>
            router.push(`/patient/appointments/${appointmentId}`)
          }
          className="gap-1.5 rounded-xl bg-brand hover:bg-brand/90"
        >
          View Appointment
          <ArrowRight className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          onClick={() => router.push("/patient/appointments")}
          className="text-gray-500"
        >
          Back to Appointments
        </Button>
      </motion.div>
    </motion.div>
  );
}
