"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef, ColumnFiltersState } from "@tanstack/react-table";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Ban,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Filter,
  LayoutGrid,
  List,
  Loader2,
  MonitorPlay,
  MapPin,
  Phone,
  Search,
  TrendingUp,
  Users,
  XCircle,
} from "lucide-react";
import {
  format,
  formatDistanceToNowStrict,
  isAfter,
  isBefore,
  isSameDay,
  isToday,
  isTomorrow,
  parseISO,
  startOfDay,
  endOfDay,
  addDays,
} from "date-fns";

import api from "@/lib/api";
import { notifyApiError, notifySuccess } from "@/lib/notify";
import { cn, getInitials } from "@/lib/utils";
import { AuthGuard } from "@/components/auth-guard";
import { DoctorShell } from "@/components/doctor/doctor-shell";
import { DataTable, PageHeader, StatusBadge } from "@/components/doctor/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DoctorAppointment } from "@/types/doctor";

/* ─── helpers ───────────────────────────────────────────────────── */

function getPaymentLabel(a: DoctorAppointment) {
  if (a.payment_status === "paid" || a.payment_status === "transferred")
    return a.mode === "online" ? "Paid online" : "Paid";
  if (a.payment_status === "refunded") return "Refunded";
  if (a.payment_choice === "pay_at_clinic") return "Pay at clinic";
  if (a.payment_status === "pending") return "Payment pending";
  return "Awaiting payment";
}

const STATUS_COLOR_BAR: Record<string, string> = {
  confirmed: "bg-blue-500",
  completed: "bg-emerald-500",
  cancelled: "bg-slate-400",
  no_show: "bg-amber-500",
  pending_payment: "bg-violet-400",
};

type TabKey = "today" | "upcoming" | "past" | "cancelled";

const TABS: { key: TabKey; label: string; icon: typeof Calendar }[] = [
  { key: "today", label: "Today", icon: Clock },
  { key: "upcoming", label: "Upcoming", icon: Calendar },
  { key: "past", label: "Past", icon: CheckCircle2 },
  { key: "cancelled", label: "Cancelled", icon: XCircle },
];

type QuickFilter =
  | "all"
  | "online"
  | "walk_in"
  | "needs_rx"
  | "payment_pending";

const QUICK_FILTERS: { key: QuickFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "online", label: "Online" },
  { key: "walk_in", label: "Walk-in" },
  { key: "needs_rx", label: "Needs Rx" },
  { key: "payment_pending", label: "Payment Pending" },
];

/* ─── action dialog config ──────────────────────────────────────── */

type AppointmentActionKind = "complete" | "no_show";

const ACTION_DIALOG_COPY: Record<
  AppointmentActionKind,
  {
    buttonLabel: string;
    confirmLabel: string;
    title: string;
    description: string;
    buttonClassName: string;
    confirmButtonClassName: string;
    icon: typeof CheckCircle2;
  }
> = {
  complete: {
    buttonLabel: "Complete",
    confirmLabel: "Yes, complete",
    title: "Mark appointment as completed?",
    description:
      "This will close the consult and update the patient status for follow-up eligibility.",
    buttonClassName:
      "h-8 rounded-xl border border-emerald-200/80 bg-emerald-50/90 px-3 text-emerald-700 shadow-none hover:bg-emerald-100 hover:text-emerald-800",
    confirmButtonClassName:
      "min-w-[132px] rounded-xl bg-emerald-600 text-white hover:bg-emerald-700",
    icon: CheckCircle2,
  },
  no_show: {
    buttonLabel: "No-show",
    confirmLabel: "Yes, mark no-show",
    title: "Mark patient as no-show?",
    description:
      "Use this when the patient did not attend the appointment and the consult should stay uncompleted.",
    buttonClassName:
      "h-8 rounded-xl border border-amber-200/80 bg-amber-50/90 px-3 text-amber-700 shadow-none hover:bg-amber-100 hover:text-amber-800",
    confirmButtonClassName:
      "min-w-[132px] rounded-xl bg-amber-500 text-brand-dark hover:bg-amber-400",
    icon: Ban,
  },
};

