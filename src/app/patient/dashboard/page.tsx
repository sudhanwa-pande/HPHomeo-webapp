"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  Calendar,
  CalendarClock,
  Clock,
  ClipboardList,
  CreditCard,
  Loader2,
  MapPin,
  RefreshCcw,
  Search,
  Sparkles,
  Video,
} from "lucide-react";

import { z } from "zod/v4";
import api from "@/lib/api";
import { usePatientAuth } from "@/stores/patient-auth";
import { AuthGuard } from "@/components/auth-guard";
import { PatientShell } from "@/components/patient/patient-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/loading";
import type {
  PatientAppointment,
  PatientAppointmentsResponse,
} from "@/types/patient";

/* ── API response schemas ── */

const AppointmentSchema = z.object({
  appointment_id: z.string(),
  scheduled_at: z.string(),
  status: z.enum(["pending_payment", "confirmed", "completed", "cancelled", "no_show"]),
  mode: z.enum(["online", "walk_in"]),
  doctor_name: z.string(),
  video_enabled: z.boolean(),
  is_follow_up_eligible: z.boolean(),
  follow_up_used: z.boolean(),
  follow_up_eligible_until: z.string().nullable().optional(),
  refund_status: z.enum(["none", "pending", "processing", "processed", "failed"]),
  payment_status: z.enum(["unpaid", "pending", "paid", "transferred", "refunded", "failed"]),
  consultation_fee: z.number(),
  duration_min: z.number(),
});

const AppointmentsResponseSchema = z.object({
  items: z.array(AppointmentSchema),
});

const PrescriptionsResponseSchema = z.union([
  z.array(z.object({ id: z.string() }).passthrough()),
  z.object({ items: z.array(z.object({ id: z.string() }).passthrough()) }),
]);

/* ── helpers ── */

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function isProfileIncomplete(
  patient: { full_name?: string; age?: number; sex?: string } | null,
) {
  if (!patient) return true;
  return !patient.full_name || !patient.age || !patient.sex;
}

function canJoinCall(apt: PatientAppointment): boolean {
  if (apt.mode !== "online" || !apt.video_enabled || apt.status !== "confirmed")
    return false;
  const now = Date.now();
  const scheduled = new Date(apt.scheduled_at).getTime();
  return now >= scheduled - 10 * 60 * 1000 && now <= scheduled + 30 * 60 * 1000;
}

function getCallWindowLabel(apt: PatientAppointment): string | null {
  if (apt.mode !== "online" || !apt.video_enabled || apt.status !== "confirmed")
    return null;
  const now = Date.now();
  const scheduled = new Date(apt.scheduled_at).getTime();
  const opensAt = scheduled - 10 * 60 * 1000;
  const closesAt = scheduled + 30 * 60 * 1000;
  if (now < opensAt) {
    const diff = opensAt - now;
    const mins = Math.floor(diff / 60000);
    if (mins <= 30) return `Opens in ${mins}m`;
    return null;
  }
  if (now >= opensAt && now <= closesAt) return "Join now";
  return null;
}

function getTimeUntil(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff < 0) return "Now";
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (hours > 24) return `${Math.floor(hours / 24)}d`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function getFollowUpCountdown(until: string) {
  const diff = new Date(until).getTime() - Date.now();
  if (diff <= 0) return { days: 0, hours: 0, label: "Expired", urgent: true };
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const urgent = days <= 2;
  const label = days > 0 ? `${days}d ${hours}h left` : `${hours}h left`;
  return { days, hours, label, urgent };
}

function computeGreeting(): { text: string; emoji: string } {
  const h = new Date().getHours();
  if (h < 12) return { text: "Good morning", emoji: "☀️" };
  if (h < 17) return { text: "Good afternoon", emoji: "🌤️" };
  return { text: "Good evening", emoji: "🌙" };
}

const STATUS_MAP: Record<string, { label: string; dot: string; text: string }> = {
  confirmed: { label: "Confirmed", dot: "bg-emerald-500", text: "text-emerald-700" },
  pending_payment: { label: "Pending", dot: "bg-amber-500", text: "text-amber-700" },
  completed: { label: "Completed", dot: "bg-blue-500", text: "text-blue-700" },
  cancelled: { label: "Cancelled", dot: "bg-red-500", text: "text-red-500" },
  no_show: { label: "No Show", dot: "bg-slate-400", text: "text-slate-500" },
};

