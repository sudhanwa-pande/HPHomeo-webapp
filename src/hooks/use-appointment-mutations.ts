import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api, { getApiError } from "@/lib/api";
import { beginPatientAppointmentPayment } from "@/lib/patient-payment";
import { notifyError, notifyInfo, notifySuccess } from "@/lib/notify";
import { usePatientAuth } from "@/stores/patient-auth";
import type { PatientAppointment } from "@/types/patient";

export function useAppointmentActions() {
  const queryClient = useQueryClient();
  const { patient } = usePatientAuth();

  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [rescheduleSlot, setRescheduleSlot] = useState<string | null>(null);
  const [rescheduleNote, setRescheduleNote] = useState("");
  const [payingId, setPayingId] = useState<string | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["patient"] });
  };

  const cancelMutation = useMutation({
    mutationFn: async ({
      appointmentId,
      reason,
    }: {
      appointmentId: string;
      reason?: string;
    }) => {
      await api.post(`/patient/appointments/${appointmentId}/cancel`, {
        reason: reason?.trim() || undefined,
      });
    },
    onSuccess: () => {
      notifySuccess(
        "Appointment cancelled",
        "Your appointment has been cancelled successfully.",
      );
      invalidate();
      setCancellingId(null);
      setCancelReason("");
    },
    onError: (error) => {
      notifyError("Couldn't cancel appointment", getApiError(error));
    },
  });

  const rescheduleMutation = useMutation({
    mutationFn: async ({
      appointmentId,
      newScheduledAt,
      reason,
    }: {
      appointmentId: string;
      newScheduledAt: string;
      reason?: string;
    }) => {
      await api.post(`/patient/appointments/${appointmentId}/reschedule`, {
        new_scheduled_at: newScheduledAt,
        reason: reason?.trim() || undefined,
      });
    },
    onSuccess: () => {
      notifySuccess(
        "Appointment rescheduled",
        "Your appointment has been moved to the new time slot.",
      );
      invalidate();
      setRescheduleId(null);
      setRescheduleSlot(null);
      setRescheduleNote("");
    },
    onError: (error) => {
      notifyError("Couldn't reschedule", getApiError(error));
    },
  });

  const paymentMutation = useMutation({
    mutationFn: async (apt: PatientAppointment) => {
      setPayingId(apt.appointment_id);
      return new Promise<PatientAppointment>((resolve, reject) => {
        beginPatientAppointmentPayment({
          appointmentId: apt.appointment_id,
          patientName: patient?.full_name || apt.patient_name,
          patientEmail: patient?.email || apt.patient_email,
          patientPhone: patient?.phone || apt.patient_phone,
          description: `Consultation with ${apt.doctor_name}`,
          onSuccess: () => resolve(apt),
          onDismiss: () => reject(new Error("PAYMENT_DISMISSED")),
        }).catch(reject);
      });
    },
    onSuccess: () => {
      notifySuccess(
        "Payment successful!",
        "Your appointment will be confirmed shortly.",
      );
      invalidate();
    },
    onError: (error) => {
      if (error instanceof Error && error.message === "PAYMENT_DISMISSED") {
        notifyInfo(
          "Payment not completed",
          "You can retry payment from the appointments page.",
        );
        return;
      }
      notifyError("Couldn't start payment", getApiError(error));
    },
    onSettled: () => {
      setPayingId(null);
    },
  });

  function openCancel(appointmentId: string) {
    setCancellingId(appointmentId);
    setCancelReason("");
  }

  function closeCancel() {
    setCancellingId(null);
    setCancelReason("");
  }

  function openReschedule(appointmentId: string) {
    setRescheduleId(appointmentId);
    setRescheduleSlot(null);
    setRescheduleNote("");
  }

  function closeReschedule() {
    setRescheduleId(null);
    setRescheduleSlot(null);
    setRescheduleNote("");
  }

  function confirmCancel() {
    if (!cancellingId) return;
    cancelMutation.mutate({ appointmentId: cancellingId, reason: cancelReason });
  }

  function confirmReschedule() {
    if (!rescheduleId || !rescheduleSlot) return;
    rescheduleMutation.mutate({
      appointmentId: rescheduleId,
      newScheduledAt: rescheduleSlot,
      reason: rescheduleNote,
    });
  }

  return {
    // cancel
    cancellingId,
    cancelReason,
    setCancelReason,
    cancelMutation,
    openCancel,
    closeCancel,
    confirmCancel,
    // reschedule
    rescheduleId,
    rescheduleSlot,
    setRescheduleSlot,
    rescheduleNote,
    setRescheduleNote,
    rescheduleMutation,
    openReschedule,
    closeReschedule,
    confirmReschedule,
    // payment
    payingId,
    paymentMutation,
  };
}
