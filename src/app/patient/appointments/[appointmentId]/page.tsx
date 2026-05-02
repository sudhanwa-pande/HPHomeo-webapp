"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEventStream } from "@/hooks/use-event-stream";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  CalendarClock,
  CheckCircle2,
  Clock,
  ClipboardList,
  Copy,
  CreditCard,
  FileText,
  IndianRupee,
  Loader2,
  MapPin,
  MonitorPlay,
  RefreshCcw,
  Shield,
  Video,
  XCircle,
} from "lucide-react";

import api from "@/lib/api";
import {
  formatDateLong,
  formatTime,
  formatShortDate,
  formatDate,
  canCancel,
  canJoinCall,
  canReschedule,
  STATUS_STYLES,
  PAYMENT_LABELS,
  REFUND_CONFIG,
} from "@/lib/appointment-utils";
import { useAppointmentActions } from "@/hooks/use-appointment-mutations";
import { AuthGuard } from "@/components/auth-guard";
import { PatientShell } from "@/components/patient/patient-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/loading";
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
  AppointmentTimeline,
  AppointmentStatusBadge,
  DoctorInfoCard,
  PrescriptionReceiptPreview,
  SlotPicker,
  StickyActionBar,
} from "@/components/appointment";
import { ReminderSettings } from "@/components/appointment/reminder-settings";
import { PatientNotes } from "@/components/appointment/patient-notes";
import { RatingReview } from "@/components/appointment/rating-review";
import type {
  PatientAppointment,
  PatientAppointmentsResponse,
  PublicDoctor,
} from "@/types/patient";
import type { StatusVariant } from "@/components/doctor/ui/status-badge";

/* ── Tab Types ── */
type DetailTab = "overview" | "documents" | "activity";

/* ── Info Item ── */
function InfoItem({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Calendar;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-gray-50 p-3 ring-1 ring-gray-100">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500/60">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <p className="mt-1.5 text-sm font-semibold text-gray-900">{value}</p>
    </div>
  );
}

/* ── Tab content fade ── */
const tabFade = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: { duration: 0.2 },
};

/* ── Main ── */

