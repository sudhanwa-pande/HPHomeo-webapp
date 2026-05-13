"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CalendarDays,
  Clock3,
  Loader2,
  MapPin,
  RefreshCcw,
  Stethoscope,
  Video,
  XCircle,
} from "lucide-react";

import { getRateLimitDescription, isNetworkError, isRateLimitError } from "@/lib/api";
import { notifyApiError, notifySuccess } from "@/lib/notify";
import {
  createPublicAccessSession,
  publicApi,
  readPublicMagicTokenFromHash,
  scrubPublicMagicTokenFromUrl,
} from "@/lib/public-api";
import type { PublicAppointment, PublicAvailableSlot, PublicAvailableSlotsResponse } from "@/types/public";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

const BOOKING_WINDOW_DAYS = 7;

function modeLabel(mode: PublicAppointment["mode"]) {
  return mode === "online" ? "Online consultation" : "Clinic visit";
}

function statusConfig(status: PublicAppointment["status"]) {
  switch (status) {
    case "confirmed":
      return {
        label: "Confirmed",
        dot: "bg-green-500",
        badge: "border-green-200 bg-green-50 text-green-700",
      };
    case "pending_payment":
      return {
        label: "Pending Payment",
        dot: "bg-amber-500",
        badge: "border-amber-200 bg-amber-50 text-amber-700",
      };
    case "completed":
      return {
        label: "Completed",
        dot: "bg-brand",
        badge: "border-brand/20 bg-brand/10 text-brand",
      };
    case "cancelled":
      return {
        label: "Cancelled",
        dot: "bg-red-500",
        badge: "border-red-200 bg-red-50 text-red-700",
      };
    case "no_show":
      return {
        label: "No Show",
        dot: "bg-red-400",
        badge: "border-red-200 bg-red-50 text-red-600",
      };
    default:
      return {
        label: status,
        dot: "bg-slate-400",
        badge: "border-slate-200 bg-slate-50 text-slate-700",
      };
  }
}

function groupSlotsByDate(slots: PublicAvailableSlot[]) {
  return slots.reduce<Record<string, PublicAvailableSlot[]>>((acc, slot) => {
    if (!acc[slot.date]) acc[slot.date] = [];
    acc[slot.date].push(slot);
    return acc;
  }, {});
}

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] as const },
});