/* ─── page wrapper ──────────────────────────────────────────────── */

export default function AppointmentsPage() {
  return (
    <AuthGuard role="doctor">
      <AppointmentsContent />
    </AuthGuard>
  );
}

function useNow(intervalMs = 60000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/* ─── main content ──────────────────────────────────────────────── */

function AppointmentsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabKey>("today");
  const [viewMode, setViewMode] = useState<"table" | "cards">("cards");
  const [searchQuery, setSearchQuery] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");

  const containerRef = useRef<HTMLDivElement>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const focusId = searchParams.get("focus");

  // Fetch a wide range (30 days back + 7 days forward) to populate all tabs
  const fromStr = format(addDays(new Date(), -30), "yyyy-MM-dd");
  const toStr = format(addDays(new Date(), 7), "yyyy-MM-dd");

  const { data: appointments, isLoading } = useQuery({
    queryKey: ["doctor-appointments-range", fromStr, toStr],
    queryFn: async () => {
      const { data } = await api.get<{ appointments: DoctorAppointment[] }>(
        "/doctor/appointments/range",
        { params: { from: fromStr, to: toStr } },
      );
      return data.appointments;
    },
    staleTime: 30_000,
  });

  const refreshData = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["doctor-appointments-range", fromStr, toStr],
      }),
      queryClient.invalidateQueries({ queryKey: ["doctor-stats"] }),
    ]);
  }, [queryClient, fromStr, toStr]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let startY = 0;
    let isTracking = false;

    const handleTouchStart = (e: TouchEvent) => {
      if (window.scrollY === 0) {
        startY = e.touches[0].clientY;
        isTracking = true;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isTracking) return;
      const currentY = e.touches[0].clientY;
      const diffY = currentY - startY;

      if (diffY > 0) {
        if (e.cancelable) {
          e.preventDefault();
        }
        const dist = Math.min(diffY * 0.4, 80);
        setPullDistance(dist);
      } else {
        isTracking = false;
        setPullDistance(0);
      }
    };

    const handleTouchEnd = () => {
      if (!isTracking) return;
      isTracking = false;

      if (pullDistance > 50) {
        setIsRefreshing(true);
        refreshData().finally(() => {
          setIsRefreshing(false);
          setPullDistance(0);
        });
      } else {
        setPullDistance(0);
      }
    };

    container.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    container.addEventListener("touchmove", handleTouchMove, {
      passive: false,
    });
    container.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
    };
  }, [pullDistance, refreshData]);

  // Sort all appointments by time
  const sorted = useMemo(() => {
    if (!appointments) return [];
    return [...appointments].sort(
      (a, b) =>
        new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime(),
    );
  }, [appointments]);

  // Tab filtering
  const now = useNow(60000);
  const tabFiltered = useMemo(() => {
    switch (activeTab) {
      case "today":
        return sorted.filter((a) => isToday(parseISO(a.scheduled_at)));
      case "upcoming":
        return sorted.filter(
          (a) =>
            isAfter(parseISO(a.scheduled_at), endOfDay(now)) &&
            (a.status === "confirmed" || a.status === "pending_payment"),
        );
      case "past":
        return sorted.filter(
          (a) =>
            a.status === "completed" ||
            (isBefore(parseISO(a.scheduled_at), startOfDay(now)) &&
              a.status !== "cancelled" &&
              a.status !== "no_show"),
        );
      case "cancelled":
        return sorted.filter(
          (a) => a.status === "cancelled" || a.status === "no_show",
        );
      default:
        return sorted;
    }
  }, [activeTab, sorted, now]);

  // Quick filters
  const quickFiltered = useMemo(() => {
    let result = tabFiltered;
    if (quickFilter === "online")
      result = result.filter((a) => a.mode === "online");
    else if (quickFilter === "walk_in")
      result = result.filter((a) => a.mode === "walk_in");
    else if (quickFilter === "needs_rx")
      result = result.filter(
        (a) =>
          a.prescription_status === "none" || a.prescription_status === "draft",
      );
    else if (quickFilter === "payment_pending")
      result = result.filter(
        (a) => a.payment_status === "pending" || a.payment_status === "unpaid",
      );
    return result;
  }, [tabFiltered, quickFilter]);

  // Search
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return quickFiltered;
    const q = searchQuery.toLowerCase();
    return quickFiltered.filter(
      (a) =>
        a.patient.full_name?.toLowerCase().includes(q) ||
        a.patient.phone?.toLowerCase().includes(q) ||
        a.patient.email?.toLowerCase().includes(q),
    );
  }, [quickFiltered, searchQuery]);

  // Stats for today
  const todayAll = useMemo(
    () => sorted.filter((a) => isToday(parseISO(a.scheduled_at))),
    [sorted],
  );

  const stats = useMemo(() => {
    const total = todayAll.length;
    const completed = todayAll.filter((a) => a.status === "completed").length;
    const upcoming = todayAll.filter(
      (a) =>
        ["confirmed", "pending_payment", "rescheduled"].includes(a.status) &&
        isAfter(parseISO(a.scheduled_at), now),
    ).length;
    const noShows = todayAll.filter((a) => a.status === "no_show").length;
    return { total, completed, upcoming, noShows };
  }, [todayAll, now]);

  // "Up Next" appointment — the closest confirmed appointment in the future
  const upNext = useMemo(() => {
    const todayConfirmed = todayAll
      .filter((a) => a.status === "confirmed")
      .sort(
        (a, b) =>
          new Date(a.scheduled_at).getTime() -
          new Date(b.scheduled_at).getTime(),
      );
    return (
      todayConfirmed.find((a) => isAfter(parseISO(a.scheduled_at), now)) ??
      todayConfirmed[0] ??
      null
    );
  }, [todayAll, now]);

  const minutesDiff = useMemo(() => {
    if (!upNext) return 0;
    return Math.round(
      (parseISO(upNext.scheduled_at).getTime() - now.getTime()) / 60000,
    );
  }, [upNext, now]);

  // Group today's appointments by time period for agenda view
  const todayGrouped = useMemo(() => {
    const morning: DoctorAppointment[] = [];
    const afternoon: DoctorAppointment[] = [];
    const evening: DoctorAppointment[] = [];
    for (const a of filtered) {
      if (activeTab !== "today") break;
      const hour = parseISO(a.scheduled_at).getHours();
      if (hour < 12) morning.push(a);
      else if (hour < 17) afternoon.push(a);
      else evening.push(a);
    }
    return [
      { label: "Morning", items: morning },
      { label: "Afternoon", items: afternoon },
      { label: "Evening", items: evening },
    ].filter((g) => g.items.length > 0);
  }, [filtered, activeTab]);

  // Navigate to detail page
  const openDetail = useCallback(
    (id: string) => {
      router.push(`/doctor/appointments/${id}`);
    },
    [router],
  );

  /* ─── table columns (for table view) ──────────────────────────── */
  const columns: ColumnDef<DoctorAppointment>[] = useMemo(
    () => [
      {
        accessorKey: "patient.full_name",
        header: "Patient",
        cell: ({ row }) => {
          const a = row.original;
          const initials = getInitials(a.patient.full_name);
          return (
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand/20 to-brand/5 text-[11px] font-bold text-brand">
                {initials}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-brand-dark">
                  {a.patient.full_name}
                </p>
                <p className="text-xs text-brand-subtext">
                  {a.patient.age ? `${a.patient.age}y` : "-"}
                  {a.patient.sex ? ` / ${a.patient.sex}` : ""}
                </p>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "scheduled_at",
        header: "Scheduled",
        cell: ({ row }) => {
          const dt = parseISO(row.original.scheduled_at);
          return (
            <div>
              <p className="text-sm font-semibold text-brand-dark">
                {format(dt, "hh:mm a")}
              </p>
              <p className="text-xs text-brand-subtext">
                {format(dt, "dd MMM yyyy")}
              </p>
            </div>
          );
        },
      },
      {
        accessorKey: "mode",
        header: "Mode",
        cell: ({ row }) => (
          <StatusBadge variant={row.original.mode} dot size="xs" />
        ),
      },
      {
        accessorKey: "fee",
        header: "Payment",
        cell: ({ row }) => (
          <div>
            <p className="text-sm font-semibold text-brand-dark">
              ₹ {(row.original.fee || 0).toLocaleString("en-IN")}
            </p>
            <p className="text-xs text-brand-subtext">
              {getPaymentLabel(row.original)}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          const a = row.original;
          const waiting =
            a.video_enabled &&
            a.mode === "online" &&
            a.call_status === "waiting";
          return (
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge
                variant={
                  a.status as
                    | "confirmed"
                    | "completed"
                    | "cancelled"
                    | "no_show"
                    | "pending_payment"
                }
                className="rounded-xl"
              />
              {waiting && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                  Waiting
                </span>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "prescription_status",
        header: "Rx",
        cell: ({ row }) => {
          const s = row.original.prescription_status ?? "none";
          if (s === "final")
            return (
              <StatusBadge
                variant="final"
                className="rounded-xl"
                label="Finalized"
              />
            );
          if (s === "draft")
            return (
              <StatusBadge
                variant="draft"
                className="rounded-xl"
                label="Draft"
              />
            );
          return <span className="text-xs text-brand-subtext">—</span>;
        },
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => {
          const a = row.original;
          const isWaiting =
            a.video_enabled &&
            a.mode === "online" &&
            (a.call_status === "waiting" ||
              a.call_status === "connected" ||
              a.call_status === "disconnected");
          return (
            <div className="flex items-center gap-1.5">
              {isWaiting && (
                <Button
                  size="sm"
                  className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(
                      `/doctor/appointments/${a.appointment_id}?step=consultation`,
                    );
                  }}
                >
                  <Phone className="h-3.5 w-3.5" />
                  {a.call_status === "connected" ||
                  a.call_status === "disconnected"
                    ? "Rejoin"
                    : "Join"}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="rounded-xl text-brand-subtext hover:text-brand-dark"
                onClick={(e) => {
                  e.stopPropagation();
                  openDetail(a.appointment_id);
                }}
              >
                <Eye className="h-3.5 w-3.5" />
                View
              </Button>
            </div>
          );
        },
      },
    ],
    [router, openDetail],
  );

  return (
    <DoctorShell title="Appointments" subtitle={format(now, "EEEE, dd MMMM")}>
      <div ref={containerRef} className="page-stack space-y-6">
        {/* Pull to refresh indicator */}
        {(pullDistance > 0 || isRefreshing) && (
          <div
            style={{
              height: isRefreshing ? 50 : pullDistance,
              opacity: isRefreshing ? 1 : Math.min(pullDistance / 50, 1),
              marginBottom: isRefreshing || pullDistance > 0 ? 12 : 0,
            }}
            className="flex items-center justify-center overflow-hidden transition-all duration-150"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-md border border-border/40">
              {isRefreshing ? (
                <Loader2 className="h-4 w-4 animate-spin text-brand" />
              ) : (
                <motion.div
                  animate={{ rotate: pullDistance * 4 }}
                  transition={{ type: "tween", duration: 0 }}
                >
                  <ArrowRight className="h-4 w-4 rotate-90 text-brand-subtext" />
                </motion.div>
              )}
            </div>
          </div>
        )}
        {/* ─── Stat cards ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Today's Total"
            value={stats.total}
            icon={Users}
            color="blue"
          />
          <StatCard
            label="Completed"
            value={stats.completed}
            icon={CheckCircle2}
            color="green"
          />
          <StatCard
            label="Upcoming"
            value={stats.upcoming}
            icon={Clock}
            color="violet"
          />
          <StatCard
            label="No-shows"
            value={stats.noShows}
            icon={XCircle}
            color="amber"
          />
        </div>

        {/* ─── Today's progress bar ──────────────────────────── */}
        {activeTab === "today" && stats.total > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-border/60 bg-white p-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-brand" />
                <span className="text-sm font-medium text-brand-dark">
                  Today&apos;s Progress
                </span>
              </div>
              <span className="text-sm font-semibold text-brand-dark">
                {stats.completed} of {stats.total} done
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-brand-bg">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-brand to-emerald-400"
                initial={{ width: 0 }}
                animate={{
                  width: `${stats.total > 0 ? (stats.completed / stats.total) * 100 : 0}%`,
                }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
            </div>
          </motion.div>
        )}

        {/* ─── Up Next panel ─────────────────────────────────── */}
        {activeTab === "today" && upNext && upNext.status === "confirmed" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="group relative overflow-hidden rounded-2xl border border-brand/20 bg-gradient-to-r from-brand/5 via-white to-brand/5 p-4 sm:p-5"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(88,155,255,0.08),transparent_50%)]" />
            <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-sm font-bold text-brand sm:flex">
                  {getInitials(upNext.patient.full_name)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand">
                      Up Next
                    </span>
                    <span className="text-xs text-brand-subtext">
                      {format(parseISO(upNext.scheduled_at), "hh:mm a")}
                    </span>
                    {/* Live countdown timer */}
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-all duration-300",
                        minutesDiff > 0 && minutesDiff <= 15
                          ? "bg-amber-100 text-amber-700 animate-pulse"
                          : minutesDiff <= 0
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-brand-bg text-brand-subtext",
                      )}
                    >
                      <Clock className="h-2.5 w-2.5" />
                      {minutesDiff > 0
                        ? minutesDiff < 60
                          ? `in ${minutesDiff}m`
                          : `in ${Math.floor(minutesDiff / 60)}h ${minutesDiff % 60}m`
                        : Math.abs(minutesDiff) < (upNext.duration_min || 15)
                          ? `started ${Math.abs(minutesDiff)}m ago`
                          : `overdue by ${Math.abs(minutesDiff)}m`}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-base font-semibold text-brand-dark">
                    {upNext.patient.full_name}
                  </p>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-brand-subtext">
                    {upNext.patient.age && <span>{upNext.patient.age}y</span>}
                    {upNext.patient.sex && <span>/ {upNext.patient.sex}</span>}
                    <span className="text-border">·</span>
                    {upNext.mode === "online" ? (
                      <span className="flex items-center gap-1">
                        <MonitorPlay className="h-3 w-3" /> Online
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> Walk-in
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-2">
                {upNext.call_status === "waiting" && (
                  <Button
                    className="w-full rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 sm:w-auto"
                    onClick={() =>
                      router.push(
                        `/doctor/appointments/${upNext.appointment_id}?step=consultation`,
                      )
                    }
                  >
                    <Phone className="h-4 w-4" />
                    Join Call
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="w-full rounded-xl sm:w-auto"
                  onClick={() => openDetail(upNext.appointment_id)}
                >
                  Open
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ─── Tabs + Search + Filters ───────────────────────── */}
        <div className="space-y-4">
          {/* Tab bar */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div
              role="tablist"
              aria-label="Appointment categories"
              className="inline-flex max-w-full items-center overflow-x-auto scrollbar-hide rounded-2xl border border-border/60 bg-white p-1"
            >
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    id={`tab-${tab.key}`}
                    role="tab"
                    aria-selected={isActive}
                    aria-controls={`tabpanel-${tab.key}`}
                    type="button"
                    onClick={() => {
                      setActiveTab(tab.key);
                      setQuickFilter("all");
                      setSearchQuery("");
                    }}
                    className={cn(
                      "flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition-all",
                      isActive
                        ? "bg-brand/10 text-brand shadow-sm"
                        : "text-brand-subtext hover:text-brand-dark",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {tab.label}
                    {tab.key === "today" && stats.total > 0 && (
                      <span
                        className={cn(
                          "ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                          isActive
                            ? "bg-brand/20 text-brand"
                            : "bg-brand-bg text-brand-subtext",
                        )}
                      >
                        {stats.total}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* View toggle */}
            <div className="hidden sm:inline-flex items-center rounded-xl border border-border/60 bg-white p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("cards")}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-[10px] px-3 text-xs font-medium transition-colors",
                  viewMode === "cards"
                    ? "bg-brand/10 text-brand"
                    : "text-brand-subtext hover:text-brand-dark",
                )}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Cards
              </button>
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-[10px] px-3 text-xs font-medium transition-colors",
                  viewMode === "table"
                    ? "bg-brand/10 text-brand"
                    : "text-brand-subtext hover:text-brand-dark",
                )}
              >
                <List className="h-3.5 w-3.5" />
                Table
              </button>
            </div>
          </div>

          {/* Search + Quick filters - Hidden in table view mode per user request */}
          {viewMode === "cards" && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative max-w-xs flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-subtext/60" />
                <Input
                  placeholder="Search by name or phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="rounded-xl pl-9"
                  aria-label="Search appointments"
                />
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Filter className="h-3.5 w-3.5 text-brand-subtext/60" />
                {QUICK_FILTERS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setQuickFilter(f.key)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition-all",
                      quickFilter === f.key
                        ? "border-brand/30 bg-brand/10 text-brand"
                        : "border-border/60 bg-white text-brand-subtext hover:border-brand/20 hover:text-brand-dark",
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ─── Content area ──────────────────────────────────── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`${activeTab}-${viewMode}`}
            role="tabpanel"
            id={`tabpanel-${activeTab}`}
            aria-labelledby={`tab-${activeTab}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {viewMode === "cards" ? (
              <div className="space-y-6">
                {isLoading ? (
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <AgendaCardSkeleton key={i} />
                    ))}
                  </div>
                ) : filtered.length === 0 ? (
                  <EmptyState tab={activeTab} />
                ) : activeTab === "today" && todayGrouped.length > 0 ? (
                  // Grouped agenda view for Today
                  todayGrouped.map((group) => (
                    <div key={group.label}>
                      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-brand-subtext/70">
                        {group.label}
                      </h3>
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        <AnimatePresence mode="popLayout">
                          {group.items.map((apt, i) => (
                            <AgendaCard
                              key={apt.appointment_id}
                              appointment={apt}
                              isUpNext={
                                upNext?.appointment_id === apt.appointment_id
                              }
                              onClick={() => openDetail(apt.appointment_id)}
                              onJoinCall={() =>
                                router.push(
                                  `/doctor/appointments/${apt.appointment_id}?step=consultation`,
                                )
                              }
                              index={i}
                            />
                          ))}
                        </AnimatePresence>
                      </div>
                    </div>
                  ))
                ) : (
                  // Flat grid for other tabs
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    <AnimatePresence mode="popLayout">
                      {filtered.map((apt, i) => (
                        <AgendaCard
                          key={apt.appointment_id}
                          appointment={apt}
                          isUpNext={false}
                          onClick={() => openDetail(apt.appointment_id)}
                          onJoinCall={() =>
                            router.push(
                              `/doctor/appointments/${apt.appointment_id}?step=consultation`,
                            )
                          }
                          index={i}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            ) : (
              <DataTable
                columns={columns}
                data={tabFiltered}
                loading={isLoading}
                className="rounded-[30px]"
                emptyIcon={Calendar}
                emptyTitle={`No ${activeTab} appointments`}
                emptyDescription={getEmptyMessage(activeTab)}
                storageKey="doctor-appointments-table"
                searchPlaceholder="Search patient, mode, or schedule"
                savedViews={[
                  { id: "all", label: "All" },
                  {
                    id: "confirmed",
                    label: "Confirmed",
                    columnFilters: [
                      { id: "status", value: "confirmed" },
                    ] as ColumnFiltersState,
                  },
                  {
                    id: "finalized",
                    label: "Rx Finalized",
                    columnFilters: [
                      { id: "prescription_status", value: "final" },
                    ] as ColumnFiltersState,
                  },
                ]}
                filterOptions={[
                  {
                    id: "status",
                    label: "Status",
                    options: [
                      { label: "Confirmed", value: "confirmed" },
                      { label: "Completed", value: "completed" },
                      { label: "Cancelled", value: "cancelled" },
                      { label: "No show", value: "no_show" },
                    ],
                  },
                  {
                    id: "mode",
                    label: "Mode",
                    options: [
                      { label: "Online", value: "online" },
                      { label: "Walk-in", value: "walk_in" },
                    ],
                  },
                  {
                    id: "prescription_status",
                    label: "Rx",
                    options: [
                      { label: "None", value: "none" },
                      { label: "Draft", value: "draft" },
                      { label: "Finalized", value: "final" },
                    ],
                  },
                ]}
                density="comfortable"
                rowSurface="card"
                cellClassName={(row) =>
                  focusId === row.appointment_id
                    ? "bg-brand/5 border-brand/20"
                    : undefined
                }
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </DoctorShell>
  );
}

/* ─── Stat card component ───────────────────────────────────────── */

const STAT_COLORS = {
  blue: {
    bg: "bg-blue-50",
    icon: "bg-blue-100 text-blue-600",
    text: "text-blue-600",
  },
  green: {
    bg: "bg-emerald-50",
    icon: "bg-emerald-100 text-emerald-600",
    text: "text-emerald-600",
  },
  violet: {
    bg: "bg-violet-50",
    icon: "bg-violet-100 text-violet-600",
    text: "text-violet-600",
  },
  amber: {
    bg: "bg-amber-50",
    icon: "bg-amber-100 text-amber-600",
    text: "text-amber-600",
  },
} as const;

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: typeof Users;
  color: keyof typeof STAT_COLORS;
}) {
  const c = STAT_COLORS[color];
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-2xl border border-border/40 bg-white p-4 transition-shadow hover:shadow-[0_8px_30px_rgba(15,23,42,0.05)]",
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-xl",
            c.icon,
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold text-brand-dark">{value}</p>
          <p className="text-xs font-medium text-brand-subtext">{label}</p>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Agenda card (redesigned appointment card) ─────────────────── */

function AgendaCard({
  appointment: apt,
  isUpNext,
  onClick,
  onJoinCall,
  index,
}: {
  appointment: DoctorAppointment;
  isUpNext: boolean;
  onClick: () => void;
  onJoinCall: () => void;
  index: number;
}) {
  const initials = getInitials(apt.patient.full_name);

  const time = format(parseISO(apt.scheduled_at), "hh:mm a");
  const isWaiting =
    apt.video_enabled && apt.mode === "online" && apt.call_status === "waiting";
  const canComplete =
    apt.status === "confirmed" && apt.prescription_status === "final";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2, delay: index * 0.03 }}
      whileHover={{ y: -2 }}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "group relative cursor-pointer overflow-hidden rounded-2xl border bg-white transition-all duration-200 hover:shadow-[0_12px_40px_rgba(15,23,42,0.08)]",
        isUpNext ? "border-brand/30 ring-1 ring-brand/10" : "border-border/60",
      )}
    >
      {/* Color bar */}
      <div
        className={cn(
          "absolute left-0 top-0 h-full w-1 rounded-l-2xl",
          STATUS_COLOR_BAR[apt.status] ?? "bg-slate-300",
        )}
      />

      <div className="p-4 pl-5">
        {/* Time + Status row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold tracking-tight text-brand-dark">
              {time}
            </span>
            {isUpNext && (
              <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand">
                Next
              </span>
            )}
            {isWaiting && (
              <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                Waiting
              </span>
            )}
          </div>
          <StatusBadge
            variant={
              apt.status as
                | "confirmed"
                | "completed"
                | "cancelled"
                | "no_show"
                | "pending_payment"
            }
            size="xs"
            className="rounded-xl"
          />
        </div>

        {/* Patient info */}
        <div className="mt-3 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand/20 to-brand/5 text-[11px] font-bold text-brand">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-brand-dark">
              {apt.patient.full_name}
            </p>
            <div className="flex items-center gap-1.5 text-xs text-brand-subtext">
              {apt.patient.age && <span>{apt.patient.age}y</span>}
              {apt.patient.sex && <span>/ {apt.patient.sex}</span>}
              <span className="text-border">·</span>
              {apt.mode === "online" ? (
                <span className="flex items-center gap-0.5">
                  <MonitorPlay className="h-3 w-3 text-brand" />
                  Online
                </span>
              ) : (
                <span className="flex items-center gap-0.5">
                  <MapPin className="h-3 w-3" />
                  Walk-in
                </span>
              )}
              {apt.appointment_type === "follow_up" && (
                <>
                  <span className="text-border">·</span>
                  <span className="text-violet-600">Follow-up</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Bottom row: fee + rx + actions */}
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs text-brand-subtext">
            <span className="font-medium text-brand-dark">
              ₹{(apt.fee || 0).toLocaleString("en-IN")}
            </span>
            <span>{getPaymentLabel(apt)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {apt.prescription_status === "final" && (
              <span className="flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                <CheckCircle2 className="h-3 w-3" />
                Rx
              </span>
            )}
            {apt.prescription_status === "draft" && (
              <span className="flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                <FileText className="h-3 w-3" />
                Draft
              </span>
            )}
            {canComplete && (
              <span className="rounded-lg bg-brand/10 px-2 py-0.5 text-[10px] font-semibold text-brand">
                Ready
              </span>
            )}
          </div>
        </div>

        {/* Action buttons - always visible on mobile/touch, hover-triggered on desktop */}
        <div className="mt-3 flex items-center gap-2 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
          {isWaiting && (
            <Button
              size="sm"
              className="h-7 rounded-lg bg-emerald-600 px-3 text-[11px] text-white hover:bg-emerald-700"
              onClick={(e) => {
                e.stopPropagation();
                onJoinCall();
              }}
            >
              <Phone className="h-3 w-3" />
              Join Call
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-7 rounded-lg px-3 text-[11px]"
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
          >
            <ArrowRight className="h-3 w-3" />
            Open
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Skeleton ──────────────────────────────────────────────────── */

function AgendaCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border/60 bg-white p-4 pl-5">
      <div className="relative">
        <div className="absolute -left-5 top-0 h-full w-1 animate-pulse rounded-l-2xl bg-gray-100" />
        <div className="flex items-center justify-between">
          <div className="h-6 w-20 animate-pulse rounded-lg bg-gray-100" />
          <div className="h-5 w-16 animate-pulse rounded-full bg-gray-100" />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="h-10 w-10 animate-pulse rounded-full bg-gray-100" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-32 animate-pulse rounded-lg bg-gray-100" />
            <div className="h-3 w-24 animate-pulse rounded-lg bg-gray-100" />
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div className="h-3 w-20 animate-pulse rounded bg-gray-100" />
          <div className="h-4 w-12 animate-pulse rounded bg-gray-100" />
        </div>
      </div>
    </div>
  );
}

/* ─── Empty state ───────────────────────────────────────────────── */

function getEmptyMessage(tab: TabKey) {
  switch (tab) {
    case "today":
      return "No appointments scheduled for today. Enjoy your free time!";
    case "upcoming":
      return "No upcoming appointments in the next 7 days.";
    case "past":
      return "No past appointments found.";
    case "cancelled":
      return "No cancelled or no-show appointments.";
  }
}

const EMPTY_ICONS: Record<TabKey, typeof Calendar> = {
  today: Clock,
  upcoming: Calendar,
  past: CheckCircle2,
  cancelled: XCircle,
};

function EmptyState({ tab }: { tab: TabKey }) {
  const Icon = EMPTY_ICONS[tab];
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center rounded-[30px] border border-dashed border-border/70 bg-brand-bg/20 py-20"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-bg">
        <Icon className="h-7 w-7 text-brand-subtext/50" />
      </div>
      <p className="mt-5 text-sm font-medium text-brand-dark">
        No {tab === "today" ? "appointments today" : `${tab} appointments`}
      </p>
      <p className="mt-1.5 max-w-xs text-center text-xs text-brand-subtext">
        {getEmptyMessage(tab)}
      </p>
    </motion.div>
  );
}