function AppointmentDetailContent() {
  const router = useRouter();
  const params = useParams();
  const appointmentId = params.appointmentId as string;
  const queryClient = useQueryClient();
  const actions = useAppointmentActions();
  const [activeTab, setActiveTab] = useState<DetailTab>("overview");

  // Auto-refresh when doctor completes the appointment (no re-login needed)
  useEventStream({
    path: "/patient/events/stream",
    onEvent: {
      appointment_completed: () => {
        queryClient.invalidateQueries({ queryKey: ["patient", "appointment", appointmentId] });
        queryClient.invalidateQueries({ queryKey: ["patient", "prescriptions"] });
      },
    },
    onReconnect: () => {
      queryClient.invalidateQueries({ queryKey: ["patient", "appointment", appointmentId] });
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["patient", "appointment", appointmentId],
    queryFn: async () => {
      const { data } = await api.get<PatientAppointmentsResponse>(
        "/patient/appointments",
        { params: { limit: 100 } },
      );
      return (
        data.items.find((a) => a.appointment_id === appointmentId) || null
      );
    },
  });

  const apt = data;

  const { data: doctorProfile } = useQuery({
    queryKey: ["public", "doctor", apt?.doctor_id],
    queryFn: async () => {
      const { data } = await api.get<PublicDoctor>(`/public/doctors/${apt!.doctor_id}`);
      return data;
    },
    enabled: !!apt?.doctor_id,
  });

  if (isLoading) {
    return (
      <PatientShell title="Appointment" subtitle="Loading...">
        <div className="mx-auto max-w-3xl space-y-4">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-10 w-72 rounded-xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </PatientShell>
    );
  }

  if (!apt) {
    return (
      <PatientShell title="Appointment" subtitle="Not found">
        <div className="mx-auto max-w-3xl">
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-gray-200/60 bg-gray-50/30 py-14 text-center">
            <AlertCircle className="mb-3 h-8 w-8 text-gray-300" />
            <p className="text-sm font-medium text-gray-500">
              Appointment not found
            </p>
            <Button
              size="sm"
              className="mt-4 rounded-xl"
              onClick={() => router.push("/patient/appointments")}
            >
              Back to Appointments
            </Button>
          </div>
        </div>
      </PatientShell>
    );
  }

  const statusStyle = STATUS_STYLES[apt.status] || STATUS_STYLES.confirmed;
  const joinable = canJoinCall(apt);
  const cancellable = canCancel(apt);
  const reschedulable = canReschedule(apt);
  const needsPay =
    apt.status === "pending_payment" && apt.payment_choice === "pay_now";
  const refundInfo =
    apt.refund_status && apt.refund_status !== "none"
      ? REFUND_CONFIG[apt.refund_status]
      : null;

  const tabs: { key: DetailTab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "documents", label: "Documents" },
    { key: "activity", label: "Activity" },
  ];

  const shortId = apt.appointment_id.slice(0, 8).toUpperCase();

  return (
    <PatientShell
      title="Appointment Details"
      subtitle={apt.doctor_name}
      headerRight={
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/patient/appointments")}
          className="gap-1"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </Button>
      }
    >
      <div className="mx-auto max-w-3xl space-y-4">
        {/* ═══ Status Header + Action Bar ═══ */}
        <div
          className={`overflow-hidden rounded-2xl border ${statusStyle.border} ${statusStyle.bg}`}
        >
          <div className="p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              {/* Left: Doctor + appointment info */}
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/80 shadow-sm ring-1 ring-gray-100">
                  {apt.mode === "online" ? (
                    <MonitorPlay className="h-5 w-5 text-brand" />
                  ) : (
                    <MapPin className="h-5 w-5 text-gray-500" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <AppointmentStatusBadge
                      status={apt.status as StatusVariant}
                      size="xs"
                    />
                    <span className="text-[11px] font-mono text-gray-400">
                      #{shortId}
                    </span>
                  </div>
                  <p className="mt-1 text-base font-bold text-gray-900">
                    {apt.doctor_name}
                  </p>
                  <p className="mt-0.5 text-sm text-gray-500">
                    {formatDateLong(apt.scheduled_at)} at{" "}
                    {formatTime(apt.scheduled_at)}
                  </p>
                </div>
              </div>

              {/* Right: Consolidated action buttons */}
              <div className="flex flex-wrap items-center gap-2">
                {joinable && (
                  <Button
                    onClick={() =>
                      router.push(
                        `/patient/appointments/${apt.appointment_id}/waiting-room`,
                      )
                    }
                    className="gap-1.5 rounded-xl bg-emerald-600 shadow-sm shadow-emerald-600/15 hover:bg-emerald-700"
                  >
                    <Video className="h-4 w-4" />
                    Join Call
                  </Button>
                )}
                {needsPay && (
                  <Button
                    onClick={() => actions.paymentMutation.mutate(apt)}
                    disabled={actions.paymentMutation.isPending}
                    className="gap-1.5 rounded-xl"
                  >
                    {actions.paymentMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CreditCard className="h-4 w-4" />
                    )}
                    Complete Payment
                  </Button>
                )}
                {reschedulable && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 rounded-xl"
                    onClick={() => actions.openReschedule(apt.appointment_id)}
                  >
                    <CalendarClock className="h-3.5 w-3.5" />
                    Reschedule
                  </Button>
                )}
                {cancellable && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 rounded-xl border-red-200 text-red-600 hover:bg-red-50"
                    onClick={() => actions.openCancel(apt.appointment_id)}
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Fee + payment strip */}
          <div className="flex items-center justify-between border-t border-gray-100 bg-white/40 px-5 py-2.5">
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <IndianRupee className="h-3 w-3" />
                {apt.consultation_fee > 0
                  ? `₹${apt.consultation_fee}`
                  : "Free"}
              </span>
              <span className="flex items-center gap-1">
                <CreditCard className="h-3 w-3" />
                {PAYMENT_LABELS[apt.payment_status] || apt.payment_status}
              </span>
              <span className="flex items-center gap-1">
                {apt.appointment_type === "follow_up" ? "Follow-up" : "New consultation"}
              </span>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(apt.appointment_id);
              }}
              className="flex items-center gap-1 text-[11px] text-gray-400 transition-colors hover:text-gray-600"
              title="Copy appointment ID"
            >
              <Copy className="h-3 w-3" />
              Copy ID
            </button>
          </div>
        </div>

        {/* Refund status */}
        {refundInfo && (
          <div
            className={`rounded-2xl border ${refundInfo.border} ${refundInfo.bg} p-4`}
          >
            <div className="flex items-start gap-3">
              <Clock
                className={`mt-0.5 h-5 w-5 shrink-0 ${refundInfo.text} ${refundInfo.spinning ? "animate-spin" : ""}`}
              />
              <div className="flex-1">
                <p className={`text-sm font-bold ${refundInfo.text}`}>
                  {refundInfo.label}
                </p>
                <p
                  className={`mt-0.5 text-xs ${refundInfo.text} opacity-80`}
                >
                  {refundInfo.desc}
                </p>
              </div>
              {apt.consultation_fee > 0 && (
                <p className={`text-lg font-bold ${refundInfo.text}`}>
                  ₹{apt.consultation_fee}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ═══ Tab Navigation ═══ */}
        <div className="flex gap-1 rounded-xl border border-gray-200/60 bg-white p-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                activeTab === t.key
                  ? "bg-gray-900 text-white shadow-sm"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ═══ Tab Content ═══ */}
        <AnimatePresence mode="wait">
          {activeTab === "overview" && (
            <motion.div key="overview" {...tabFade} className="space-y-4">
              {/* Doctor Info Card */}
              <DoctorInfoCard
                doctor={{
                  name: apt.doctor_name,
                  photo: doctorProfile?.profile_photo,
                  specialization: doctorProfile?.specialization,
                  city: doctorProfile?.city,
                  clinic_name: doctorProfile?.clinic_name,
                  doctor_id: apt.doctor_id,
                }}
                showViewProfile
                onViewProfile={() =>
                  router.push(`/patient/doctors/${apt.doctor_id}`)
                }
              />

              {/* Details grid */}
              <div className="rounded-2xl border border-gray-200/60 bg-white p-5">
                <h3 className="mb-4 text-sm font-semibold text-gray-900">
                  Appointment Information
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <InfoItem
                    icon={Calendar}
                    label="Date"
                    value={formatDateLong(apt.scheduled_at)}
                  />
                  <InfoItem
                    icon={Clock}
                    label="Time"
                    value={formatTime(apt.scheduled_at)}
                  />
                  <InfoItem
                    icon={apt.mode === "online" ? MonitorPlay : MapPin}
                    label="Mode"
                    value={
                      apt.mode === "online"
                        ? "Online (Video Call)"
                        : "Walk-in Visit"
                    }
                  />
                  <InfoItem
                    icon={Shield}
                    label="Payment Method"
                    value={
                      apt.payment_choice === "pay_now"
                        ? "Online Payment"
                        : "Pay at Clinic"
                    }
                  />
                  <InfoItem
                    icon={ClipboardList}
                    label="Type"
                    value={
                      apt.appointment_type === "follow_up"
                        ? "Follow-up"
                        : "New Consultation"
                    }
                  />
                  <InfoItem
                    icon={Calendar}
                    label="Booked On"
                    value={formatShortDate(apt.created_at)}
                  />
                </div>
              </div>

              {/* Patient Notes — editable for upcoming, read-only for completed */}
              {(apt.status === "confirmed" || apt.status === "pending_payment") && (
                <PatientNotes
                  appointmentId={apt.appointment_id}
                  initialNotes={apt.notes}
                />
              )}
              {apt.status === "completed" && apt.notes && (
                <PatientNotes
                  appointmentId={apt.appointment_id}
                  initialNotes={apt.notes}
                  readOnly
                />
              )}

              {/* Cancellation details */}
              {apt.status === "cancelled" && (
                <div className="rounded-2xl border border-red-100 bg-red-50/30 p-5">
                  <h3 className="mb-2 text-sm font-semibold text-red-800">
                    Cancellation Details
                  </h3>
                  {apt.cancelled_at && (
                    <p className="text-xs text-red-600">
                      Cancelled on {formatDateLong(apt.cancelled_at)}
                    </p>
                  )}
                  {apt.cancel_reason && (
                    <div className="mt-2 rounded-xl bg-red-50 p-3">
                      <p className="text-xs font-semibold text-red-700">
                        Reason
                      </p>
                      <p className="mt-0.5 text-sm text-red-600">
                        {apt.cancel_reason}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Follow-up section */}
              {apt.is_follow_up_eligible &&
                !apt.follow_up_used &&
                apt.follow_up_eligible_until && (
                  <div className="rounded-2xl border border-violet-200 bg-violet-50/50 p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100">
                        <RefreshCcw className="h-4 w-4 text-violet-600" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-violet-800">
                          Free Follow-up Available
                        </p>
                        <p className="mt-0.5 text-xs text-violet-600">
                          Book before{" "}
                          {formatShortDate(apt.follow_up_eligible_until)}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() =>
                          router.push(
                            `/patient/book/${apt.doctor_id}?followUp=${apt.appointment_id}`,
                          )
                        }
                        className="rounded-xl bg-violet-600 hover:bg-violet-700"
                      >
                        Book
                      </Button>
                    </div>
                  </div>
                )}

              {apt.follow_up_used && (
                <div className="flex items-center gap-2 rounded-2xl bg-gray-50 p-3.5 ring-1 ring-gray-100">
                  <CheckCircle2 className="h-4 w-4 text-gray-400" />
                  <p className="text-xs text-gray-500">
                    Follow-up appointment has been booked
                  </p>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === "documents" && (
            <motion.div key="documents" {...tabFade} className="space-y-4">
              {/* Prescription & Receipt Previews */}
              <PrescriptionReceiptPreview
                appointmentId={apt.appointment_id}
                hasPrescription={apt.status === "completed"}
                hasReceipt={
                  apt.payment_status === "paid" ||
                  apt.payment_status === "refunded"
                }
                fee={apt.consultation_fee}
                paymentStatus={apt.payment_status}
              />

              {/* Empty state if no documents */}
              {apt.status !== "completed" &&
                apt.payment_status !== "paid" &&
                apt.payment_status !== "refunded" && (
                  <div className="flex flex-col items-center rounded-2xl border border-dashed border-gray-200/60 bg-gray-50/30 py-14 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
                      <FileText className="h-5 w-5 text-gray-300" />
                    </div>
                    <p className="mt-3 text-sm font-medium text-gray-500">
                      No documents yet
                    </p>
                    <p className="mt-1 max-w-xs text-xs text-gray-400">
                      Prescriptions and receipts will appear here after your consultation is completed.
                    </p>
                  </div>
                )}

              {/* Patient Notes (read-only in documents for completed) */}
              {apt.status === "completed" && apt.notes && (
                <PatientNotes
                  appointmentId={apt.appointment_id}
                  initialNotes={apt.notes}
                  readOnly
                />
              )}
            </motion.div>
          )}

          {activeTab === "activity" && (
            <motion.div key="activity" {...tabFade} className="space-y-4">
              {/* Appointment Timeline */}
              <div className="rounded-2xl border border-gray-200/60 bg-white p-5">
                <h3 className="mb-4 text-sm font-semibold text-gray-900">
                  Appointment Journey
                </h3>
                <AppointmentTimeline appointment={apt} />
              </div>

              {/* Rate & Review (after completion) */}
              {apt.status === "completed" && (
                <RatingReview
                  appointmentId={apt.appointment_id}
                  existingReview={apt.review}
                  doctorName={apt.doctor_name}
                />
              )}

              {/* Reminders */}
              {(apt.status === "confirmed" ||
                apt.status === "pending_payment") && (
                <ReminderSettings
                  appointmentId={apt.appointment_id}
                  initialPreferences={apt.reminder_preferences}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Sticky bottom bar (mobile) */}
      <StickyActionBar
        appointment={apt}
        onJoinCall={() =>
          router.push(
            `/patient/appointments/${apt.appointment_id}/waiting-room`,
          )
        }
        onPay={() => actions.paymentMutation.mutate(apt)}
        onCancel={() => actions.openCancel(apt.appointment_id)}
        onReschedule={() => actions.openReschedule(apt.appointment_id)}
        isPaying={actions.paymentMutation.isPending}
      />

      {/* Cancel Dialog */}
      <Dialog
        open={!!actions.cancellingId}
        onOpenChange={(open) => {
          if (!open) actions.closeCancel();
        }}
      >
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-500" />
              Cancel Appointment
            </DialogTitle>
            <DialogDescription>
              This action cannot be undone.
              {apt.payment_status === "paid" &&
                ` A refund of ₹${apt.consultation_fee} will be processed automatically.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-xl bg-gray-50 p-3 text-sm text-gray-900 ring-1 ring-gray-100">
              <p className="font-semibold">{apt.doctor_name}</p>
              <p className="text-xs text-gray-500">
                {formatDateLong(apt.scheduled_at)} at{" "}
                {formatTime(apt.scheduled_at)}
              </p>
            </div>
            <Input
              value={actions.cancelReason}
              onChange={(e) => actions.setCancelReason(e.target.value)}
              placeholder="Reason (optional)"
              className="rounded-xl"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={actions.closeCancel}
              className="rounded-xl"
            >
              Keep
            </Button>
            <Button
              className="rounded-xl bg-red-600 hover:bg-red-700"
              disabled={actions.cancelMutation.isPending}
              onClick={actions.confirmCancel}
            >
              {actions.cancelMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Confirm Cancellation
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
        <DialogContent className="max-w-2xl rounded-2xl p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-brand" />
              Reschedule Appointment
            </DialogTitle>
            <DialogDescription>
              Pick a new date and time slot.
              {apt.payment_status === "paid" &&
                " Your payment will be transferred automatically."}
            </DialogDescription>
          </DialogHeader>

          <div className="px-6">
            <SlotPicker
              doctorId={apt.doctor_id}
              selectedDate={new Date()}
              selectedSlot={actions.rescheduleSlot}
              onDateChange={() => actions.setRescheduleSlot(null)}
              onSlotChange={actions.setRescheduleSlot}
              variant="week"
              groupByTimeOfDay
              showSuggestions
            />
            <Input
              value={actions.rescheduleNote}
              onChange={(e) => actions.setRescheduleNote(e.target.value)}
              placeholder="Note for the clinic (optional)"
              className="mt-4 rounded-xl"
            />
          </div>

          <DialogFooter className="px-6 pb-6">
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
              className="gap-1.5 rounded-xl"
            >
              {actions.rescheduleMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Confirm New Slot
              <ArrowRight className="h-4 w-4" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PatientShell>
  );
}

export default function PatientAppointmentDetailPage() {
  return (
    <AuthGuard role="patient">
      <AppointmentDetailContent />
    </AuthGuard>
  );
}
