"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { addDays, format, isBefore, parseISO, startOfDay } from "date-fns";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  CalendarX,
  CheckCircle2,
  Plus,
  Save,
  Timer,
  Trash2,
  User,
} from "lucide-react";
import api from "@/lib/api";
import { notifyApiError, notifySuccess } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { AuthGuard } from "@/components/auth-guard";
import { DoctorShell } from "@/components/doctor/doctor-shell";
import {
  EmptyState,
  PageHeader,
  SectionCard,
  SkeletonChartCard,
} from "@/components/doctor/ui";
import { WeeklyTimeline, MobileDayView } from "@/components/doctor/availability/weekly-timeline";
import { HeatmapCalendar } from "@/components/doctor/availability/heatmap-calendar";
import { FloatingSaveBar } from "@/components/doctor/availability/floating-save-bar";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import type {
  AvailabilityException,
  DoctorAvailability,
  TimeRange,
  WeeklySchedule,
} from "@/types/doctor";

/* ────────────────────────────── constants ────────────────────────────── */

const DAYS: { key: keyof WeeklySchedule; label: string; short: string }[] = [
  { key: "mon", label: "Monday", short: "Mon" },
  { key: "tue", label: "Tuesday", short: "Tue" },
  { key: "wed", label: "Wednesday", short: "Wed" },
  { key: "thu", label: "Thursday", short: "Thu" },
  { key: "fri", label: "Friday", short: "Fri" },
  { key: "sat", label: "Saturday", short: "Sat" },
  { key: "sun", label: "Sunday", short: "Sun" },
];

const SLOT_DURATIONS = [10, 20, 30] as const;
const DURATION_LABELS: Record<number, string> = {
  10: "Quick",
  20: "Standard",
  30: "Extended",
};

const EMPTY_WEEKLY: WeeklySchedule = {
  mon: [],
  tue: [],
  wed: [],
  thu: [],
  fri: [],
  sat: [],
  sun: [],
};

type ConflictState =
  | null
  | {
      type: "availability";
      appointments: {
        appointment_id: string;
        patient_name: string;
        scheduled_at: string;
      }[];
      confirmToken: string;
    }
  | {
      type: "exception";
      appointments: {
        appointment_id: string;
        patient_name: string;
        scheduled_at: string;
      }[];
      confirmToken: string;
    };

/* ────────────────────────────── helpers ────────────────────────────── */

function totalMinutes(slots: TimeRange[]): number {
  return slots.reduce((sum, s) => {
    const [sh, sm] = s.start.split(":").map(Number);
    const [eh, em] = s.end.split(":").map(Number);
    return sum + Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
  }, 0);
}

function minTime(slots: TimeRange[]) {
  return slots.reduce(
    (min, slot) => (slot.start < min ? slot.start : min),
    slots[0]?.start ?? ""
  );
}

function maxTime(slots: TimeRange[]) {
  return slots.reduce(
    (max, slot) => (slot.end > max ? slot.end : max),
    slots[0]?.end ?? ""
  );
}

function normalizeWeeklySchedule(weekly: WeeklySchedule): WeeklySchedule {
  return DAYS.reduce(
    (acc, { key }) => {
      acc[key] = [...weekly[key]].sort((a, b) =>
        a.start === b.start
          ? a.end.localeCompare(b.end)
          : a.start.localeCompare(b.start)
      );
      return acc;
    },
    { ...EMPTY_WEEKLY }
  );
}

function isSameConfig(
  current: DoctorAvailability | null | undefined,
  next: { weekly: WeeklySchedule; slotDuration: number; timezone: string }
) {
  if (!current) return false;
  return (
    current.slot_duration_min === next.slotDuration &&
    current.timezone === next.timezone &&
    JSON.stringify(normalizeWeeklySchedule(current.weekly)) ===
      JSON.stringify(normalizeWeeklySchedule(next.weekly))
  );
}

/* ────────────────────────────── page ────────────────────────────── */

