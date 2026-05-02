"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Users,
  ArrowRight,
  AlertCircle,
  XCircle,
  IndianRupee,
  CalendarCheck,
  Clock,
} from "lucide-react";
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  startOfDay,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
  isToday as dateFnsIsToday,
  addDays,
  subDays,
} from "date-fns";
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  Cell,
  XAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import api from "@/lib/api";
import { AuthGuard } from "@/components/auth-guard";
import { DoctorShell } from "@/components/doctor/doctor-shell";
import { useDoctorAuth } from "@/stores/doctor-auth";
import type { DoctorStats, DoctorAppointment } from "@/types/doctor";
import {
  StatCard,
  SectionCard,
  PageHeader,
  EmptyState,
  StatusBadge,
  SkeletonStatRow,
  SkeletonListItem,
} from "@/components/doctor/ui";
import { useIsMobile } from "@/hooks/use-mobile";

type TimeRange = "1" | "7" | "30";
const TIME_LABELS: Record<TimeRange, string> = { "1": "Today", "7": "7 Days", "30": "30 Days" };

type VisitLoadPoint = {
  label: string;
  visits: number;
};

type VisitStatusPoint = {
  label: string;
  value: number;
  fill: string;
};

type VisitStatCard = {
  label: string;
  value: string | number;
};

type RevenueTrendPoint = {
  label: string;
  revenue: number;
  count?: number;
};

const CLINIC_TIMEZONE = "Asia/Kolkata";

function chunkBySize<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function getRangeCutoff(days: number) {
  return startOfDay(subDays(new Date(), days - 1));
}

function formatCurrency(value: number) {
  return `\u20B9 ${Math.round(value).toLocaleString("en-IN")}`;
}

