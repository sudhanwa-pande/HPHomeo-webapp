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
    onSuccess: async (response) => {
      let isVerified = false;
      try {
        const verifyPromise = api.post("/patient/payments/verify", {
          appointment_id: appointmentId,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_order_id: response.razorpay_order_id,
          razorpay_signature: response.razorpay_signature,
        });
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Verification timeout")), 4000)
        );
        const res = await Promise.race([verifyPromise, timeoutPromise]) as any;
        if (res?.data?.status === "verified") {
          isVerified = true;
        }
      } catch (err) {
        console.error("Synchronous payment verification failed or timed out:", err);
      }
      onSuccess({ ...response, isVerified } as any);
    },
    onDismiss,
  });

  return data;
}
