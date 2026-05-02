import api from "@/lib/api";
import { openRazorpayCheckout } from "@/lib/razorpay";

export interface PatientPaymentOrderResponse {
  message: string;
  appointment_id: string;
  provider?: string;
  order_id?: string | null;
  amount_paise: number;
  currency: string;
  key_id: string;
  expires_at?: string | null;
  status?: string;
  payment_status?: string;
}

interface BeginPatientPaymentParams {
  appointmentId: string;
  patientName?: string | null;
  patientEmail?: string | null;
  patientPhone?: string | null;
  description?: string;
  onSuccess: (response: RazorpaySuccessResponse) => void;
  onDismiss?: () => void;
}

export async function beginPatientAppointmentPayment({
  appointmentId,
  patientName,
  patientEmail,
  patientPhone,
  description,
  onSuccess,
  onDismiss,
}: BeginPatientPaymentParams): Promise<PatientPaymentOrderResponse> {
  const { data } = await api.post<PatientPaymentOrderResponse>(
    "/patient/payments/create-order",
    { appointment_id: appointmentId },
  );

  if (data.message === "already_paid") {
    return data;
  }

  if (!data.order_id) {
    throw new Error("Payment order missing order_id");
  }

  await openRazorpayCheckout({
    keyId: data.key_id,
    orderId: data.order_id,
    amount: data.amount_paise,
    currency: data.currency,
    patientName: patientName ?? undefined,
    patientEmail: patientEmail ?? undefined,
    patientPhone: patientPhone ?? undefined,
    description,
    onSuccess,
    onDismiss,
  });

  return data;
}