const STATUS_PILL_MAP: Record<string, string> = {
  confirmed: "bg-emerald-50 text-emerald-700 border-emerald-100/60",
  pending_payment: "bg-amber-50 text-amber-700 border-amber-100/60",
  completed: "bg-blue-50 text-blue-700 border-blue-100/60",
  cancelled: "bg-red-50 text-red-600 border-red-100/60",
  no_show: "bg-slate-50 text-slate-600 border-slate-200/60",
};

/* ── main dashboard ── */

function DashboardContent() {
  const router = useRouter();
  const { patient } = usePatientAuth();

  const { data: upcomingData, isLoading: upcomingLoading } = useQuery({
    queryKey: ["patient", "appointments", "upcoming"],
    queryFn: async () => {
      const { data } = await api.get<PatientAppointmentsResponse>(
        "/patient/appointments",
        { params: { upcoming: true, limit: 5 } },
      );
      const result = AppointmentsResponseSchema.safeParse(data);
      if (!result.success) {
        console.error("[upcoming appointments] API shape mismatch:", result.error.issues);
        throw new Error("Unexpected response from appointments API");
      }
      return result.data as PatientAppointmentsResponse;
    },
    staleTime: 0,
  });

  const { data: allData, isLoading: allLoading } = useQuery({
    queryKey: ["patient", "appointments", "recent"],
    queryFn: async () => {
      const { data } = await api.get<PatientAppointmentsResponse>(
        "/patient/appointments",
        { params: { limit: 50 } },
      );
      const result = AppointmentsResponseSchema.safeParse(data);
      if (!result.success) {
        console.error("[recent appointments] API shape mismatch:", result.error.issues);
        throw new Error("Unexpected response from appointments API");
      }
      return result.data as PatientAppointmentsResponse;
    },
    staleTime: 0,
  });

  const { data: prescriptionsRaw } = useQuery({
    queryKey: ["patient", "prescriptions"],
    queryFn: async () => {
      const { data } = await api.get("/patient/prescriptions");
      const result = PrescriptionsResponseSchema.safeParse(data);
      if (!result.success) {
        console.error("[prescriptions] API shape mismatch:", result.error.issues);
        throw new Error("Unexpected response from prescriptions API");
      }
      return result.data;
    },
    staleTime: 0,
  });

  const prescriptionsList: unknown[] = Array.isArray(prescriptionsRaw)
    ? prescriptionsRaw
    : Array.isArray(prescriptionsRaw?.items)
      ? prescriptionsRaw.items
      : [];

  const upcoming = upcomingData?.items || [];
  const allAppointments = allData?.items || [];
  const completedCount = allAppointments.filter((a) => a.status === "completed").length;
  const totalPrescriptions = prescriptionsList.length;
  const profileIncomplete = isProfileIncomplete(patient);

  const pendingRefunds = allAppointments.filter(
    (a) => a.refund_status === "pending" || a.refund_status === "processing",
  );
  const pendingPayments = allAppointments.filter((a) => a.status === "pending_payment");
  const followUpsAvailable = allAppointments.filter(
    (a) =>
      a.is_follow_up_eligible &&
      !a.follow_up_used &&
      a.follow_up_eligible_until &&
      new Date(a.follow_up_eligible_until) > new Date(),
  );

  const recentActivity = allAppointments
    .filter((a) => a.status === "completed" || a.status === "cancelled")
    .slice(0, 4);

  // Find the next joinable or soon-joinable appointment for the hero card
  const nextOnline = upcoming.find(
    (a) => a.mode === "online" && a.video_enabled && a.status === "confirmed",
  );

  // Computed client-side only to avoid SSR/hydration mismatch
  const [greeting, setGreeting] = useState({ text: "Good morning", emoji: "☀️" });
  useEffect(() => { setGreeting(computeGreeting()); }, []);
  const firstName = patient?.full_name?.split(" ")[0];

  return (
    <PatientShell title="Dashboard">
      <div className="space-y-6 relative">
        {/* Ambient Depth Layer */}
        <div className="absolute -left-20 -top-20 h-72 w-72 rounded-full bg-brand/5 blur-[120px] pointer-events-none" />

        {/* Greeting */}
        <div className="flex flex-col gap-1 relative z-10">
          <span className="text-[10px] font-bold tracking-widest text-brand/70 uppercase">Welcome back</span>
          <h2 className="font-display text-2xl font-extrabold tracking-tight text-gray-900 flex items-center gap-2">
            {firstName ? `${greeting.text}, ${firstName}` : greeting.text}
            <span className="animate-[wiggle_1.2s_ease-in-out_infinite] origin-[70%_70%] inline-block">{greeting.emoji}</span>
          </h2>
        </div>

        {/* Alerts */}
        <AnimatePresence>
          {profileIncomplete && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="interactive relative overflow-hidden flex items-center gap-3.5 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-500/[0.04] to-amber-500/[0.01] backdrop-blur-md px-4 py-3.5 shadow-[0_12px_30px_-10px_rgba(245,158,11,0.06),inset_0_1px_0_rgba(255,255,255,0.7)] hover:border-amber-400 hover:shadow-md transition-all duration-200 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3.5px] before:bg-amber-500"
            >
              <div className="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-xl bg-amber-100/70 text-amber-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
                <AlertCircle className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold text-amber-900 leading-tight">Complete your profile</p>
                <p className="text-[11px] text-amber-700/80 mt-0.5 font-medium leading-relaxed">Name, age, and sex are required before booking.</p>
              </div>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={() => router.push("/patient/profile")} 
                className="shrink-0 rounded-xl border-amber-300/50 text-amber-900 hover:bg-amber-100/80 shadow-sm transition-all duration-200 active:scale-95 cursor-pointer h-8 px-3 font-semibold text-xs"
              >
                Complete
              </Button>
            </motion.div>
          )}
          {pendingPayments.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="interactive relative overflow-hidden flex items-center gap-3.5 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-500/[0.04] to-amber-500/[0.01] backdrop-blur-md px-4 py-3.5 shadow-[0_12px_30px_-10px_rgba(245,158,11,0.06),inset_0_1px_0_rgba(255,255,255,0.7)] hover:border-amber-400 hover:shadow-md transition-all duration-200 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3.5px] before:bg-amber-500"
            >
              <div className="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-xl bg-amber-100/70 text-amber-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
                <CreditCard className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold text-amber-900 leading-tight">{pendingPayments.length} appointment{pendingPayments.length > 1 ? "s" : ""} awaiting payment</p>
                <p className="text-[11px] text-amber-700/80 mt-0.5 font-medium leading-relaxed">Complete your payment online to confirm booking.</p>
              </div>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={() => router.push("/patient/appointments")} 
                className="shrink-0 rounded-xl border-amber-300/50 text-amber-900 hover:bg-amber-100/80 shadow-sm transition-all duration-200 active:scale-95 cursor-pointer h-8 px-3 font-semibold text-xs"
              >
                Pay Now
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Next Call Hero — only shows when there's an online appointment coming up */}
        {nextOnline && <NextCallCard apt={nextOnline} />}

        {/* Bento Grid */}
        <div className="grid gap-5 lg:grid-cols-3">
          {/* LEFT COLUMN */}
          <div className="space-y-5 lg:col-span-2">
            {/* Stat Cards */}
            <div className="grid grid-cols-3 gap-3">
              <StatCard
                label="Upcoming"
                value={upcomingLoading ? null : upcoming.length}
                accentClass="border-l-2 border-l-brand"
                onClick={() => router.push("/patient/appointments")}
              />
              <StatCard
                label="Completed"
                value={allLoading ? null : completedCount}
                accentClass="border-l-2 border-l-emerald-400"
                onClick={() => router.push("/patient/appointments")}
              />
              <StatCard
                label="Prescriptions"
                value={totalPrescriptions}
                accentClass="border-l-2 border-l-indigo-400"
                onClick={() => router.push("/patient/prescriptions")}
              />
            </div>

            {/* Follow-ups */}
            {followUpsAvailable.length > 0 && (
              <div className="relative overflow-hidden rounded-2xl border border-white/50 bg-white/70 backdrop-blur-md p-5 shadow-[0_8px_24px_-6px_rgba(15,23,42,0.02),inset_0_1px_0_rgba(255,255,255,0.8)]">
                <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-brand/5 blur-2xl pointer-events-none" />
                <div className="mb-3.5 flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand/10 text-brand shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                    <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                  </div>
                  <h3 className="font-display text-sm font-bold tracking-tight text-gray-900">Free Follow-ups</h3>
                  <span className="rounded-full bg-brand/5 border border-brand/10 px-2 py-0.5 text-[10px] font-bold text-brand font-mono tabular-nums">{followUpsAvailable.length}</span>
                </div>
                <div className="space-y-3">
                  {followUpsAvailable.map((apt) => (
                    <FollowUpCard key={apt.appointment_id} apt={apt} />
                  ))}
                </div>
              </div>
            )}

            {/* Refunds */}
            {pendingRefunds.length > 0 && (
              <div className="relative overflow-hidden rounded-2xl border border-white/50 bg-white/70 backdrop-blur-md p-5 shadow-[0_8px_24px_-6px_rgba(15,23,42,0.02),inset_0_1px_0_rgba(255,255,255,0.8)]">
                <div className="mb-3.5 flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand/10 text-brand shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                    <RefreshCcw className="h-3.5 w-3.5" />
                  </div>
                  <h3 className="font-display text-sm font-bold tracking-tight text-gray-900">Refunds in Progress</h3>
                </div>
                <div className="space-y-3">
                  {pendingRefunds.map((apt) => (
                    <div
                      key={apt.appointment_id}
                      className="flex items-center gap-3.5 rounded-xl border border-white/50 bg-white/40 backdrop-blur-sm px-3.5 py-3 hover:bg-white/85 hover:border-brand/20 transition-all duration-300 shadow-sm"
                    >
                      {apt.refund_status === "processing" ? (
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand/5 border border-brand/10 text-brand shadow-sm">
                          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                        </div>
                      ) : (
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-50 border border-gray-150 text-gray-400 shadow-sm">
                          <Clock className="h-3.5 w-3.5 shrink-0" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold text-gray-955">{apt.doctor_name}</p>
                        <p className="text-[10px] font-bold text-gray-400 mt-0.5 tracking-wider uppercase font-mono">₹{apt.consultation_fee}</p>
                      </div>
                      <span className="rounded-full bg-brand/5 border border-brand/10 px-2.5 py-0.5 text-[10px] font-bold text-brand uppercase tracking-wider">{apt.refund_status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Activity */}
            {!allLoading && recentActivity.length > 0 && (
              <div className="relative overflow-hidden rounded-2xl border border-white/50 bg-white/70 backdrop-blur-md p-5 shadow-[0_8px_24px_-6px_rgba(15,23,42,0.02),inset_0_1px_0_rgba(255,255,255,0.8)]">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-display text-sm font-bold tracking-tight text-gray-900">Recent Activity</h3>
                  <button
                    onClick={() => router.push("/patient/appointments")}
                    className="text-xs font-semibold text-gray-450 hover:text-brand hover:underline cursor-pointer transition-colors"
                  >
                    View all
                  </button>
                </div>
                <div className="divide-y divide-gray-100/50">
                  {recentActivity.map((apt) => {
                    const s = STATUS_MAP[apt.status] || STATUS_MAP.completed;
                    return (
                      <div
                        key={apt.appointment_id}
                        className="flex items-center gap-3.5 py-3 hover:-translate-y-px hover:bg-gray-50/[0.04] transition-all duration-200 first:pt-0 last:pb-0"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold text-gray-905">{apt.doctor_name}</p>
                        </div>
                        <span className="shrink-0 text-xs text-gray-500 font-medium">{formatDate(apt.scheduled_at)}</span>
                        <span className={cn(
                          "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[9.5px] font-bold tracking-wide uppercase shadow-[0_1px_2px_rgba(0,0,0,0.02)]",
                          STATUS_PILL_MAP[apt.status] || "bg-slate-50 text-slate-600 border-slate-200/60"
                        )}>
                          {s.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN — Upcoming Appointments */}
          <div className="lg:col-span-1">
            <div className="relative overflow-hidden rounded-2xl border border-white/50 bg-white/70 backdrop-blur-md shadow-[0_8px_24px_-6px_rgba(15,23,42,0.02),inset_0_1px_0_rgba(255,255,255,0.8)]">
              <div className="flex items-center justify-between border-b border-gray-150/40 px-5 py-4">
                <h3 className="font-display text-sm font-bold tracking-tight text-gray-900">Upcoming</h3>
                {upcoming.length > 0 && (
                  <button
                    onClick={() => router.push("/patient/appointments")}
                    className="text-xs font-semibold text-gray-400 hover:text-brand hover:underline cursor-pointer transition-colors"
                  >
                    View all
                  </button>
                )}
              </div>

              <div className="p-4">
                {upcomingLoading ? (
                  <div className="space-y-3">
                    {[1, 2].map((i) => (
                      <div key={i} className="rounded-xl border border-white/40 bg-brand-bg/15 p-4">
                        <Skeleton className="mb-2 h-4 w-32" />
                        <Skeleton className="h-3 w-48" />
                      </div>
                    ))}
                  </div>
                ) : upcoming.length === 0 ? (
                  <div className="flex flex-col items-center py-10 text-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-50 border border-gray-100 text-gray-300 mb-3 shadow-inner">
                      <Calendar className="h-5 w-5" />
                    </div>
                    <p className="text-xs font-medium text-gray-400">No upcoming appointments</p>
                    <button
                      onClick={() => router.push("/patient/doctors")}
                      className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-brand hover:text-brand-dark transition-colors"
                    >
                      <Search className="h-3.5 w-3.5" />
                      Find a Doctor
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {upcoming.map((apt) => (
                      <AppointmentCard key={apt.appointment_id} apt={apt} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </PatientShell>
  );
}

/* ── Next call hero card ── */

function NextCallCard({ apt }: { apt: PatientAppointment }) {
  const router = useRouter();
  const [, setTick] = useState(0);
  const joinable = canJoinCall(apt);
  const windowLabel = getCallWindowLabel(apt);

  // Re-render every 30s to keep the countdown/status fresh
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  // Only show if appointment is within the next 2 hours or currently joinable
  const scheduled = new Date(apt.scheduled_at).getTime();
  const twoHoursFromNow = Date.now() + 2 * 60 * 60 * 1000;
  if (!joinable && scheduled > twoHoursFromNow) return null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/50 bg-white/70 backdrop-blur-md p-5 sm:p-6 shadow-[0_20px_45px_-12px_rgba(88,155,255,0.08),inset_0_1px_0_rgba(255,255,255,0.9)]">
      {/* Spotlight Ambient Lighting */}
      <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-brand/5 blur-[60px] pointer-events-none animate-pulse" />
      <div className="absolute -left-10 -bottom-10 h-40 w-40 rounded-full bg-emerald-500/[0.03] blur-[60px] pointer-events-none" />
      
      <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand/5 border border-brand/10 text-brand shadow-sm">
              <Video className="h-4 w-4" />
            </div>
            <span className="text-[10px] font-bold tracking-widest text-brand uppercase">Online Consultation</span>
            {joinable ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-state-live/10 border border-state-live/25 px-2.5 py-0.5 text-[10px] font-bold text-state-live uppercase tracking-wider shadow-[0_0_12px_rgba(34,197,94,0.15)]">
                <span className="h-1.5 w-1.5 rounded-full bg-state-live animate-pulse" />
                Live
              </span>
            ) : windowLabel ? (
              <span className="rounded-full bg-gray-50 border border-gray-150 px-2.5 py-0.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider shadow-sm">
                {windowLabel}
              </span>
            ) : null}
          </div>
          <p className="mt-3 text-lg font-bold text-gray-900 font-display leading-tight">{apt.doctor_name}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500 font-medium">
            <span>{formatDate(apt.scheduled_at)}</span>
            <span className="text-gray-300 select-none">·</span>
            <span>{formatTime(apt.scheduled_at)}</span>
            <span className="text-gray-300 select-none">·</span>
            <span className="inline-flex items-center gap-1 rounded-md bg-brand/[0.04] border border-brand/10 px-2 py-0.5 text-[11px] font-bold text-brand font-mono shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
              In <span className="tabular-nums">{getTimeUntil(apt.scheduled_at)}</span>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {joinable ? (
            <Button
              onClick={() => router.push(`/patient/appointments/${apt.appointment_id}/waiting-room`)}
              className="interactive relative overflow-hidden group gap-2 h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-[0_8px_24px_rgba(16,185,129,0.25)] cursor-pointer"
            >
              <span className="relative z-10 flex items-center gap-2">
                <Video className="h-4 w-4" />
                Join Call
              </span>
              <span className="absolute inset-0 bg-gradient-to-r from-emerald-600 to-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => router.push(`/patient/appointments/${apt.appointment_id}`)}
              className="gap-1.5 h-11 border-gray-200 hover:bg-gray-50 hover:text-gray-900 text-gray-700 font-semibold rounded-xl transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98] cursor-pointer"
            >
              View Details
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Stat card ── */

function StatCard({
  label,
  value,
  accentClass,
  onClick,
}: {
  label: string;
  value: number | string | null;
  accentClass: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "interactive relative overflow-hidden rounded-2xl border border-white/50 bg-white/70 backdrop-blur-sm pl-5 pr-4 py-4 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] cursor-pointer w-full hover:-translate-y-0.5 hover:border-brand/20 group",
        accentClass
      )}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-brand/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
      {value === null ? (
        <Skeleton className="mb-1 h-7 w-10" />
      ) : (
        <p className="font-display text-3xl font-extrabold tracking-tight text-gray-900 group-hover:text-brand transition-colors duration-200 tabular-nums">{value}</p>
      )}
      <p className="mt-1.5 text-[10px] font-bold tracking-widest uppercase text-gray-400/80 group-hover:text-gray-500 transition-colors">{label}</p>
    </button>
  );
}

/* ── Follow-up card ── */

function FollowUpCard({ apt }: { apt: PatientAppointment }) {
  const router = useRouter();
  const [countdown, setCountdown] = useState(() =>
    getFollowUpCountdown(apt.follow_up_eligible_until!),
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(getFollowUpCountdown(apt.follow_up_eligible_until!));
    }, 60000);
    return () => clearInterval(interval);
  }, [apt.follow_up_eligible_until]);

  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-white/60 bg-white/40 backdrop-blur-sm px-3.5 py-3 hover:bg-white/80 transition-all duration-200 shadow-sm hover:-translate-y-px">
      <div className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg shadow-sm border transition-all duration-200",
        countdown.urgent ? "bg-amber-50 border-amber-100/50 text-amber-600" : "bg-brand/10 border-brand/20 text-brand"
      )}>
        <CalendarClock className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold text-gray-955">{apt.doctor_name}</p>
        <span className={cn(
          "inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-md mt-0.5 border shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] font-mono tabular-nums",
          countdown.urgent 
            ? "bg-amber-50 border-amber-150 text-amber-700" 
            : "bg-brand/[0.04] border-brand/10 text-brand"
        )}>
          {countdown.label}
        </span>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={() => router.push(`/patient/book/${apt.doctor_id}?followUp=${apt.appointment_id}`)}
        className="interactive h-8 rounded-lg text-xs font-semibold bg-brand text-white border-brand hover:bg-brand-dark cursor-pointer shadow-sm"
      >
        Book Free <ArrowRight className="ml-1 h-3 w-3" />
      </Button>
    </div>
  );
}

/* ── Appointment card ── */

function AppointmentCard({ apt }: { apt: PatientAppointment }) {
  const router = useRouter();
  const joinable = canJoinCall(apt);
  const status = STATUS_MAP[apt.status] || STATUS_MAP.confirmed;

  return (
    <div
      className="group cursor-pointer rounded-xl border border-white/40 bg-white/30 backdrop-blur-sm p-4 transition-all duration-200 hover:border-brand/25 hover:bg-white hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99]"
      onClick={() => router.push(`/patient/appointments/${apt.appointment_id}`)}
    >
      <div className="flex items-start gap-3">
        <div className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg shadow-sm border transition-all duration-200",
          apt.mode === "online" ? "bg-brand/10 border-brand/20 text-brand" : "bg-gray-50 border-gray-150 text-gray-400"
        )}>
          {apt.mode === "online" ? (
            <Video className="h-4 w-4" />
          ) : (
            <MapPin className="h-4 w-4" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold text-gray-900 group-hover:text-brand transition-colors duration-200">{apt.doctor_name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500 font-medium">
            <span>{formatDate(apt.scheduled_at)}</span>
            <span className="text-gray-300">·</span>
            <span>{formatTime(apt.scheduled_at)}</span>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className={cn(
              "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[9.5px] font-bold tracking-wide uppercase shadow-[0_1px_2px_rgba(0,0,0,0.02)]",
              STATUS_PILL_MAP[apt.status] || "bg-slate-50 text-slate-600 border-slate-200/60"
            )}>
              {status.label}
            </span>
            <span className="text-[11px] text-gray-400 font-medium font-mono tabular-nums">{getTimeUntil(apt.scheduled_at)}</span>
          </div>
        </div>
      </div>
      {joinable && (
        <Button
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            router.push(`/patient/appointments/${apt.appointment_id}/waiting-room`);
          }}
          className="interactive relative overflow-hidden group mt-3.5 w-full gap-2 bg-brand text-xs font-bold text-white hover:bg-brand-dark h-9 rounded-lg shadow-sm cursor-pointer"
        >
          <span className="relative z-10 flex items-center justify-center gap-2">
            <Video className="h-3.5 w-3.5" />
            Join Call
          </span>
          <span className="absolute inset-0 bg-gradient-to-r from-brand to-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        </Button>
      )}
    </div>
  );
}

export default function PatientDashboardPage() {
  return (
    <AuthGuard role="patient">
      <DashboardContent />
    </AuthGuard>
  );
}