export default function AvailabilityPage() {
  return (
    <AuthGuard role="doctor">
      <AvailabilityContent />
    </AuthGuard>
  );
}

function AvailabilityContent() {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isOnboarding = searchParams.get("onboarding") === "1";
  // Capture in a ref so mutation onSuccess closure always sees the current value
  const isOnboardingRef = useRef(isOnboarding);
  useEffect(() => { isOnboardingRef.current = isOnboarding; }, [isOnboarding]);

  /* ── Local editing state ── */
  const [weekly, setWeekly] = useState<WeeklySchedule>(EMPTY_WEEKLY);
  const [slotDuration, setSlotDuration] = useState<10 | 20 | 30>(20);
  const [timezone] = useState("Asia/Kolkata");

  /* ── Exception form state ── */
  const [exceptionOpen, setExceptionOpen] = useState(false);
  const [exceptionDate, setExceptionDate] = useState<Date | undefined>(
    new Date()
  );
  const [exceptionStatus, setExceptionStatus] = useState<
    "blocked" | "available"
  >("blocked");
  const [exceptionReason, setExceptionReason] = useState("");
  const [exceptionSlots, setExceptionSlots] = useState<TimeRange[]>([]);

  const [conflictState, setConflictState] = useState<ConflictState>(null);

  /* ── Queries ── */
  const { data: availability, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["doctor-availability"],
    queryFn: async () => {
      try {
        const { data } = await api.get("/doctor/availability");
        if (data.message || !data.weekly) return null;
        return data as DoctorAvailability;
      } catch {
        return null;
      }
    },
    refetchOnWindowFocus: false,
  });

  const { data: exceptions = [] } = useQuery({
    queryKey: ["doctor-exceptions"],
    queryFn: async () => {
      const today = format(new Date(), "yyyy-MM-dd");
      const until = format(addDays(new Date(), 90), "yyyy-MM-dd");
      const { data } = await api.get<AvailabilityException[]>(
        "/doctor/availability/exception",
        { params: { from: today, to: until } }
      );
      return data;
    },
  });

  /* Sync editing state from server whenever query data refreshes.
     dataUpdatedAt changes only on actual server fetch, not on re-renders. */
  const lastSyncedAt = useRef(0);
  useEffect(() => {
    if (dataUpdatedAt && dataUpdatedAt !== lastSyncedAt.current) {
      lastSyncedAt.current = dataUpdatedAt;
      if (availability) {
        setWeekly({ ...EMPTY_WEEKLY, ...availability.weekly });
        setSlotDuration(availability.slot_duration_min);
      } else {
        setWeekly(EMPTY_WEEKLY);
        setSlotDuration(20);
      }
    }
  }, [dataUpdatedAt, availability]);

  /* ── Derived values ── */
  const isDirty = useMemo(() => {
    if (availability) {
      return !isSameConfig(availability, { weekly, slotDuration, timezone });
    }
    // First-time setup: dirty if user has added any slots
    return DAYS.some((d) => weekly[d.key].length > 0);
  }, [availability, weekly, slotDuration, timezone]);

  const activeDaysCount = DAYS.filter((d) => weekly[d.key].length > 0).length;

  const weeklyMinutes = useMemo(
    () => DAYS.reduce((sum, d) => sum + totalMinutes(weekly[d.key]), 0),
    [weekly]
  );
  const weeklyHours = Math.round((weeklyMinutes / 60) * 10) / 10;

  const upcomingExceptions = useMemo(
    () =>
      exceptions.filter(
        (e) => !isBefore(parseISO(e.date), startOfDay(new Date()))
      ),
    [exceptions]
  );

  /* ── Mutations ── */
  const saveScheduleMutation = useMutation({
    mutationFn: async (confirmToken?: string) => {
      const payload = {
        weekly,
        slot_duration_min: slotDuration,
        timezone,
      };
      if (availability) {
        return api.put("/doctor/availability", payload, {
          params: confirmToken ? { confirm_token: confirmToken } : undefined,
        });
      }
      return api.post("/doctor/availability", payload);
    },
    onSuccess: () => {
      if (isOnboardingRef.current) {
        notifySuccess("Setup complete!", "Your profile is now pending admin verification.");
        queryClient.invalidateQueries({ queryKey: ["doctor-availability"] });
        queryClient.invalidateQueries({ queryKey: ["doctor-appointments-range"] });
        setConflictState(null);
        router.push("/doctor/profile");
      } else {
        notifySuccess("Availability updated", "Your schedule changes are now live.");
        setConflictState(null);
        queryClient.invalidateQueries({ queryKey: ["doctor-availability"] });
        queryClient.invalidateQueries({ queryKey: ["doctor-appointments-range"] });
      }
    },
    onError: (err) => notifyApiError(err, "Couldn't save availability"),
  });

  const addExceptionMutation = useMutation({
    mutationFn: async (confirmToken?: string) => {
      const payload = {
        date: format(exceptionDate ?? new Date(), "yyyy-MM-dd"),
        status: exceptionStatus,
        reason: exceptionReason || undefined,
        time_slots: exceptionSlots,
      };
      return api.post("/doctor/availability/exception", payload, {
        params: confirmToken ? { confirm_token: confirmToken } : undefined,
      });
    },
    onSuccess: () => {
      notifySuccess("Exception saved", "The selected date has been updated.");
      setExceptionOpen(false);
      setConflictState(null);
      resetExceptionForm();
      queryClient.invalidateQueries({ queryKey: ["doctor-exceptions"] });
    },
    onError: (err) => notifyApiError(err, "Couldn't save exception"),
  });

  const deleteExceptionMutation = useMutation({
    mutationFn: async (id: string) =>
      api.delete(`/doctor/availability/exception/${id}`),
    onSuccess: () => {
      notifySuccess("Exception removed", "Date is back to normal availability.");
      queryClient.invalidateQueries({ queryKey: ["doctor-exceptions"] });
    },
    onError: (err) => notifyApiError(err, "Couldn't remove exception"),
  });

  /* ── Handlers ── */
  function resetExceptionForm() {
    setExceptionDate(new Date());
    setExceptionStatus("blocked");
    setExceptionReason("");
    setExceptionSlots([]);
  }

  async function handleSave() {
    try {
      if (!isDirty) {
        notifySuccess("Already up to date", "No changes detected.");
        return;
      }
      if (availability) {
        const { data } = await api.post("/doctor/availability/conflicts-preview", {
          weekly,
          slot_duration_min: slotDuration,
          timezone,
        });
        if (data.count > 0) {
          setConflictState({
            type: "availability",
            appointments: data.appointments,
            confirmToken: data.confirm_token,
          });
          return;
        }
      }
      await saveScheduleMutation.mutateAsync(undefined);
    } catch (error) {
      notifyApiError(error, "Couldn't preview schedule changes");
    }
  }

  function handleDiscard() {
    if (availability) {
      setWeekly({ ...EMPTY_WEEKLY, ...availability.weekly });
      setSlotDuration(availability.slot_duration_min);
    } else {
      setWeekly(EMPTY_WEEKLY);
      setSlotDuration(20);
    }
  }

  async function handleExceptionSave() {
    if (!exceptionDate) return;
    try {
      if (exceptionStatus === "blocked") {
        const params: Record<string, string> = {
          date: format(exceptionDate, "yyyy-MM-dd"),
        };
        if (exceptionSlots.length > 0) {
          params.start_time = minTime(exceptionSlots);
          params.end_time = maxTime(exceptionSlots);
        }
        const { data } = await api.get("/doctor/schedule/conflicts", {
          params,
        });
        if (data.count > 0) {
          setConflictState({
            type: "exception",
            appointments: data.appointments,
            confirmToken: data.confirm_token,
          });
          return;
        }
      }
      await addExceptionMutation.mutateAsync(undefined);
    } catch (error) {
      notifyApiError(error, "Couldn't preview exception");
    }
  }

  const openExceptionForDate = useCallback(
    (date: Date) => {
      setExceptionDate(date);
      setExceptionStatus("blocked");
      setExceptionReason("");
      setExceptionSlots([]);
      setExceptionOpen(true);
    },
    []
  );

  /* ────────────────────────────── render ────────────────────────────── */

  return (
    <DoctorShell title="Availability" subtitle="Set your weekly schedule so patients can book with you">
      {isLoading ? (
        <div className="space-y-6">
          <SkeletonChartCard />
          <SkeletonChartCard />
        </div>
      ) : (
        <div className="space-y-6">
          {/* ═══════ Onboarding Banner (only during setup flow) ═══════ */}
          <AnimatePresence>
            {isOnboarding && (
              <motion.div
                initial={{ opacity: 0, y: -16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.98 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden rounded-2xl border border-brand/15 bg-gradient-to-r from-brand/[0.07] via-brand/[0.04] to-transparent"
              >
                <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                  {/* Left — step track */}
                  <div className="flex items-center gap-4">
                    {/* Step 1 done */}
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand">
                        <CheckCircle2 className="h-4 w-4 text-white" />
                      </div>
                      <div className="hidden sm:block">
                        <p className="text-xs font-semibold text-brand">Profile Setup</p>
                        <p className="text-[10px] text-brand/60">Complete</p>
                      </div>
                    </div>

                    {/* Connector */}
                    <div className="hidden h-px w-8 bg-brand/20 sm:block">
                      <motion.div
                        className="h-full bg-brand/60"
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: 1 }}
                        transition={{ delay: 0.3, duration: 0.5, ease: "easeOut" }}
                        style={{ originX: 0 }}
                      />
                    </div>

                    {/* Step 2 current */}
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-brand bg-white shadow-[0_0_0_4px_rgba(59,130,246,0.1)]">
                        <motion.div
                          animate={{ scale: [1, 1.15, 1] }}
                          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                        >
                          <span className="text-xs font-bold text-brand">2</span>
                        </motion.div>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-900">Availability Setup</p>
                        <p className="text-[10px] text-slate-500">In progress</p>
                      </div>
                    </div>

                    {/* Connector */}
                    <div className="hidden h-px w-8 bg-slate-200 sm:block" />

                    {/* Step 3 — go live */}
                    <div className="hidden items-center gap-2 sm:flex">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-slate-200 bg-white">
                        <User className="h-3.5 w-3.5 text-slate-300" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-400">Go Live</p>
                        <p className="text-[10px] text-slate-300">Pending</p>
                      </div>
                    </div>
                  </div>

                  {/* Right — CTA text */}
                  <div className="flex-shrink-0">
                    <p className="text-[11px] font-medium text-brand/70">
                      Set your schedule → patients can book
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-400">
                      <ArrowRight className="h-3 w-3" />
                      Save your schedule when ready
                    </p>
                  </div>
                </div>

                {/* Animated progress bar at bottom */}
                <div className="h-0.5 bg-brand/10">
                  <motion.div
                    className="h-full bg-gradient-to-r from-brand to-brand/60"
                    initial={{ width: "50%" }}
                    animate={{ width: "75%" }}
                    transition={{ delay: 0.5, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ═══════ Page Header + Slot Duration ═══════ */}
          <PageHeader
            compact
            title="Availability"
            description="Manage your weekly schedule, slot duration, and day-off exceptions"
            actions={
              <div className="flex items-center gap-3">
                {/* Slot duration segmented control */}
                <div className="flex items-center gap-2 rounded-xl border border-border/30 bg-white px-3 py-1.5">
                  <Timer className="h-3.5 w-3.5 text-brand-subtext/50" />
                  <div className="flex gap-1">
                    {SLOT_DURATIONS.map((d) => (
                      <button
                        key={d}
                        onClick={() => setSlotDuration(d)}
                        className={cn(
                          "rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all",
                          slotDuration === d
                            ? "bg-brand text-white shadow-sm shadow-brand/20"
                            : "text-brand-subtext hover:text-brand-dark hover:bg-brand-bg/60"
                        )}
                      >
                        {d}m
                        <span className="ml-1 hidden text-[9px] font-normal opacity-70 lg:inline">
                          {DURATION_LABELS[d]}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setExceptionOpen(true)}
                >
                  <CalendarX className="h-4 w-4" />
                  <span className="hidden sm:inline">Add exception</span>
                </Button>
              </div>
            }
          />

          {/* ═══════ Main Content ═══════ */}
          {isMobile ? (
            /* ─── Mobile layout: tabs ─── */
            <Tabs defaultValue="schedule">
              <TabsList className="grid w-full grid-cols-3 rounded-xl bg-brand-bg/50 p-1">
                <TabsTrigger value="schedule" className="rounded-lg text-xs">
                  Schedule
                </TabsTrigger>
                <TabsTrigger value="calendar" className="rounded-lg text-xs">
                  Calendar
                </TabsTrigger>
                <TabsTrigger value="exceptions" className="rounded-lg text-xs">
                  Exceptions
                </TabsTrigger>
              </TabsList>

              <TabsContent value="schedule">
                <SectionCard elevated className="mt-4">
                  <MobileDayView weekly={weekly} onChange={setWeekly} />
                </SectionCard>
              </TabsContent>

              <TabsContent value="calendar">
                <SectionCard elevated className="mt-4">
                  <HeatmapCalendar
                    weekly={weekly}
                    exceptions={exceptions}
                    onDayClick={openExceptionForDate}
                  />
                </SectionCard>
              </TabsContent>

              <TabsContent value="exceptions">
                <SectionCard elevated className="mt-4">
                  <ExceptionsList
                    exceptions={upcomingExceptions}
                    onDelete={(id) => deleteExceptionMutation.mutate(id)}
                    onAdd={() => setExceptionOpen(true)}
                  />
                </SectionCard>
              </TabsContent>
            </Tabs>
          ) : (
            /* ─── Desktop layout: timeline + sidebar ─── */
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
              {/* Timeline */}
              <SectionCard elevated>
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-brand-dark">
                      Weekly schedule
                    </p>
                    <p className="mt-0.5 text-xs text-brand-subtext">
                      {activeDaysCount > 0 ? (
                        <>
                          {activeDaysCount} active day{activeDaysCount !== 1 && "s"}
                          {" · "}
                          {weeklyHours}h/week
                          {" · "}
                          {timezone}
                        </>
                      ) : (
                        "No days configured yet"
                      )}
                    </p>
                  </div>
                </div>
                <WeeklyTimeline
                  weekly={weekly}
                  onChange={setWeekly}
                />
              </SectionCard>

              {/* Sidebar */}
              <div className="space-y-6">
                {/* Heatmap calendar */}
                <SectionCard elevated>
                  <div className="mb-3">
                    <p className="text-sm font-semibold text-brand-dark">
                      Monthly overview
                    </p>
                    <p className="text-xs text-brand-subtext">
                      Click a day to add an exception
                    </p>
                  </div>
                  <HeatmapCalendar
                    weekly={weekly}
                    exceptions={exceptions}
                    onDayClick={openExceptionForDate}
                  />
                </SectionCard>

                {/* Exceptions */}
                <SectionCard elevated>
                  <ExceptionsList
                    exceptions={upcomingExceptions}
                    onDelete={(id) => deleteExceptionMutation.mutate(id)}
                    onAdd={() => setExceptionOpen(true)}
                  />
                </SectionCard>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════ Floating Save Bar ═══════ */}
      <FloatingSaveBar
        visible={isDirty}
        saving={saveScheduleMutation.isPending}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />

      {/* ═══════ Exception Sheet ═══════ */}
      <Sheet
        open={exceptionOpen}
        onOpenChange={(open) => {
          setExceptionOpen(open);
          if (!open) resetExceptionForm();
        }}
      >
        <SheetContent
          className="w-full overflow-y-auto sm:max-w-md"
          side={isMobile ? "bottom" : "center"}
        >
          <SheetHeader>
            <SheetTitle>Add exception</SheetTitle>
            <SheetDescription>
              Block a date or add special hours that override your weekly
              schedule.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-5 px-4 pb-4">
            {/* Date picker */}
            <div className="flex justify-center">
              <Calendar
                mode="single"
                selected={exceptionDate}
                onSelect={setExceptionDate}
                disabled={{ before: new Date() }}
              />
            </div>

            {exceptionDate && (
              <p className="text-center text-xs font-medium text-brand-dark">
                {format(exceptionDate, "EEEE, dd MMMM yyyy")}
              </p>
            )}

            {/* Type toggle */}
            <div className="flex gap-2 rounded-xl bg-brand-bg/50 p-1">
              <button
                onClick={() => setExceptionStatus("blocked")}
                className={cn(
                  "flex-1 rounded-lg py-2.5 text-xs font-semibold transition-all",
                  exceptionStatus === "blocked"
                    ? "bg-white text-red-500 shadow-sm"
                    : "text-brand-subtext hover:text-brand-dark"
                )}
              >
                Unavailable
              </button>
              <button
                onClick={() => setExceptionStatus("available")}
                className={cn(
                  "flex-1 rounded-lg py-2.5 text-xs font-semibold transition-all",
                  exceptionStatus === "available"
                    ? "bg-white text-emerald-600 shadow-sm"
                    : "text-brand-subtext hover:text-brand-dark"
                )}
              >
                Available override
              </button>
            </div>

            {/* Time slots */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium text-brand-dark">
                  Time windows
                  <span className="ml-1.5 font-normal text-brand-subtext">
                    (empty = whole day)
                  </span>
                </p>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() =>
                    setExceptionSlots((p) => [
                      ...p,
                      { start: "09:00", end: "12:00" },
                    ])
                  }
                >
                  <Plus className="h-3 w-3" /> Add
                </Button>
              </div>
              <div className="space-y-2">
                {exceptionSlots.length === 0 ? (
                  <div className="rounded-xl bg-brand-bg/30 py-4 text-center text-xs text-brand-subtext">
                    Applies to the entire day
                  </div>
                ) : (
                  exceptionSlots.map((slot, index) => (
                    <div
                      key={`exc-slot-${index}`}
                      className="flex flex-wrap items-center gap-2 rounded-xl bg-brand-bg/30 px-3 py-2.5"
                    >
                      <Input
                        type="time"
                        value={slot.start}
                        onChange={(e) =>
                          setExceptionSlots((p) =>
                            p.map((s, i) =>
                              i === index
                                ? { ...s, start: e.target.value }
                                : s
                            )
                          )
                        }
                        className="h-9 w-full text-xs sm:h-8 sm:w-[7rem]"
                      />
                      <span className="text-xs text-brand-subtext">–</span>
                      <Input
                        type="time"
                        value={slot.end}
                        onChange={(e) =>
                          setExceptionSlots((p) =>
                            p.map((s, i) =>
                              i === index
                                ? { ...s, end: e.target.value }
                                : s
                            )
                          )
                        }
                        className="h-9 w-full text-xs sm:h-8 sm:w-[7rem]"
                      />
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        className="ml-auto text-brand-subtext/40 hover:bg-red-50 hover:text-red-500"
                        onClick={() =>
                          setExceptionSlots((p) =>
                            p.filter((_, i) => i !== index)
                          )
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Reason */}
            <div>
              <p className="mb-1.5 text-xs font-medium text-brand-dark">
                Reason (optional)
              </p>
              <Textarea
                value={exceptionReason}
                onChange={(e) => setExceptionReason(e.target.value)}
                placeholder="Holiday, conference, personal..."
                rows={3}
                className="text-xs"
              />
            </div>
          </div>

          <SheetFooter>
            <Button
              onClick={handleExceptionSave}
              loading={addExceptionMutation.isPending}
            >
              <Save className="h-4 w-4" /> Save exception
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* ═══════ Conflict Dialog ═══════ */}
      <ConflictDialog
        conflictState={conflictState}
        onClose={() => setConflictState(null)}
        onConfirm={async () => {
          if (!conflictState) return;
          if (conflictState.type === "availability") {
            await saveScheduleMutation.mutateAsync(conflictState.confirmToken);
          } else {
            await addExceptionMutation.mutateAsync(conflictState.confirmToken);
          }
        }}
      />
    </DoctorShell>
  );
}

/* ────────────────────────────── Exceptions List ────────────────────────────── */

function ExceptionsList({
  exceptions,
  onDelete,
  onAdd,
}: {
  exceptions: AvailabilityException[];
  onDelete: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-brand-dark">Exceptions</p>
          <p className="text-xs text-brand-subtext">
            {exceptions.length} upcoming
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </div>

      <div className="max-h-[28rem] space-y-2 overflow-y-auto">
        {exceptions.length === 0 ? (
          <EmptyState
            icon={CalendarX}
            title="No exceptions set"
            description="Click a day on the calendar or use the add button"
            size="sm"
            className="rounded-xl bg-brand-bg/30"
          />
        ) : (
          <AnimatePresence>
            {exceptions.map((exc, i) => (
              <motion.div
                key={exc.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ delay: i * 0.03 }}
                className="group rounded-xl border border-border/15 px-4 py-3 transition-colors hover:bg-brand-bg/30"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "inline-block h-2 w-2 shrink-0 rounded-full",
                          exc.status === "blocked"
                            ? "bg-red-400"
                            : "bg-emerald-500"
                        )}
                      />
                      <span className="text-sm font-medium text-brand-dark">
                        {format(parseISO(exc.date), "EEE, dd MMM")}
                      </span>
                    </div>
                    <p className="mt-1 pl-4 text-xs text-brand-subtext">
                      {exc.status === "blocked"
                        ? "Unavailable"
                        : "Available override"}
                      {" · "}
                      {exc.time_slots?.length
                        ? exc.time_slots
                            .map((s) => `${s.start}-${s.end}`)
                            .join(", ")
                        : "Whole day"}
                    </p>
                    {exc.reason && (
                      <p className="mt-0.5 pl-4 text-xs text-brand-subtext/60">
                        {exc.reason}
                      </p>
                    )}
                    {((exc.cancelled ?? 0) > 0 || (exc.rescheduled ?? 0) > 0) && (
                      <p className="mt-1 pl-4 text-[11px] text-amber-600">
                        {exc.rescheduled ?? 0} rescheduled ·{" "}
                        {exc.cancelled ?? 0} cancelled
                      </p>
                    )}
                  </div>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    className="shrink-0 text-brand-subtext/40 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-50 hover:text-red-500"
                    onClick={() => onDelete(exc.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </>
  );
}

/* ────────────────────────────── Conflict Dialog ────────────────────────────── */

function ConflictDialog({
  conflictState,
  onClose,
  onConfirm,
}: {
  conflictState: ConflictState;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  if (!conflictState) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {conflictState.appointments.length} appointment
            {conflictState.appointments.length === 1 ? "" : "s"} affected
          </DialogTitle>
          <DialogDescription>
            These appointments may be rescheduled or cancelled if you continue.
          </DialogDescription>
        </DialogHeader>
        <Separator />
        <div className="max-h-[16rem] space-y-2 overflow-y-auto">
          {conflictState.appointments.map((item) => (
            <div
              key={item.appointment_id}
              className="flex items-center gap-3 rounded-xl bg-brand-bg/40 px-3 py-2.5"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] font-bold text-amber-600">
                {item.patient_name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-brand-dark">
                  {item.patient_name}
                </p>
                <p className="text-[11px] text-brand-subtext">
                  {new Date(item.scheduled_at).toLocaleString("en-IN", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="flex-1 bg-amber-500 text-white hover:bg-amber-600"
            onClick={async () => {
              await onConfirm();
              onClose();
            }}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Confirm changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