function AppointmentPageClient() {
  const params = useParams<{ appointmentId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const appointmentId = params.appointmentId;

  const [cancelOpen, setCancelOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedSlot, setSelectedSlot] = useState<PublicAvailableSlot | null>(null);
  const [accessReady, setAccessReady] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let active = true;

    async function bootstrapAccess() {
      try {
        const token = readPublicMagicTokenFromHash();
        if (token) scrubPublicMagicTokenFromUrl();
        if (token) {
          await createPublicAccessSession(appointmentId, token);
        }
        if (active) {
          setAccessReady(true);
          setAccessError(null);
        }
      } catch {
        if (active) {
          setAccessReady(true);
          setAccessError("invalid");
        }
      }
    }

    void bootstrapAccess();
    return () => { active = false; };
  }, [appointmentId]);

  const appointmentQuery = useQuery({
    queryKey: ["public-appointment", appointmentId],
    queryFn: async () => {
      const { data } = await publicApi.get<PublicAppointment>(`/public/appointments/${appointmentId}`);
      return data;
    },
    enabled: accessReady && Boolean(appointmentId),
    retry: false,
  });

  const appointment = appointmentQuery.data;
  const appointmentLoadError = appointmentQuery.error;

  const today = useMemo(() => new Date(), []);
  const slotsRange = useMemo(() => {
    const from = format(today, "yyyy-MM-dd");
    const toDate = new Date(today);
    toDate.setDate(today.getDate() + (BOOKING_WINDOW_DAYS - 1));
    return { from, to: format(toDate, "yyyy-MM-dd") };
  }, [today]);

  const slotsQuery = useQuery({
    queryKey: ["public-appointment-slots", appointment?.doctor_id, appointmentId, slotsRange.from, slotsRange.to],
    queryFn: async () => {
      const { data } = await publicApi.get<PublicAvailableSlotsResponse>(
        `/public/doctors/${appointment?.doctor_id}/available-slots`,
        { params: slotsRange },
      );
      return data;
    },
    enabled: Boolean(accessReady && appointment?.doctor_id && rescheduleOpen && appointment.can_reschedule),
    retry: false,
  });

  const groupedSlots = useMemo(() => groupSlotsByDate(slotsQuery.data?.slots ?? []), [slotsQuery.data?.slots]);
  const availableDates = useMemo(
    () => Object.keys(groupedSlots).map((value) => parseISO(`${value}T00:00:00`)),
    [groupedSlots],
  );
  const activeDate = selectedDate ?? availableDates[0];
  const activeDateKey = activeDate ? format(activeDate, "yyyy-MM-dd") : "";
  const activeDateSlots = activeDateKey ? groupedSlots[activeDateKey] ?? [] : [];
  const slotsLoadError = slotsQuery.error;

  const cancelMutation = useMutation({
    mutationFn: async () =>
      publicApi.post(`/public/appointments/${appointmentId}/cancel`, {
        reason: cancelReason.trim() || undefined,
      }),
    onSuccess: () => {
      notifySuccess("Appointment cancelled", "The booking has been cancelled successfully.");
      setCancelOpen(false);
      setCancelReason("");
      queryClient.invalidateQueries({ queryKey: ["public-appointment", appointmentId] });
    },
    onError: (error) => notifyApiError(error, "Couldn't cancel appointment"),
  });

  const rescheduleMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSlot) throw new Error("Please choose a new slot.");
      const { data } = await publicApi.post<{ new_appointment_id: string }>(
        `/public/appointments/${appointmentId}/reschedule`,
        {
          new_scheduled_at: selectedSlot.start,
          reason: rescheduleReason.trim() || undefined,
        },
      );
      return data;
    },
    onSuccess: (data) => {
      notifySuccess("Appointment rescheduled", "Your booking has been moved to the new slot.");
      setRescheduleOpen(false);
      setSelectedSlot(null);
      setSelectedDate(undefined);
      setRescheduleReason("");
      router.replace(`/public/appointments/${data.new_appointment_id}`);
    },
    onError: (error) => notifyApiError(error, "Couldn't reschedule appointment"),
  });

  const summaryItems = useMemo(() => {
    if (!appointment) return [];
    return [
      { label: "Doctor", value: appointment.doctor_name || "Assigned doctor", icon: Stethoscope },
      { label: "Schedule", value: format(parseISO(appointment.scheduled_at), "EEE, dd MMM yyyy · hh:mm a"), icon: CalendarDays },
      { label: "Mode", value: modeLabel(appointment.mode), icon: appointment.mode === "online" ? Video : MapPin },
      { label: "Consultation", value: appointment.consultation_fee ? `₹${appointment.consultation_fee}` : "Included", icon: Clock3 },
    ];
  }, [appointment]);

  const isOnlineConfirmed =
    appointment?.video_enabled && appointment.mode === "online" && appointment.status === "confirmed";

  const { isJoinWindowOpen, joinMessage, isTooLate } = useMemo(() => {
    if (!appointment?.scheduled_at) return { isJoinWindowOpen: false, joinMessage: "", isTooLate: false };
    const scheduledTime = parseISO(appointment.scheduled_at).getTime();
    const start = scheduledTime - 10 * 60 * 1000;
    const end = scheduledTime + 30 * 60 * 1000;
    const current = currentTime.getTime();
    
    if (current < start) {
      const mins = Math.ceil((start - current) / 60000);
      if (mins > 60) {
        return { isJoinWindowOpen: false, joinMessage: `Join available 10 mins before`, isTooLate: false };
      }
      return { isJoinWindowOpen: false, joinMessage: `Join available in ${mins} min${mins !== 1 ? 's' : ''}`, isTooLate: false };
    }
    if (current > end) {
      return { isJoinWindowOpen: false, joinMessage: "Call window has ended", isTooLate: true };
    }
    return { isJoinWindowOpen: true, joinMessage: "Join video consultation", isTooLate: false };
  }, [appointment?.scheduled_at, currentTime]);

  // ── Loading ──────────────────────────────────────────────────────
  if (!accessReady || appointmentQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,rgba(88,155,255,0.06),transparent_60%),linear-gradient(180deg,#f8fafd,#f4f6fb)]">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="flex items-center gap-3 rounded-2xl border border-white/80 bg-white/90 px-6 py-4 text-sm font-medium text-brand-dark shadow-[0_8px_32px_rgba(15,23,42,0.08)] backdrop-blur-md"
        >
          <Loader2 className="h-4 w-4 animate-spin text-brand" />
          Loading your appointment
        </motion.div>
      </div>
    );
  }

  // ── Error states ─────────────────────────────────────────────────
  if (accessError) {
    return (
      <PageShell>
        <CenteredState
          title="This appointment link is invalid or has expired"
          description="Contact the clinic if you need a fresh link for this appointment."
          tone="error"
        />
      </PageShell>
    );
  }

  if (appointmentQuery.isError || !appointment) {
    if (isRateLimitError(appointmentLoadError)) {
      return (
        <PageShell>
          <CenteredState
            title="This page is temporarily rate limited"
            description={`${getRateLimitDescription(appointmentLoadError)} Then refresh the appointment page.`}
            tone="warning"
            action={
              <Button className="mt-6 rounded-xl" onClick={() => appointmentQuery.refetch()}>
                Try again
              </Button>
            }
          />
        </PageShell>
      );
    }
    if (isNetworkError(appointmentLoadError)) {
      return (
        <PageShell>
          <CenteredState
            title="We couldn't reach the clinic server"
            description="Check your network connection, then retry this appointment link."
            tone="warning"
            action={
              <Button className="mt-6 rounded-xl" onClick={() => appointmentQuery.refetch()}>
                Try again
              </Button>
            }
          />
        </PageShell>
      );
    }
    return (
      <PageShell>
        <CenteredState
          title="This appointment link is invalid or has expired"
          description="Contact the clinic if you need a fresh link for this appointment."
          tone="error"
        />
      </PageShell>
    );
  }

  const sc = statusConfig(appointment.status);

  // ── Main UI ──────────────────────────────────────────────────────
  return (
    <PageShell>
      <div className="space-y-5">
        {/* ── Header ── */}
        <motion.header
          {...fadeUp(0)}
          className="rounded-[2rem] border border-white/70 bg-white/90 px-6 py-5 shadow-[0_8px_40px_rgba(15,23,42,0.06)] backdrop-blur-sm sm:px-8"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3.5">
              <div className="flex h-11 w-11 items-center justify-center rounded-[1rem] bg-brand/[0.07] ring-1 ring-brand/10">
                <Image src="/images/logo_wthout_text.png" alt="eHomeo" width={24} height={24} className="h-6 w-6" />
              </div>
              <div>
                <Image src="/images/logo.png" alt="eHomeo" width={124} height={40} className="h-7 w-auto" />
                <p className="mt-0.5 text-[11px] font-medium text-brand-subtext/70 tracking-wide">
                  Private appointment access
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Animated status badge */}
              <div className={cn("flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold shadow-sm", sc.badge)}>
                <span className="relative flex h-1.5 w-1.5">
                  <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", sc.dot)} />
                  <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", sc.dot)} />
                </span>
                {sc.label}
              </div>

              {isOnlineConfirmed && !isTooLate && (
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Button
                    className="relative h-11 rounded-[1.2rem] bg-brand-accent px-6 text-sm font-bold text-brand-dark shadow-[0_8px_24px_rgba(216,238,83,0.35)] transition-all hover:-translate-y-0.5 hover:bg-[#d0e64b] hover:shadow-[0_12px_32px_rgba(216,238,83,0.45)] disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none"
                    onClick={() => router.push(`/public/appointments/${appointmentId}/call`)}
                    disabled={!isJoinWindowOpen}
                  >
                    {isJoinWindowOpen && (
                      <span className="absolute -inset-1 -z-10 animate-pulse rounded-[1.4rem] bg-brand-accent/40 blur-md" />
                    )}
                    <Video className="h-4 w-4 mr-1.5" />
                    {isJoinWindowOpen ? "Join call" : joinMessage}
                  </Button>
                </motion.div>
              )}
            </div>
          </div>
        </motion.header>

        {/* ── Main grid ── */}
        <section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          {/* Left: appointment details */}
          <motion.div {...fadeUp(0.07)} className="space-y-5">
            <Card className="rounded-[2rem] border-white/70 bg-white/92 shadow-[0_16px_60px_-28px_rgba(19,19,19,0.16)]">
              <CardHeader className="pb-3">
                <CardTitle className="font-display text-[1.9rem] font-bold leading-tight tracking-tight text-brand-dark">
                  {appointment.doctor_name || "Appointment details"}
                </CardTitle>
                <CardDescription className="text-sm text-brand-subtext">
                  {appointment.patient_name || "Appointment holder"} &middot; {modeLabel(appointment.mode)}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Info tiles */}
                <div className="grid gap-3 sm:grid-cols-2">
                  {summaryItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <div
                        key={item.label}
                        className="rounded-[1.4rem] border border-slate-100 bg-gradient-to-b from-white to-brand-bg/50 px-4 py-4 shadow-[0_4px_16px_rgba(15,23,42,0.04)] transition-shadow hover:shadow-[0_8px_24px_rgba(15,23,42,0.07)]"
                      >
                        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-subtext/50">
                          <Icon className="h-3 w-3" />
                          {item.label}
                        </div>
                        <p className="mt-2.5 text-sm font-semibold text-brand-dark">{item.value}</p>
                      </div>
                    );
                  })}
                </div>

                {/* Patient + payment dark card */}
                <div className="rounded-[1.6rem] bg-brand-dark px-5 py-5 text-white">
                  <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/35">Patient</p>
                      <p className="mt-2 text-xl font-bold tracking-tight">
                        {appointment.patient_name || "Appointment holder"}
                      </p>
                      <p className="mt-1.5 text-sm text-white/55">
                        {appointment.payment_choice === "pay_now" ? "Online payment" : "Pay at clinic"}
                        {appointment.consultation_fee ? ` · ₹${appointment.consultation_fee}` : ""}
                      </p>
                    </div>
                    <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.06] px-4 py-3.5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/35">Change window</p>
                      <p className="mt-1.5 text-sm font-medium text-white/75">
                        {appointment.can_reschedule || appointment.can_cancel
                          ? `Open until ${appointment.cancel_window_hours}h before`
                          : "Locked — no changes"}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Right: actions */}
          <motion.div {...fadeUp(0.13)} className="space-y-4">
            <Card className="rounded-[2rem] border-white/70 bg-white/92 shadow-[0_16px_60px_-28px_rgba(19,19,19,0.16)]">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-bold text-brand-dark">Quick actions</CardTitle>
                <CardDescription className="text-sm">Manage this booking from here.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {isOnlineConfirmed && !isTooLate && (
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <Button
                      className="relative h-[56px] w-full justify-between rounded-[1.4rem] bg-brand-accent px-5 text-[15px] font-bold text-brand-dark shadow-[0_8px_32px_rgba(216,238,83,0.3)] transition-all hover:-translate-y-1 hover:bg-[#d0e64b] hover:shadow-[0_14px_40px_rgba(216,238,83,0.4)] disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none"
                      onClick={() => router.push(`/public/appointments/${appointmentId}/call`)}
                      disabled={!isJoinWindowOpen}
                    >
                      {isJoinWindowOpen && (
                        <span className="absolute -inset-1 -z-10 animate-pulse rounded-[1.6rem] bg-brand-accent/50 blur-lg" />
                      )}
                      {joinMessage}
                      <Video className="h-5 w-5" />
                    </Button>
                  </motion.div>
                )}
                <Button
                  className="h-[52px] w-full justify-between rounded-[1.4rem] bg-brand text-white shadow-[0_8px_24px_rgba(88,155,255,0.22)] transition-all hover:bg-brand/90 hover:shadow-[0_12px_32px_rgba(88,155,255,0.3)] disabled:opacity-50"
                  onClick={() => setRescheduleOpen(true)}
                  disabled={!appointment.can_reschedule}
                >
                  Reschedule appointment
                  <RefreshCcw className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  className="h-[52px] w-full justify-between rounded-[1.4rem] border-red-200 text-red-600 transition-all hover:border-red-300 hover:bg-red-50 disabled:opacity-40"
                  onClick={() => setCancelOpen(true)}
                  disabled={!appointment.can_cancel}
                >
                  Cancel appointment
                  <XCircle className="h-4 w-4" />
                </Button>
                <div className="rounded-[1.4rem] bg-brand-bg px-4 py-3.5 text-sm leading-relaxed text-brand-subtext">
                  {appointment.can_reschedule || appointment.can_cancel
                    ? `Changes are open until ${appointment.cancel_window_hours} hours before the appointment.`
                    : "This booking is inside the lock window — changes are no longer available."}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </section>
      </div>

      {/* ── Cancel dialog ── */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="max-w-xl rounded-[1.8rem] p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>Cancel appointment</DialogTitle>
            <DialogDescription>
              This will update the booking immediately. You can optionally leave a note for the clinic.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-6 pb-6">
            <div className="rounded-[1.4rem] bg-brand-bg px-4 py-4 text-sm leading-6 text-brand-dark">
              {appointment.doctor_name || "Doctor"} &middot;{" "}
              {format(parseISO(appointment.scheduled_at), "EEE, dd MMM yyyy · hh:mm a")}
            </div>
            <Input
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Reason for cancellation (optional)"
              maxLength={500}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              Keep booking
            </Button>
            <Button
              variant="destructive"
              loading={cancelMutation.isPending}
              onClick={() => cancelMutation.mutate()}
            >
              Confirm cancellation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reschedule dialog ── */}
      <Dialog
        open={rescheduleOpen}
        onOpenChange={(open) => {
          setRescheduleOpen(open);
          if (!open) {
            setSelectedDate(undefined);
            setSelectedSlot(null);
          }
        }}
      >
        <DialogContent className="max-w-5xl rounded-[1.8rem] p-0 max-h-[90vh] overflow-y-auto">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>Choose a new slot</DialogTitle>
            <DialogDescription>
              Pick a date from the doctor&apos;s live calendar, then select one of the available time slots.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 px-6 pb-6">
            {/* ── Date Selection (Horizontal Scroller) ── */}
            <div className="space-y-3">
              <p className="text-sm font-semibold text-brand-dark">Select Date</p>
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                {availableDates.map((date) => {
                  const isSelected = activeDate && format(date, "yyyy-MM-dd") === format(activeDate, "yyyy-MM-dd");
                  return (
                    <button
                      key={date.toISOString()}
                      onClick={() => {
                        setSelectedDate(date);
                        setSelectedSlot(null);
                      }}
                      className={cn(
                        "flex min-w-[72px] flex-col items-center rounded-2xl border-2 px-3 py-3 transition-all duration-200",
                        isSelected
                          ? "border-brand bg-brand/5 text-brand shadow-lg shadow-brand/10"
                          : "border-slate-100 bg-white text-slate-500 hover:border-brand/30 hover:bg-brand-bg"
                      )}
                    >
                      <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">
                        {format(date, "EEE")}
                      </span>
                      <span className="text-lg font-black">{format(date, "dd")}</span>
                      <span className="text-[10px] font-medium">{format(date, "MMM")}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Time Slots ── */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-brand-dark">
                  Available on {activeDate ? format(activeDate, "EEEE, dd MMM") : "..."}
                </p>
                {!slotsQuery.isLoading && (
                  <Badge variant="outline" className="border-brand/20 bg-brand/5 text-brand-dark">
                    {activeDateSlots.length} slots
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {slotsQuery.isLoading ? (
                  <div className="col-span-full flex items-center gap-2 rounded-2xl bg-brand-bg px-4 py-8 text-sm text-brand-subtext">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading available slots...
                  </div>
                ) : activeDateSlots.length === 0 ? (
                  <div className="col-span-full rounded-2xl bg-brand-bg px-4 py-12 text-center text-sm text-brand-subtext">
                    No slots are open for this date.
                  </div>
                ) : (
                  activeDateSlots.map((slot) => {
                    const active = selectedSlot?.start === slot.start;
                    return (
                      <button
                        key={slot.start}
                        onClick={() => setSelectedSlot(slot)}
                        className={cn(
                          "group relative flex flex-col items-center justify-center rounded-2xl border-2 px-4 py-4 transition-all",
                          active
                            ? "border-brand bg-brand text-white shadow-lg shadow-brand/20"
                            : "border-slate-100 bg-white hover:border-brand/30 hover:bg-brand-bg"
                        )}
                      >
                        <span className="text-sm font-bold">{format(parseISO(slot.start), "hh:mm a")}</span>
                        <span className={cn("mt-1 text-[10px] font-medium", active ? "text-white/70" : "text-brand-subtext/60")}>
                          {slot.duration_minutes} min
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <Separator className="bg-slate-100" />

            <div className="space-y-3">
              <p className="text-sm font-semibold text-brand-dark">Note for the clinic</p>
              <Input
                value={rescheduleReason}
                onChange={(e) => setRescheduleReason(e.target.value)}
                placeholder="Why are you rescheduling? (Optional)"
                className="rounded-2xl border-slate-100 bg-white px-4 py-6 text-sm shadow-sm transition-all focus:border-brand/30 focus:ring-brand/10"
                maxLength={500}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRescheduleOpen(false)}>
              Close
            </Button>
            <Button
              loading={rescheduleMutation.isPending}
              disabled={!selectedSlot}
              onClick={() => rescheduleMutation.mutate()}
            >
              Confirm new slot
              <ArrowRight className="h-4 w-4" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

// ── Layout shells ────────────────────────────────────────────────────────────

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_80%_40%_at_top_right,rgba(216,238,83,0.09),transparent),radial-gradient(ellipse_60%_30%_at_top_left,rgba(88,155,255,0.07),transparent),linear-gradient(180deg,#f8fafd,#eef4ff_35%,#f4f6fb)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">{children}</div>
    </div>
  );
}

function CenteredState({
  title,
  description,
  tone,
  action,
}: {
  title: string;
  description: string;
  tone: "warning" | "error";
  action?: React.ReactNode;
}) {
  const badgeClasses =
    tone === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : "border-red-200 bg-red-50 text-red-700";

  return (
    <>
      <div className="mb-8 flex items-center justify-center">
        <Image src="/images/logo.png" alt="eHomeo" width={160} height={52} className="h-10 w-auto" />
      </div>
      <motion.div {...fadeUp(0.05)}>
        <Card className="rounded-[2rem] border-white/70 bg-white/95 shadow-[0_16px_60px_-28px_rgba(19,19,19,0.2)]">
          <CardHeader>
            <Badge variant="outline" className={cn("w-fit text-xs font-semibold", badgeClasses)}>
              {tone === "warning" ? "Temporarily unavailable" : "Link invalid"}
            </Badge>
            <CardTitle className="mt-2 text-2xl font-bold tracking-tight text-brand-dark">{title}</CardTitle>
            <CardDescription className="max-w-xl text-sm leading-6 text-brand-subtext">
              {description}
            </CardDescription>
            {action}
          </CardHeader>
        </Card>
      </motion.div>
    </>
  );
}

export default dynamic(() => Promise.resolve(AppointmentPageClient), { ssr: false });