function formatClinicDateTime(value: string) {
  const date = parseISO(value);

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: CLINIC_TIMEZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function getUpcomingRangeWindow(days: number) {
  const start = startOfDay(new Date());
  const end = addDays(start, days);
  return { start, end };
}

function isInDateWindow(value: Date, window: { start: Date; end: Date }) {
  return value >= window.start && value < window.end;
}

function getUpcomingConfirmedAppointments(
  appointments: DoctorAppointment[] | undefined,
  days: number
) {
  if (!appointments) return [];

  const window = getUpcomingRangeWindow(days);

  return appointments.filter((appointment) => {
    const scheduledAt = parseISO(appointment.scheduled_at);
    return isInDateWindow(scheduledAt, window) && isConfirmedAppointment(appointment);
  });
}

function isCollectedAppointment(appointment: DoctorAppointment) {
  return appointment.payment_status === "paid" || appointment.payment_status === "transferred";
}

function isOnlineRevenueAppointment(appointment: DoctorAppointment) {
  return appointment.mode === "online" && isCollectedAppointment(appointment);
}

function isConfirmedAppointment(appointment: DoctorAppointment) {
  return appointment.status === "confirmed";
}

function isCompletedAppointment(appointment: DoctorAppointment) {
  return appointment.status === "completed";
}

function isCancelledAppointment(appointment: DoctorAppointment) {
  return appointment.status === "cancelled";
}

function isNoShowAppointment(appointment: DoctorAppointment) {
  return appointment.status === "no_show";
}

function VisitTooltip({
  active,
  label,
  payload,
}: {
  active?: boolean;
  label?: string;
  payload?: Array<{
    color?: string;
    dataKey?: string;
    name?: string;
    value?: number;
    payload?: { fill?: string };
  }>;
}) {
  if (!active || !payload?.length) return null;

  const rows = payload.filter((item) => typeof item.value === "number" && item.value !== undefined);
  if (!rows.length) return null;

  return (
    <div className="min-w-[132px] rounded-xl bg-brand-dark px-3 py-2 shadow-xl ring-1 ring-black/10">
      {label ? <p className="type-caption font-semibold text-white">{label}</p> : null}
      <div className="mt-1.5 space-y-1">
        {rows.map((item) => (
          <div key={`${item.dataKey ?? item.name}-${item.value}`} className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: item.color ?? item.payload?.fill ?? "#FFFFFF" }}
            />
            <span className="type-caption text-white/72">{item.name ?? item.dataKey}</span>
            <span className="ml-auto type-caption font-semibold text-white">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RevenueTooltip({
  active,
  label,
  payload,
}: {
  active?: boolean;
  label?: string;
  payload?: Array<{ value?: number }>;
}) {
  if (!active || !payload?.length) return null;
  const value = payload[0]?.value;
  if (typeof value !== "number") return null;
  return (
    <div className="min-w-[128px] rounded-xl bg-brand-dark px-3 py-2 shadow-xl ring-1 ring-black/10">
      {label ? <p className="type-caption font-semibold text-white/60">{label}</p> : null}
      <p className="mt-1 text-[13px] font-bold leading-none text-white">{formatCurrency(value)}</p>
    </div>
  );
}

export default function DoctorDashboardPage() {
  return (
    <AuthGuard role="doctor">
      <DashboardContent />
    </AuthGuard>
  );
}

function DashboardContent() {
  const router = useRouter();
  const { doctor } = useDoctorAuth();
  const isMobile = useIsMobile();
  const todayStartTs = useMemo(() => {
    const value = new Date();
    value.setHours(0, 0, 0, 0);
    return value.getTime();
  }, []);
  const [calMonth, setCalMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["doctor-stats"],
    queryFn: async () => {
      const { data } = await api.get<DoctorStats>("/doctor/stats");
      return data;
    },
  });

  const selectedDay = format(selectedDate, "yyyy-MM-dd");
  const todayLabel = format(startOfDay(new Date()), "yyyy-MM-dd");
  const visitFlowEndLabel = format(addDays(startOfDay(new Date()), 29), "yyyy-MM-dd");
  const { data: selectedDayAppts, isLoading: apptLoading } = useQuery({
    queryKey: ["doctor-appointments", selectedDay],
    queryFn: async () => {
      const { data } = await api.get<{ appointments: DoctorAppointment[] }>(
        "/doctor/appointments",
        { params: { day: selectedDay } }
      );
      return data.appointments;
    },
    enabled: selectedDate.getTime() >= todayStartTs,
  });

  const { data: todayAppointments, isLoading: todayAppointmentsLoading } = useQuery({
    queryKey: ["doctor-appointments", todayLabel],
    queryFn: async () => {
      const { data } = await api.get<{ appointments: DoctorAppointment[] }>(
        "/doctor/appointments",
        { params: { day: todayLabel } }
      );
      return data.appointments;
    },
  });

  const monthStartLabel = format(
    new Date(Math.max(startOfMonth(calMonth).getTime(), todayStartTs)),
    "yyyy-MM-dd"
  );
  const monthEndLabel = format(endOfMonth(calMonth), "yyyy-MM-dd");
  const { data: monthAppointments } = useQuery({
    queryKey: ["doctor-appointments-range", monthStartLabel, monthEndLabel],
    queryFn: async () => {
      const { data } = await api.get<{ appointments: DoctorAppointment[] }>("/doctor/appointments/range", {
        params: { from: monthStartLabel, to: monthEndLabel },
      });
      return data.appointments;
    },
  });

  const revenueFromLabel = format(subDays(new Date(), 29), "yyyy-MM-dd");
  const { data: revenueAppointments } = useQuery({
    queryKey: ["doctor-appointments-range", "revenue", revenueFromLabel, todayLabel],
    queryFn: async () => {
      const { data } = await api.get<{ appointments: DoctorAppointment[] }>("/doctor/appointments/range", {
        params: { from: revenueFromLabel, to: todayLabel },
      });
      return data.appointments;
    },
  });

  const { data: visitFlowAppointments, isLoading: visitFlowLoading } = useQuery({
    queryKey: ["doctor-appointments-range", "visit-flow", todayLabel, visitFlowEndLabel],
    queryFn: async () => {
      const { data } = await api.get<{ appointments: DoctorAppointment[] }>("/doctor/appointments/range", {
        params: { from: todayLabel, to: visitFlowEndLabel },
      });
      return data.appointments;
    },
  });

  const todayAppointmentCount = todayAppointments?.length ?? 0;
  const upcomingSevenCount = useMemo(() => {
    return getUpcomingConfirmedAppointments(visitFlowAppointments, 7).length;
  }, [visitFlowAppointments]);

  const upcomingAppts = useMemo(() => {
    if (!selectedDayAppts || selectedDate.getTime() < todayStartTs) return [];
    return [...selectedDayAppts]
      .filter(
        (a) =>
          a.status === "confirmed" &&
          new Date(a.scheduled_at).getTime() >= todayStartTs
      )
      .sort(
        (a, b) =>
          new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
      );
  }, [selectedDayAppts, selectedDate, todayStartTs]);

  const monthStart = startOfMonth(calMonth);
  const monthEnd = endOfMonth(calMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const calDays = eachDayOfInterval({ start: calStart, end: calEnd });

  const datesWithAppts = useMemo(() => {
    const set = new Set<string>();
    monthAppointments?.forEach((d) => set.add(format(parseISO(d.scheduled_at), "yyyy-MM-dd")));
    return set;
  }, [monthAppointments]);

  const selectedLabel = dateFnsIsToday(selectedDate)
    ? "Today"
    : isSameDay(selectedDate, addDays(new Date(), 1))
      ? "Tomorrow"
      : format(selectedDate, "EEE, MMM d");

  return (
    <DoctorShell
      title="Dashboard"
      subtitle={`Welcome back${doctor?.full_name ? `, Dr. ${doctor.full_name.split(" ")[0]}` : ""}`}
    >
      {doctor?.verification_status === "pending" && (
        <SectionCard className="mb-4 border-amber-200/60 bg-amber-50" padding="sm">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 text-amber-500" />
            <div>
              <p className="type-body-sm font-medium text-amber-800">Account Pending Verification</p>
              <p className="type-caption text-amber-600">
                Your account is under review. You can set up your profile while you wait.
              </p>
            </div>
          </div>
        </SectionCard>
      )}
      {doctor?.verification_status === "rejected" && (
        <SectionCard className="mb-4 border-red-200/60 bg-red-50" padding="sm">
          <div className="flex items-center gap-3">
            <XCircle className="h-5 w-5 shrink-0 text-red-500" />
            <div>
              <p className="type-body-sm font-medium text-red-800">Account Verification Rejected</p>
              <p className="type-caption text-red-600">Please contact support for more information.</p>
            </div>
          </div>
        </SectionCard>
      )}

      <div className="grid gap-4 lg:gap-5 xl:grid-cols-[minmax(0,1fr)_350px]">
        <div className="space-y-4 sm:space-y-5 lg:space-y-6">
          {statsLoading || todayAppointmentsLoading || visitFlowLoading ? (
            <SkeletonStatRow />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              <StatCard
                icon={CalendarIcon}
                label="Today"
                value={todayAppointmentCount}
                helper="appointments"
                iconBg="bg-brand/10"
                iconColor="text-brand"
              />
              <StatCard
                icon={Clock}
                label="Upcoming 7d"
                value={upcomingSevenCount}
                helper="confirmed"
                iconBg="bg-brand-accent/25"
                iconColor="text-brand-dark"
              />
              <StatCard
                icon={CalendarCheck}
                label="Total"
                value={stats?.total_appointments ?? 0}
                helper="all time"
                iconBg="bg-violet-50"
                iconColor="text-violet-600"
              />
              <StatCard
                icon={IndianRupee}
                label="Revenue (30d)"
                value={formatCurrency(stats?.paid_revenue_30d ?? 0)}
                helper="online payments"
                iconBg="bg-emerald-50"
                iconColor="text-emerald-600"
              />
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2 lg:gap-4">
            <ChartCard
              title="Visit Flow"
              icon={<Users className="h-4 w-4 text-brand" />}
              renderChart={(range) => (
                <PatientsChart
                  todayAppointments={todayAppointments}
                  upcomingAppointments={visitFlowAppointments}
                  range={range}
                />
              )}
            />
            <ChartCard
              title="Revenue Trend"
              icon={<IndianRupee className="h-4 w-4 text-violet-600" />}
              renderChart={(range) => (
                <IncomeChart revenueAppointments={revenueAppointments} range={range} />
              )}
            />
          </div>
        </div>

        <div className="xl:ml-auto xl:w-full">
          <SectionCard elevated padding="sm" className="border-brand/10">
            {/* Calendar */}
            <div className="flex items-center justify-between mb-3">
              <p className="text-[13px] font-semibold text-brand-dark">{format(calMonth, "MMMM yyyy")}</p>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => setCalMonth(subMonths(calMonth, 1))}
                  disabled={startOfMonth(calMonth) <= startOfMonth(new Date())}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-brand-subtext transition-colors hover:bg-brand-bg hover:text-brand-dark disabled:opacity-30"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setCalMonth(addMonths(calMonth, 1))}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-brand-subtext transition-colors hover:bg-brand-bg hover:text-brand-dark"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="mb-1 grid grid-cols-7">
              {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
                <div key={d} className="py-1 text-center text-[10px] font-semibold uppercase tracking-widest text-brand-subtext/50">
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1 rounded-xl bg-brand-bg/30 p-1">
              {calDays.map((day) => {
                const isCurrentMonth = isSameMonth(day, calMonth);
                const isSelected = isSameDay(day, selectedDate);
                const isToday = dateFnsIsToday(day);
                const hasAppt = datesWithAppts.has(format(day, "yyyy-MM-dd"));
                const isPast = day.getTime() < todayStartTs;

                if (isPast) {
                  return (
                    <div
                      key={day.toISOString()}
                      aria-hidden="true"
                      className="aspect-square rounded-lg bg-transparent"
                    />
                  );
                }

                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => setSelectedDate(day)}
                    className={`relative flex aspect-square w-full items-center justify-center rounded-lg text-[11px] font-semibold transition-all ${
                      isSelected
                        ? "bg-brand text-white shadow-md shadow-brand/30"
                        : isToday
                          ? "bg-white text-brand ring-1 ring-brand/20 shadow-sm"
                          : hasAppt
                            ? "bg-white/80 text-brand-dark hover:bg-white"
                            : isCurrentMonth
                              ? "text-brand-ink-soft hover:bg-white hover:text-brand-dark"
                              : "text-brand-subtext/40 hover:bg-white/50 hover:text-brand-dark"
                    }`}
                  >
                    {format(day, "d")}
                    {hasAppt && !isSelected && (
                      <span className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-brand/50" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Divider */}
            <div className="my-4 h-px bg-border/20" />

            {/* Appointments */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="type-caption font-semibold text-brand-dark">{selectedLabel}</span>
                {upcomingAppts.length > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
                    {upcomingAppts.length}
                  </span>
                )}
              </div>
              <button
                onClick={() => router.push("/doctor/appointments")}
                className="type-caption flex items-center gap-1 text-brand hover:text-brand-dark transition-colors"
              >
                All <ArrowRight className="h-3 w-3" />
              </button>
            </div>

            {apptLoading ? (
              <div className="divide-y divide-border/10">
                {Array.from({ length: 3 }).map((_, i) => (
                  <SkeletonListItem key={i} />
                ))}
              </div>
            ) : upcomingAppts.length === 0 ? (
              <EmptyState
                icon={CalendarIcon}
                title="No appointments"
                description="Select a date with an indicator"
                size="sm"
              />
            ) : (
              <div className="max-h-[340px] space-y-1.5 overflow-y-auto">
                {upcomingAppts.map((appointment) => {
                  const scheduledAt = parseISO(appointment.scheduled_at);
                  return (
                    <button
                      key={appointment.appointment_id}
                      onClick={() =>
                        router.push(`/doctor/appointments?focus=${appointment.appointment_id}`)
                      }
                      className="group flex w-full items-center gap-2.5 rounded-xl border border-transparent px-2.5 py-2 text-left transition-all hover:border-brand/10 hover:bg-brand-bg/50"
                    >
                      <div className="flex w-12 shrink-0 flex-col rounded-lg bg-brand-bg/80 px-1.5 py-1.5 text-center">
                        <span className="text-[10px] font-bold leading-none text-brand-dark">
                          {format(scheduledAt, "hh:mm")}
                        </span>
                        <span className="mt-0.5 text-[9px] font-medium uppercase text-brand-subtext">
                          {format(scheduledAt, "a")}
                        </span>
                      </div>

                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[9px] font-bold text-brand">
                          {appointment.patient.full_name
                            ?.split(" ")
                            .slice(0, 2)
                            .map((n) => n[0])
                            .join("")
                            .toUpperCase() || "P"}
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12px] font-semibold text-brand-dark">
                            {appointment.patient.full_name}
                          </p>
                          <div className="flex items-center gap-1.5">
                            <StatusBadge variant={appointment.mode} dot size="xs" />
                            <span className="text-[10px] text-brand-subtext">
                              {appointment.patient.age ? `${appointment.patient.age}y` : ""}
                            </span>
                          </div>
                        </div>
                      </div>

                      <ArrowRight className="h-3 w-3 shrink-0 text-brand-subtext/40 transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
                    </button>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </DoctorShell>
  );
}

function ChartCard({
  title,
  icon,
  renderChart,
}: {
  title: string;
  icon: React.ReactNode;
  renderChart: (range: TimeRange) => React.ReactNode;
}) {
  const [range, setRange] = useState<TimeRange>("30");

  return (
    <SectionCard padding="default" elevated>
      <PageHeader
        title={title}
        icon={icon}
        actions={<TimeRangeToggle value={range} onChange={setRange} />}
        compact
        className="mb-3.5"
      />
      {renderChart(range)}
    </SectionCard>
  );
}

function TimeRangeToggle({
  value,
  onChange,
}: {
  value: TimeRange;
  onChange: (v: TimeRange) => void;
}) {
  return (
    <div className="flex w-full items-center gap-0.5 rounded-lg bg-brand-bg p-0.5 sm:w-auto">
      {(Object.keys(TIME_LABELS) as TimeRange[]).map((key) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`type-caption flex-1 rounded-md px-2 py-1 text-center font-semibold transition-all sm:flex-none sm:px-2.5 ${
            value === key
              ? "bg-white text-brand-dark shadow-sm"
              : "text-brand-subtext hover:text-brand-dark"
          }`}
        >
          {TIME_LABELS[key]}
        </button>
      ))}
    </div>
  );
}

function PatientsChart({
  todayAppointments,
  upcomingAppointments,
  range,
}: {
  todayAppointments: DoctorAppointment[] | undefined;
  upcomingAppointments: DoctorAppointment[] | undefined;
  range: TimeRange;
}) {
  const { mode, chartData, statCards } = useMemo(() => {
    if (range === "1") {
      if (!todayAppointments) {
        return {
          mode: "status" as const,
          chartData: [] as VisitStatusPoint[],
          statCards: [
            { label: "Confirmed", value: 0 },
            { label: "Completed", value: 0 },
            { label: "Cancelled", value: 0 },
            { label: "No Show", value: 0 },
          ] as VisitStatCard[],
        };
      }

      const confirmedCount = todayAppointments.filter(isConfirmedAppointment).length;
      const completedCount = todayAppointments.filter(isCompletedAppointment).length;
      const cancelledCount = todayAppointments.filter(isCancelledAppointment).length;
      const noShowCount = todayAppointments.filter(isNoShowAppointment).length;

      return {
        mode: "status" as const,
        chartData: [
          { label: "Confirmed", value: confirmedCount, fill: "#93C5FD" },
          { label: "Completed", value: completedCount, fill: "#2563EB" },
          { label: "Cancelled", value: cancelledCount, fill: "#CBD5E1" },
          { label: "No Show", value: noShowCount, fill: "#94A3B8" },
        ] as VisitStatusPoint[],
        statCards: [
          { label: "Confirmed", value: confirmedCount },
          { label: "Completed", value: completedCount },
          { label: "Cancelled", value: cancelledCount },
          { label: "No Show", value: noShowCount },
        ] as VisitStatCard[],
      };
    }

    if (!upcomingAppointments) {
      return {
        mode: "load" as const,
        chartData: [] as VisitLoadPoint[],
        statCards: [
          { label: "Confirmed", value: 0 },
          { label: range === "30" ? "Avg / week" : "Avg / day", value: 0 },
          { label: "Peak", value: 0 },
        ] as VisitStatCard[],
      };
    }

    const normalizedAppointments = [...upcomingAppointments]
      .map((appointment) => ({ ...appointment, parsedDate: parseISO(appointment.scheduled_at) }))
      .sort((a, b) => a.parsedDate.getTime() - b.parsedDate.getTime());

    const days = parseInt(range, 10);
    const { start: rangeStart, end: rangeEnd } = getUpcomingRangeWindow(days);
    const filtered = normalizedAppointments.filter(
      (appointment) => isInDateWindow(appointment.parsedDate, { start: rangeStart, end: rangeEnd }) && isConfirmedAppointment(appointment)
    );

    const daySeries = eachDayOfInterval({
      start: rangeStart,
      end: subDays(rangeEnd, 1),
    }).map((day) => {
      const visits = filtered.filter((appointment) => isSameDay(appointment.parsedDate, day)).length;

      return {
        label: format(day, "dd MMM"),
        visits,
      };
    });

    const chartData =
      range === "30"
        ? chunkBySize(daySeries, 7).map((chunk) => {
            const first = chunk[0];
            const last = chunk.at(-1);
            return {
              label: `${first.label} - ${last?.label ?? first.label}`,
              visits: chunk.reduce((sum, item) => sum + item.visits, 0),
            };
          })
        : daySeries;

    const totalBooked = filtered.length;
    const averageBase = chartData.length;
    const averageBooked = averageBase ? totalBooked / averageBase : 0;
    const peakBooked = chartData.reduce((best, point) => Math.max(best, point.visits), 0);

    return {
      mode: "load" as const,
      chartData: chartData as VisitLoadPoint[],
      statCards: [
        { label: "Confirmed", value: totalBooked },
        {
          label: range === "30" ? "Avg / week" : "Avg / day",
          value: averageBooked % 1 === 0 ? averageBooked.toFixed(0) : averageBooked.toFixed(1),
        },
        { label: "Peak", value: peakBooked },
      ] as VisitStatCard[],
    };
  }, [range, todayAppointments, upcomingAppointments]);

  if (chartData.length === 0) {
    return <EmptyState icon={Users} title="No data available" size="sm" />;
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {statCards.map((stat) => (
          <div key={stat.label} className="flex items-center gap-1.5 rounded-full border border-border/25 bg-brand-bg/70 px-2.5 py-1">
            <span className="text-[13px] font-bold leading-none text-brand-dark">{stat.value}</span>
            <span className="type-caption text-brand-subtext">{stat.label}</span>
          </div>
        ))}
      </div>

      <div className="h-52 sm:h-56">
        <ResponsiveContainer width="100%" height="100%">
          {mode === "status" ? (
            <BarChart data={chartData as VisitStatusPoint[]} barCategoryGap="32%" maxBarSize={44}>
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#9CA3AF" }} dy={6} />
              <Tooltip content={<VisitTooltip />} cursor={{ fill: "rgba(88,155,255,0.05)", radius: [6, 6, 0, 0] as unknown as number }} />
              <Bar dataKey="value" name="Appointments" radius={[7, 7, 3, 3]}>
                {(chartData as VisitStatusPoint[]).map((entry) => (
                  <Cell key={entry.label} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          ) : (
            <BarChart data={chartData as VisitLoadPoint[]} barCategoryGap="35%" maxBarSize={44}>
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#9CA3AF" }} dy={6} />
              <Tooltip content={<VisitTooltip />} cursor={{ fill: "rgba(88,155,255,0.05)", radius: [6, 6, 0, 0] as unknown as number }} />
              <Bar dataKey="visits" name="Visits" radius={[7, 7, 3, 3]}>
                {(chartData as VisitLoadPoint[]).map((entry) => (
                  <Cell key={entry.label} fill={entry.visits > 0 ? "#589BFF" : "#E5EAF3"} />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </>
  );
}

function IncomeChart({
  revenueAppointments,
  range,
}: {
  revenueAppointments: DoctorAppointment[] | undefined;
  range: TimeRange;
}) {
  const {
    chartData,
    totalRevenue,
    averageRevenue,
    averageLabel,
    bestPeriodLabel,
    bestPeriodRevenue,
    bestPeriodTitle,
    metricLabel,
  } = useMemo(() => {
    if (!revenueAppointments) {
      return {
        chartData: [] as RevenueTrendPoint[],
        totalRevenue: 0,
        averageRevenue: 0,
        averageLabel: "Avg / day",
        bestPeriodLabel: "-",
        bestPeriodRevenue: 0,
        bestPeriodTitle: "Best day",
        metricLabel: "No revenue data",
      };
    }

    const records = [...revenueAppointments]
      .filter(isOnlineRevenueAppointment)
      .map((appointment) => ({ ...appointment, parsedDate: parseISO(appointment.scheduled_at) }))
      .sort((a, b) => a.parsedDate.getTime() - b.parsedDate.getTime());

    if (range === "1") {
      const paidTodayAppointments = records.filter((appointment) =>
        isSameDay(appointment.parsedDate, startOfDay(new Date()))
      );

      const totalCollected = paidTodayAppointments.reduce((sum, appointment) => sum + appointment.fee, 0);

      if (paidTodayAppointments.length === 0) {
        return {
          chartData: [] as RevenueTrendPoint[],
          totalRevenue: totalCollected,
          averageRevenue: 0,
          averageLabel: "Avg / paid visit",
          bestPeriodLabel: "-",
          bestPeriodRevenue: 0,
          bestPeriodTitle: "Peak slot",
          metricLabel: "Online revenue today",
        };
      }

      const revenueByTime = new Map<
        string,
        RevenueTrendPoint & { rawRevenue: number; sortValue: number }
      >();
      paidTodayAppointments.forEach((appointment) => {
        const key = format(appointment.parsedDate, "HH:mm");
        const existing = revenueByTime.get(key);

        if (existing) {
          existing.rawRevenue += appointment.fee;
          existing.revenue = Math.round(existing.rawRevenue);
          existing.count = (existing.count ?? 0) + 1;
          return;
        }

        revenueByTime.set(key, {
          label: format(appointment.parsedDate, "hh:mm a"),
          revenue: Math.round(appointment.fee),
          count: 1,
          rawRevenue: appointment.fee,
          sortValue: appointment.parsedDate.getHours() * 60 + appointment.parsedDate.getMinutes(),
        });
      });

      const timeData = [...revenueByTime.values()].sort((a, b) => a.sortValue - b.sortValue);

      const bestSlot = timeData.reduce(
        (best, slot) => (slot.rawRevenue > best.rawRevenue ? slot : best),
        timeData[0]
      );

      return {
        chartData: timeData.map(({ rawRevenue, sortValue, ...slot }) => slot),
        totalRevenue: totalCollected,
        averageRevenue: paidTodayAppointments.length ? totalCollected / paidTodayAppointments.length : 0,
        averageLabel: "Avg / paid visit",
        bestPeriodLabel: bestSlot?.label ?? "-",
        bestPeriodRevenue: bestSlot?.rawRevenue ?? 0,
        bestPeriodTitle: "Peak time",
        metricLabel: "Online revenue today",
      };
    }

    const days = parseInt(range);
    const rangeStart = getRangeCutoff(days);
    const filtered = records.filter((item) => item.parsedDate >= rangeStart);

    if (filtered.length === 0) {
      return {
        chartData: [] as RevenueTrendPoint[],
        totalRevenue: 0,
        averageRevenue: 0,
        averageLabel: "Avg / day",
        bestPeriodLabel: "-",
        bestPeriodRevenue: 0,
        bestPeriodTitle: range === "30" ? "Best week" : "Best day",
        metricLabel: `Online revenue in last ${range} days`,
      };
    }

    const revenueByDay = new Map<string, number>();
    filtered.forEach((appointment) => {
      const dayKey = format(appointment.parsedDate, "yyyy-MM-dd");
      revenueByDay.set(dayKey, (revenueByDay.get(dayKey) ?? 0) + appointment.fee);
    });

    const daySeries = eachDayOfInterval({ start: rangeStart, end: startOfDay(new Date()) }).map((day) => {
      const rawRevenue = revenueByDay.get(format(day, "yyyy-MM-dd")) ?? 0;
      return {
        label: format(day, "dd MMM"),
        revenue: Math.round(rawRevenue),
        rawRevenue,
      };
    });

    const chartData: Array<RevenueTrendPoint & { rawRevenue: number }> =
      range === "30"
        ? chunkBySize(daySeries, 7).map((chunk) => {
            const first = chunk[0];
            const last = chunk.at(-1);
            const rawRevenue = chunk.reduce((sum, item) => sum + item.rawRevenue, 0);
            return {
              label: `${first.label} - ${last?.label ?? first.label}`,
              revenue: Math.round(rawRevenue),
              rawRevenue,
            };
          })
        : daySeries;

    const rollingRevenue = filtered.reduce((sum, item) => sum + item.fee, 0);
    const bestPoint = chartData.reduce(
      (best, point) => (point.rawRevenue > best.rawRevenue ? point : best),
      chartData[0] ?? { label: "-", rawRevenue: 0, revenue: 0 }
    );

    return {
      chartData: chartData.map(({ rawRevenue, ...point }) => point),
      totalRevenue: rollingRevenue,
      averageRevenue: daySeries.length ? rollingRevenue / daySeries.length : 0,
      averageLabel: "Avg / day",
      bestPeriodLabel: bestPoint.label,
      bestPeriodRevenue: bestPoint.rawRevenue,
      bestPeriodTitle: range === "30" ? "Best week" : "Best day",
      metricLabel: `Online revenue in last ${range} days`,
    };
  }, [revenueAppointments, range]);

  return (
    <>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="type-caption mb-1 text-brand-subtext">{metricLabel}</p>
          <p className="type-ui-metric leading-none text-brand-dark">{formatCurrency(totalRevenue)}</p>
        </div>
        <div className="flex items-end gap-3 pb-0.5">
          <div className="text-right">
            <p className="type-caption text-brand-subtext">{averageLabel}</p>
            <p className="text-[13px] font-semibold leading-snug text-brand-dark">{formatCurrency(averageRevenue)}</p>
          </div>
          {bestPeriodRevenue > 0 && (
            <div className="text-right">
              <p className="type-caption text-brand-subtext">{bestPeriodTitle}</p>
              <p className="text-[13px] font-semibold leading-snug text-brand-dark">{bestPeriodLabel}</p>
            </div>
          )}
        </div>
      </div>
      {chartData.length === 0 ? (
        <EmptyState icon={IndianRupee} title="No revenue data" size="sm" />
      ) : (
        <div className="h-52 sm:h-56">
          <ResponsiveContainer width="100%" height="100%">
            {range === "1" ? (
              <BarChart data={chartData} barCategoryGap="30%" maxBarSize={52}>
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#9CA3AF" }} dy={6} />
                <Tooltip content={<RevenueTooltip />} cursor={{ fill: "rgba(139,92,246,0.05)", radius: [6, 6, 0, 0] as unknown as number }} />
                <Bar dataKey="revenue" name="Revenue" radius={[8, 8, 3, 3]}>
                  {(chartData as RevenueTrendPoint[]).map((entry, i) => (
                    <Cell key={i} fill={entry.revenue > 0 ? "#8B5CF6" : "#EDE9FE"} />
                  ))}
                </Bar>
              </BarChart>
            ) : (
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#9CA3AF" }} dy={6} />
                <Tooltip content={<RevenueTooltip />} cursor={{ stroke: "rgba(139,92,246,0.2)", strokeWidth: 1 }} />
                <Area
                  type="natural"
                  dataKey="revenue"
                  stroke="#8B5CF6"
                  strokeWidth={2.5}
                  fill="url(#incomeGrad)"
                  dot={false}
                  activeDot={{ r: 4, fill: "#8B5CF6", stroke: "#fff", strokeWidth: 2 }}
                />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </>
  );
}

