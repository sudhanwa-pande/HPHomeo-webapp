"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  Calendar,
  CalendarClock,
  CalendarDays,
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
          className="h-8 gap-1.5 bg-brand text-xs hover:bg-brand/90"
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
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <QuickStatsStrip
                appointments={appointments}
                activeTab={tab}
                onTabChange={setTab}
                className="flex-1"
              />
              <div className="flex shrink-0 gap-1 rounded-xl border border-gray-200/60 bg-white p-1">
                <button
                  onClick={() => setView("list")}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${
                    view === "list"
                      ? "bg-gray-900 text-white"
                      : "text-gray-500 hover:text-gray-900"
                  }`}
                >
                  <LayoutList className="h-3.5 w-3.5" />
                  List
                </button>
                <button
                  onClick={() => setView("calendar")}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${
                    view === "calendar"
                      ? "bg-gray-900 text-white"
                      : "text-gray-500 hover:text-gray-900"
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
        <DialogContent className="max-w-md gap-0 overflow-hidden rounded-2xl p-0">
          <div className="border-b border-gray-100 bg-red-50/40 px-6 py-5">
            <DialogHeader className="space-y-1">
              <DialogTitle className="flex items-center gap-2 text-base">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100">
                  <XCircle className="h-4 w-4 text-red-600" />
                </div>
                Cancel Appointment
              </DialogTitle>
              <DialogDescription className="text-xs text-gray-500">
                This action cannot be undone. If you paid online, a refund will
                be initiated automatically.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="space-y-3 px-6 py-5">
            {cancelApt && (
              <div className="rounded-xl bg-gray-50 p-3.5 ring-1 ring-gray-100">
                <p className="text-sm font-semibold text-gray-900">
                  {cancelApt.doctor_name}
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {formatDate(cancelApt.scheduled_at)} at{" "}
                  {formatTime(cancelApt.scheduled_at)}
                </p>
                {cancelApt.payment_status === "paid" && (
                  <div className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 ring-1 ring-amber-100/60">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    Refund of ₹{cancelApt.consultation_fee} will be processed
                  </div>
                )}
              </div>
            )}
            <Input
              value={actions.cancelReason}
              onChange={(e) => actions.setCancelReason(e.target.value)}
              placeholder="Reason for cancellation (optional)"
              className="rounded-xl"
            />
          </div>

          <DialogFooter className="border-t border-gray-100 bg-gray-50/30 px-6 py-4">
            <Button
              variant="outline"
              onClick={actions.closeCancel}
              className="rounded-xl"
            >
              Keep Appointment
            </Button>
            <Button
              className="rounded-xl bg-red-600 hover:bg-red-700"
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
        <DialogContent className="max-w-2xl gap-0 overflow-hidden rounded-2xl p-0">
          <div className="border-b border-gray-100 bg-brand/[0.03] px-6 py-5">
            <DialogHeader className="space-y-1">
              <DialogTitle className="flex items-center gap-2 text-base">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/10">
                  <CalendarClock className="h-4 w-4 text-brand" />
                </div>
                Reschedule Appointment
              </DialogTitle>
              <DialogDescription className="text-xs text-gray-500">
                Pick a new date and time slot. Your current slot will be
                released.
                {rescheduleApt?.payment_status === "paid" && (
                  <span className="mt-1 block font-medium text-emerald-600">
                    Payment will transfer to the new appointment.
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="px-6 py-5">
            {rescheduleApt && (
              <div className="mb-4 rounded-xl bg-gray-50 p-3.5 ring-1 ring-gray-100">
                <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
                  Current appointment
                </p>
                <p className="mt-1 text-sm font-semibold text-gray-900">
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
                groupByTimeOfDay
                showSuggestions
              />
            )}

            <Input
              value={actions.rescheduleNote}
              onChange={(e) => actions.setRescheduleNote(e.target.value)}
              placeholder="Note (optional)"
              className="mt-4 rounded-xl"
            />
          </div>

          <DialogFooter className="border-t border-gray-100 bg-gray-50/30 px-6 py-4">
            <Button
              variant="outline"
              onClick={actions.closeReschedule}
              className="rounded-xl"
            >
              Cancel
            </Button>
            <Button
              disabled={
                !actions.rescheduleSlot ||
                actions.rescheduleMutation.isPending
              }
              onClick={actions.confirmReschedule}
              className="gap-1.5 rounded-xl bg-brand hover:bg-brand/90"
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
