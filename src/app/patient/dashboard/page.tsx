"use client";

import { useRouter } from "next/navigation";
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

function computeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const STATUS_MAP: Record<string, { label: string; dot: string; text: string }> = {
  confirmed: { label: "Confirmed", dot: "bg-emerald-500", text: "text-emerald-700" },
  pending_payment: { label: "Pending", dot: "bg-amber-500", text: "text-amber-700" },
  completed: { label: "Completed", dot: "bg-blue-500", text: "text-blue-700" },
  cancelled: { label: "Cancelled", dot: "bg-red-500", text: "text-red-500" },
  no_show: { label: "No Show", dot: "bg-slate-400", text: "text-slate-500" },
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
  const [greeting, setGreeting] = useState("Good morning");
  useEffect(() => { setGreeting(computeGreeting()); }, []);
  const firstName = patient?.full_name?.split(" ")[0];

  return (
    <PatientShell title="Dashboard">
      <div className="space-y-5">
        {/* Greeting */}
        <div>
          <h2 className="text-xl font-bold tracking-[-0.02em] text-brand-dark">
            {firstName ? `${greeting}, ${firstName}` : greeting}
          </h2>
        </div>

        {/* Alerts */}
        <AnimatePresence>
          {profileIncomplete && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex items-center gap-3 rounded-xl border border-amber-200/60 bg-amber-50/50 px-4 py-3"
            >
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-amber-800">Complete your profile</p>
                <p className="text-[12px] text-amber-600">Name, age, and sex are required before booking.</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => router.push("/patient/profile")} className="shrink-0 border-amber-300/60 text-amber-800 hover:bg-amber-100/80">
                Complete
              </Button>
            </motion.div>
          )}
          {pendingPayments.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex items-center gap-3 rounded-xl border border-amber-200/60 bg-amber-50/50 px-4 py-3"
            >
              <CreditCard className="h-4 w-4 shrink-0 text-amber-600" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-amber-800">{pendingPayments.length} appointment{pendingPayments.length > 1 ? "s" : ""} awaiting payment</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => router.push("/patient/appointments")} className="shrink-0 border-amber-300/60 text-amber-800 hover:bg-amber-100/80">
                View
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Next Call Hero — only shows when there's an online appointment coming up */}
        {nextOnline && <NextCallCard apt={nextOnline} />}

        {/* Bento Grid */}
        <div className="grid gap-4 lg:grid-cols-3">
          {/* LEFT COLUMN */}
          <div className="space-y-4 lg:col-span-2">
            {/* Stat Cards */}
            <div className="grid grid-cols-3 gap-3">
              <StatCard
                label="Upcoming"
                value={upcomingLoading ? null : upcoming.length}
                onClick={() => router.push("/patient/appointments")}
              />
              <StatCard
                label="Completed"
                value={allLoading ? null : completedCount}
                onClick={() => router.push("/patient/appointments")}
              />
              <StatCard
                label="Prescriptions"
                value={totalPrescriptions}
                onClick={() => router.push("/patient/prescriptions")}
              />
            </div>

            {/* Follow-ups */}
            {followUpsAvailable.length > 0 && (
              <div className="rounded-xl border border-border/40 bg-white p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-brand" />
                  <h3 className="text-[13px] font-semibold text-brand-dark">Free Follow-ups</h3>
                  <span className="rounded-full bg-brand-bg px-1.5 py-0.5 text-[10px] font-bold text-brand">{followUpsAvailable.length}</span>
                </div>
                <div className="space-y-2">
                  {followUpsAvailable.map((apt) => (
                    <FollowUpCard key={apt.appointment_id} apt={apt} />
                  ))}
                </div>
              </div>
            )}

            {/* Refunds */}
            {pendingRefunds.length > 0 && (
              <div className="rounded-xl border border-border/40 bg-white p-4">
                <div className="mb-3 flex items-center gap-2">
                  <RefreshCcw className="h-4 w-4 text-brand" />
                  <h3 className="text-[13px] font-semibold text-brand-dark">Refunds in Progress</h3>
                </div>
                <div className="space-y-2">
                  {pendingRefunds.map((apt) => (
                    <div
                      key={apt.appointment_id}
                      className="flex items-center gap-3 rounded-lg bg-brand-bg/50 px-3 py-2.5"
                    >
                      {apt.refund_status === "processing" ? (
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-brand" />
                      ) : (
                        <Clock className="h-3.5 w-3.5 shrink-0 text-brand-subtext" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-medium text-brand-dark">{apt.doctor_name}</p>
                        <p className="text-[11px] text-brand-subtext">₹{apt.consultation_fee}</p>
                      </div>
                      <span className="text-[10px] font-medium capitalize text-brand">{apt.refund_status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Activity */}
            {!allLoading && recentActivity.length > 0 && (
              <div className="rounded-xl border border-border/40 bg-white p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-[13px] font-semibold text-brand-dark">Recent Activity</h3>
                  <button
                    onClick={() => router.push("/patient/appointments")}
                    className="text-[12px] font-medium text-brand-subtext transition-colors hover:text-brand-dark"
                  >
                    View all
                  </button>
                </div>
                <div className="space-y-0">
                  {recentActivity.map((apt) => {
                    const s = STATUS_MAP[apt.status] || STATUS_MAP.completed;
                    return (
                      <div
                        key={apt.appointment_id}
                        className="flex items-center gap-3 border-b border-border/20 py-2.5 last:border-0 last:pb-0 first:pt-0"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12px] font-medium text-brand-dark">{apt.doctor_name}</p>
                        </div>
                        <span className="shrink-0 text-[11px] text-brand-subtext">{formatDate(apt.scheduled_at)}</span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                          <span className={`text-[11px] font-medium ${s.text}`}>{s.label}</span>
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
            <div className="rounded-xl border border-border/40 bg-white">
              <div className="flex items-center justify-between border-b border-border/20 px-4 py-3">
                <h3 className="text-[13px] font-semibold text-brand-dark">Upcoming</h3>
                {upcoming.length > 0 && (
                  <button
                    onClick={() => router.push("/patient/appointments")}
                    className="text-[12px] font-medium text-brand-subtext transition-colors hover:text-brand-dark"
                  >
                    View all
                  </button>
                )}
              </div>

              <div className="p-3">
                {upcomingLoading ? (
                  <div className="space-y-3">
                    {[1, 2].map((i) => (
                      <div key={i} className="rounded-lg bg-brand-bg/50 p-3">
                        <Skeleton className="mb-2 h-4 w-32" />
                        <Skeleton className="h-3 w-48" />
                      </div>
                    ))}
                  </div>
                ) : upcoming.length === 0 ? (
                  <div className="flex flex-col items-center py-8 text-center">
                    <p className="text-[13px] text-brand-subtext">No upcoming appointments</p>
                    <button
                      onClick={() => router.push("/patient/doctors")}
                      className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-brand transition-colors hover:text-brand-dark"
                    >
                      <Search className="h-3 w-3" />
                      Find a Doctor
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
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
    <div className="rounded-xl border border-border/40 bg-white p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Video className="h-4 w-4 text-brand" />
            <span className="text-[12px] font-medium text-brand">Online Consultation</span>
            {windowLabel && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                joinable
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-brand-bg text-brand-subtext"
              }`}>
                {windowLabel}
              </span>
            )}
          </div>
          <p className="mt-1.5 text-[15px] font-semibold text-brand-dark">{apt.doctor_name}</p>
          <div className="mt-1 flex items-center gap-2 text-[12px] text-brand-subtext">
            <span>{formatDate(apt.scheduled_at)}</span>
            <span className="text-border">·</span>
            <span>{formatTime(apt.scheduled_at)}</span>
            <span className="text-border">·</span>
            <span>In {getTimeUntil(apt.scheduled_at)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {joinable ? (
            <Button
              onClick={() => router.push(`/patient/appointments/${apt.appointment_id}/waiting-room`)}
              className="gap-2 bg-emerald-600 text-[13px] font-semibold text-white hover:bg-emerald-700"
            >
              <Video className="h-3.5 w-3.5" />
              Join Call
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => router.push(`/patient/appointments/${apt.appointment_id}`)}
              className="gap-1.5 text-[13px]"
            >
              View Details
              <ArrowRight className="h-3.5 w-3.5" />
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
  onClick,
}: {
  label: string;
  value: number | string | null;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-xl border border-border/40 bg-white px-4 py-4 text-left transition-colors hover:border-border/70"
    >
      {value === null ? (
        <Skeleton className="mb-1.5 h-7 w-10" />
      ) : (
        <p className="text-2xl font-bold tracking-[-0.02em] text-brand-dark">{value}</p>
      )}
      <p className="mt-0.5 text-[12px] font-medium text-brand-subtext">{label}</p>
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
    <div className="flex items-center gap-3 rounded-lg bg-brand-bg/50 px-3 py-2.5">
      <CalendarClock className={`h-4 w-4 shrink-0 ${countdown.urgent ? "text-amber-600" : "text-brand"}`} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-medium text-brand-dark">{apt.doctor_name}</p>
        <span className={`text-[11px] font-semibold ${countdown.urgent ? "text-amber-600" : "text-brand"}`}>
          {countdown.label}
        </span>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={() => router.push(`/patient/book/${apt.doctor_id}?followUp=${apt.appointment_id}`)}
        className="h-7 gap-1 text-[11px]"
      >
        Book Free <ArrowRight className="h-3 w-3" />
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
      className="group cursor-pointer rounded-lg border border-border/30 bg-brand-bg/30 p-3 transition-colors hover:border-border/60 hover:bg-white"
      onClick={() => router.push(`/patient/appointments/${apt.appointment_id}`)}
    >
      <div className="flex items-start gap-2.5">
        {apt.mode === "online" ? (
          <Video className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
        ) : (
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-subtext" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-brand-dark">{apt.doctor_name}</p>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-brand-subtext">
            <span>{formatDate(apt.scheduled_at)}</span>
            <span className="text-border">·</span>
            <span>{formatTime(apt.scheduled_at)}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
              <span className={`text-[11px] font-medium ${status.text}`}>{status.label}</span>
            </span>
            <span className="text-[11px] text-brand-subtext">{getTimeUntil(apt.scheduled_at)}</span>
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
          className="mt-2.5 w-full gap-1.5 bg-emerald-600 text-[12px] font-semibold hover:bg-emerald-700"
        >
          <Video className="h-3 w-3" />
          Join Call
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
