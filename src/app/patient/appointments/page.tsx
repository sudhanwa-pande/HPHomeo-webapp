"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  Calendar,
  CalendarClock,
  CalendarDays,
  Clock,
  LayoutList,
  Loader2,
  XCircle,
} from "lucide-react";

import api from "@/lib/api";
import { isUpcoming, getNextAppointment } from "@/lib/appointment-utils";
import { useAppointmentActions } from "@/hooks/use-appointment-mutations";
import { AuthGuard } from "@/components/auth-guard";
import { PatientShell } from "@/components/patient/patient-shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  AppointmentCard,
  AppointmentCardSkeleton,
  NextAppointmentHeroSkeleton,
  NextAppointmentHero,
  QuickStatsStrip,
  CalendarView,
  AppointmentEmptyState,
  SlotPicker,
} from "@/components/appointment";
import { formatDate, formatTime } from "@/lib/appointment-utils";
import type {
  PatientAppointment,
  PatientAppointmentsResponse,
} from "@/types/patient";

type TabFilter = "all" | "upcoming" | "completed" | "cancelled";
type ViewMode = "list" | "calendar";

function AppointmentsContent() {
  const router = useRouter();
  const [tab, setTab] = useState<TabFilter>("all");
  const [view, setView] = useState<ViewMode>("list");

  const actions = useAppointmentActions();

  const { data, isLoading } = useQuery({
    queryKey: ["patient", "appointments", "all"],
    queryFn: async () => {
      const { data } = await api.get<PatientAppointmentsResponse>(
        "/patient/appointments",
        { params: { limit: 100 } },
      );
      return data;
    },
    staleTime: 0,
  });

  const appointments = data?.items || [];

  const filtered = useMemo(() => {
    return appointments.filter((apt) => {
      if (tab === "upcoming") return isUpcoming(apt);
      if (tab === "completed") return apt.status === "completed";
      if (tab === "cancelled")
        return apt.status === "cancelled" || apt.status === "no_show";
      return true;
    });
  }, [appointments, tab]);

  const sortedFiltered = useMemo(() => {
    return [...filtered].sort(
      (a, b) =>
        new Date(b.scheduled_at).getTime() -
        new Date(a.scheduled_at).getTime(),
    );
  }, [filtered]);

  const nextAppointment = useMemo(
    () => getNextAppointment(appointments),
    [appointments],
  );

  // Reschedule data
  const rescheduleApt = actions.rescheduleId
    ? appointments.find((a) => a.appointment_id === actions.rescheduleId)
    : null;

  const maxBookingDate = useMemo(() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    d.setDate(d.getDate() + 7);
    return d;
  }, []);

  // Cancel data
  const cancelApt = actions.cancellingId
    ? appointments.find((a) => a.appointment_id === actions.cancellingId)
    : null;

  return (
    <PatientShell
      title="My Appointments"
      subtitle={`${appointments.length} total`}
      headerRight={
        <Button
          size="sm"
          onClick={() => router.push("/patient/doctors")}
          className="h-9 gap-1.5 bg-brand hover:bg-brand-dark text-white font-bold rounded-xl shadow-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-95 cursor-pointer"
        >
          <Calendar className="h-3.5 w-3.5" />
          Book New
        </Button>
      }
    >
      <div className="space-y-4">
        {isLoading ? (
          <>
            <NextAppointmentHeroSkeleton />
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <AppointmentCardSkeleton key={i} />
              ))}
            </div>
          </>
        ) : (
          <>
            {/* Next appointment hero */}
            {nextAppointment && tab === "all" && view === "list" && (
              <NextAppointmentHero appointment={nextAppointment} />
            )}

            {/* Stats strip + view toggle */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <QuickStatsStrip
                appointments={appointments}
                activeTab={tab}
                onTabChange={setTab}
                className="flex-1"
              />
              <div className="flex shrink-0 gap-1 rounded-xl border border-white/50 bg-white/70 backdrop-blur-sm p-1 shadow-[0_2px_8px_-3px_rgba(15,23,42,0.05),inset_0_1px_0_rgba(255,255,255,0.8)] self-end sm:self-auto">
                <button
                  onClick={() => setView("list")}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all duration-200 active:scale-95 cursor-pointer ${
                    view === "list"
                      ? "bg-gray-900 text-white shadow-sm"
                      : "text-gray-500 hover:text-gray-900 hover:bg-white/50"
                  }`}
                >
                  <LayoutList className="h-3.5 w-3.5" />
                  List
                </button>
                <button
                  onClick={() => setView("calendar")}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all duration-200 active:scale-95 cursor-pointer ${
                    view === "calendar"
                      ? "bg-gray-900 text-white shadow-sm"
                      : "text-gray-500 hover:text-gray-900 hover:bg-white/50"
                  }`}
                >
                  <CalendarDays className="h-3.5 w-3.5" />
                  Calendar
                </button>
              </div>
            </div>

            {/* Content */}
            {view === "calendar" ? (
              <CalendarView
                appointments={filtered}
                onPay={(apt) => actions.paymentMutation.mutate(apt)}
                onCancel={actions.openCancel}
                onReschedule={actions.openReschedule}
                isPaying={actions.paymentMutation.isPending}
                onFindDoctor={() => router.push("/patient/doctors")}
              />
            ) : sortedFiltered.length === 0 ? (
              <AppointmentEmptyState
                tab={tab}
                onFindDoctor={() => router.push("/patient/doctors")}
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <AnimatePresence mode="popLayout">
                  {sortedFiltered.map((apt) => (
                    <AppointmentCard
                      key={apt.appointment_id}
                      appointment={apt}
                      onPay={(a) => actions.paymentMutation.mutate(a)}
                      onCancel={actions.openCancel}
                      onReschedule={actions.openReschedule}
                      isPaying={
                        actions.paymentMutation.isPending &&
                        actions.payingId === apt.appointment_id
                      }
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </>
        )}
      </div>

      {/* Cancel Dialog */}
      <Dialog
        open={!!actions.cancellingId}
        onOpenChange={(open) => {
          if (!open) actions.closeCancel();
        }}
      >
        <DialogContent className="max-w-md gap-0 overflow-hidden rounded-[2rem] border border-white/50 bg-white/95 backdrop-blur-md shadow-2xl p-0">
          <div className="border-b border-gray-100 bg-red-50/20 px-6 py-5">
            <DialogHeader className="space-y-1">
              <DialogTitle className="flex items-center gap-2 font-display text-lg font-bold text-gray-900">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-100 text-red-600 shadow-sm border border-red-200/30">
                  <XCircle className="h-4 w-4" />
                </div>
                Cancel Appointment
              </DialogTitle>
              <DialogDescription className="text-xs text-gray-500">
                This action cannot be undone. If you paid online, a refund will
                be initiated automatically.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="space-y-3.5 px-6 py-5">
            {cancelApt && (
              <div className="rounded-2xl border border-white/50 bg-gray-50/50 p-4 text-sm text-gray-950">
                <p className="font-bold text-gray-900">
                  {cancelApt.doctor_name}
                </p>
                <p className="mt-1 text-xs text-gray-500 font-medium flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-gray-400" />
                  {formatDate(cancelApt.scheduled_at)}
                  <span className="text-gray-300">·</span>
                  <Clock className="h-3.5 w-3.5 text-gray-400" />
                  {formatTime(cancelApt.scheduled_at)}
                </p>
                {cancelApt.payment_status === "paid" && (
                  <div className="mt-3 flex items-center gap-2 rounded-xl bg-amber-500/[0.04] border border-amber-200/50 px-3.5 py-2.5 text-xs font-bold text-amber-700 shadow-sm">
                    <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                    Refund of ₹{cancelApt.consultation_fee} will be processed
                  </div>
                )}
              </div>
            )}
            <Input
              value={actions.cancelReason}
              onChange={(e) => actions.setCancelReason(e.target.value)}
              placeholder="Reason for cancellation (optional)"
              className="rounded-xl border-gray-200 bg-white"
            />
          </div>

          <DialogFooter className="border-t border-gray-150/40 bg-gray-50/50 px-6 py-4 flex gap-2">
            <Button
              variant="outline"
              onClick={actions.closeCancel}
              className="rounded-xl border-gray-200 text-gray-700 font-semibold transition-all duration-200 hover:-translate-y-0.5 active:scale-95 cursor-pointer h-10 px-4"
            >
              Keep Appointment
            </Button>
            <Button
              className="rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold transition-all duration-200 hover:-translate-y-0.5 active:scale-95 cursor-pointer h-10 px-4"
              disabled={actions.cancelMutation.isPending}
              onClick={actions.confirmCancel}
            >
              {actions.cancelMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cancelling...
                </>
              ) : (
                "Confirm Cancel"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reschedule Dialog */}
      <Dialog
        open={!!actions.rescheduleId}
        onOpenChange={(open) => {
          if (!open) actions.closeReschedule();
        }}
      >
        <DialogContent className="max-w-2xl gap-0 overflow-hidden rounded-[2rem] border border-white/50 bg-white/95 backdrop-blur-md shadow-2xl p-0 flex flex-col max-h-[90vh]">
          <div className="border-b border-gray-150/40 bg-brand/[0.02] px-6 py-5 shrink-0">
            <DialogHeader className="space-y-1">
              <DialogTitle className="flex items-center gap-2 font-display text-lg font-bold text-gray-900">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand/10 border border-brand/20 text-brand shadow-sm">
                  <CalendarClock className="h-4 w-4" />
                </div>
                Reschedule Appointment
              </DialogTitle>
              <DialogDescription className="text-xs text-gray-500">
                Pick a new date and time slot. Your current slot will be released.
                {rescheduleApt?.payment_status === "paid" && (
                  <span className="mt-1 block font-bold text-emerald-600">
                    Payment will transfer to the new appointment automatically.
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="px-6 py-5 flex-1 overflow-y-auto">
            {rescheduleApt && (
              <div className="mb-4 rounded-xl border border-white/50 bg-gray-50/50 p-3.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  Current appointment
                </p>
                <p className="mt-1 text-sm font-bold text-gray-900">
                  {rescheduleApt.doctor_name} ·{" "}
                  {formatDate(rescheduleApt.scheduled_at)} at{" "}
                  {formatTime(rescheduleApt.scheduled_at)}
                </p>
              </div>
            )}

            {rescheduleApt && (
              <SlotPicker
                doctorId={rescheduleApt.doctor_id}
                selectedDate={new Date()}
                selectedSlot={actions.rescheduleSlot}
                onDateChange={() => actions.setRescheduleSlot(null)}
                onSlotChange={actions.setRescheduleSlot}
                variant="week"
                maxDate={maxBookingDate}
                groupByTimeOfDay
                showSuggestions
              />
            )}

            <Input
              value={actions.rescheduleNote}
              onChange={(e) => actions.setRescheduleNote(e.target.value)}
              placeholder="Note for the clinic (optional)"
              className="mt-4 rounded-xl border-gray-200 bg-white"
            />
          </div>

          <DialogFooter className="border-t border-gray-150/40 bg-gray-50/50 px-6 py-4 flex gap-2 shrink-0">
            <Button
              variant="outline"
              onClick={actions.closeReschedule}
              className="rounded-xl border-gray-200 text-gray-700 font-semibold transition-all duration-200 hover:-translate-y-0.5 active:scale-95 cursor-pointer h-10 px-4"
            >
              Cancel
            </Button>
            <Button
              disabled={
                !actions.rescheduleSlot ||
                actions.rescheduleMutation.isPending
              }
              onClick={actions.confirmReschedule}
              className="gap-2 rounded-xl bg-brand text-white font-bold transition-all duration-200 hover:-translate-y-0.5 active:scale-95 cursor-pointer h-10 px-4 shadow-sm"
            >
              {actions.rescheduleMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Rescheduling...
                </>
              ) : (
                <>
                  Confirm <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PatientShell>
  );
}

export default function PatientAppointmentsPage() {
  return (
    <AuthGuard role="patient">
      <AppointmentsContent />
    </AuthGuard>
  );
}
