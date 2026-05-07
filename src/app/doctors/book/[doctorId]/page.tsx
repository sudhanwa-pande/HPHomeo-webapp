"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  Loader2,
  MonitorPlay,
  Shield,
  Stethoscope,
  Sun,
  Sunset,
  Moon,
  User,
  Wallet,
  MapPin,
  Briefcase,
  AlertCircle,
} from "lucide-react";

import axios from "axios";

import api, { getApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { Navbar } from "@/components/layout/navbar";
import { Skeleton } from "@/components/loading";
import { Button } from "@/components/ui/button";
import type { PublicDoctor } from "@/types/patient";

/* ─── Types ─── */

interface SlotsResponse {
  doctor_id: string;
  day: string;
  slots: string[];
}

interface PublicBookingResponse {
  message: string;
  appointment_id: string;
  status: string;
  payment_choice: string;
  patient_access_token: string;
  patient_access_expires_at: string;
}

const VERIFICATION_KEY = "hphomeo:v1:payment_verification";

interface VerificationState {
  version: number;
  appointmentId: string;
  bookingData: PublicBookingResponse;
  startedAt: number;
  expiresAt: number;
}

/* ─── Helpers ─── */

function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatSlotTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function formatBookingDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function getInitials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

function getMonthRangeLabel(dates: Date[]): string {
  if (dates.length === 0) return "";
  const first = dates[0];
  const last = dates[dates.length - 1];
  const firstMonth = first.toLocaleDateString("en-US", { month: "long" });
  const lastMonth = last.toLocaleDateString("en-US", { month: "long" });
  const firstYear = first.getFullYear();
  const lastYear = last.getFullYear();
  if (firstYear !== lastYear) return `${firstMonth}, ${firstYear} - ${lastMonth}, ${lastYear}`;
  if (firstMonth !== lastMonth) return `${firstMonth} - ${lastMonth}, ${firstYear}`;
  return `${firstMonth}, ${firstYear}`;
}

function groupSlotsByPeriod(slots: string[]) {
  const morning: string[] = [];
  const afternoon: string[] = [];
  const evening: string[] = [];
  for (const slot of slots) {
    const hour = new Date(slot).getHours();
    if (hour < 12) morning.push(slot);
    else if (hour < 17) afternoon.push(slot);
    else evening.push(slot);
  }
  return [
    { label: "Morning", icon: Sun, items: morning },
    { label: "Afternoon", icon: Sunset, items: afternoon },
    { label: "Evening", icon: Moon, items: evening },
  ];
}

/* ─── Steps ─── */

type Step = "slot" | "details" | "review";

const STEPS: { key: Step; label: string; number: number }[] = [
  { key: "slot", label: "Pick a slot", number: 1 },
  { key: "details", label: "Your details", number: 2 },
  { key: "review", label: "Confirm & pay", number: 3 },
];

/* ═══════════════════════════════════════════════════════
   Checkout Page
   ═══════════════════════════════════════════════════════ */

export default function BookDoctorPage() {
  const params = useParams<{ doctorId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const doctorId = params.doctorId;

  // Pre-selected slot from query param — validate ISO format before trusting it
  const rawSlot = searchParams.get("slot");
  const preselectedSlot = rawSlot && !isNaN(Date.parse(rawSlot)) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(rawSlot)
    ? rawSlot
    : null;

  // Step management
  const [step, setStep] = useState<Step>(preselectedSlot ? "details" : "slot");

  // Slot selection.
  // Hydration-safe: Next.js renders this once on the server (UTC) and once on
  // the client (browser locale). `new Date()` differs between the two — even
  // by milliseconds it triggers React's hydration mismatch warning. We start
  // as null and set "today" in useEffect below so the SSR and initial client
  // renders match. preselectedSlot is safe because it comes from the URL.
  const [selectedDate, setSelectedDate] = useState<Date | null>(
    preselectedSlot ? new Date(preselectedSlot) : null,
  );
  const [selectedSlot, setSelectedSlot] = useState<string | null>(preselectedSlot);

  useEffect(() => {
    if (!selectedDate) {
      setSelectedDate(new Date());
    }
  }, [selectedDate]);

  // Patient details
  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [patientSex, setPatientSex] = useState("male");
  const [patientEmail, setPatientEmail] = useState("");

  // Mode & payment
  const [mode, setMode] = useState<"online" | "walk_in">("online");
  const [paymentChoice, setPaymentChoice] = useState<"pay_now" | "pay_at_clinic">("pay_now");

  // Success state
  const [bookingSuccess, setBookingSuccess] = useState<PublicBookingResponse | null>(null);
  const [paymentCompleted, setPaymentCompleted] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<"idle" | "verifying" | "success" | "failed">("idle");

  // Payment hold countdown — set when the payment order is first created.
  // Backend's payment window is fixed from initial booking and does NOT
  // reset on retry, so we only need to capture this once.
  const [paymentExpiresAt, setPaymentExpiresAt] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  useEffect(() => {
    if (!paymentExpiresAt) return;
    const tick = () => {
      const diff = new Date(paymentExpiresAt).getTime() - Date.now();
      setSecondsLeft(Math.max(0, Math.floor(diff / 1000)));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [paymentExpiresAt]);

  // Restore verification state from localStorage
  useEffect(() => {
    const restoreVerification = async () => {
      try {
        const stored = localStorage.getItem(VERIFICATION_KEY);
        if (!stored) return;

        const parsed: VerificationState = JSON.parse(stored);
        if (parsed.version !== 1) return;

        if (Date.now() > parsed.expiresAt) {
          localStorage.removeItem(VERIFICATION_KEY);
          return;
        }

        // Fetch immediate status
        const { data } = await api.get<any>(
          `/public/appointments/${parsed.appointmentId}`,
          { _skipAuthRefresh: true } as any
        );

        const isPaid = data.status === "confirmed" && data.payment_status === "paid";
        const isFailed = data.payment_status === "failed" || data.payment_status === "refunded" || data.status === "cancelled";

        if (isPaid) {
          setPaymentCompleted(true);
          setBookingSuccess(parsed.bookingData);
          setVerificationStatus("success");
          localStorage.removeItem(VERIFICATION_KEY);
          return;
        }

        if (isFailed) {
          setBookingSuccess(parsed.bookingData);
          setVerificationStatus("failed");
          localStorage.removeItem(VERIFICATION_KEY);
          return;
        }

        // Still pending
        setBookingSuccess(parsed.bookingData);
        setVerificationStatus("verifying");
      } catch (err) {
        // Silently ignore storage parse or immediate fetch errors and wait for polling
      }
    };
    restoreVerification();
  }, []);

  const attemptsRef = useRef(0);
  const pollingActiveRef = useRef(false);

  // Polling for webhook eventual consistency
  useEffect(() => {
    if (verificationStatus !== "verifying" || !bookingSuccess) {
      pollingActiveRef.current = false;
      return;
    }

    if (pollingActiveRef.current) return;
    pollingActiveRef.current = true;

    attemptsRef.current = 0;
    const maxAttempts = 6; // 18 seconds max
    let timeoutId: NodeJS.Timeout;
    const abortController = new AbortController();

    const checkStatus = async () => {
      attemptsRef.current++;
      try {
        console.log(`Polling appointment status (attempt ${attemptsRef.current}/${maxAttempts})...`);
        const { data } = await api.get<any>(
          `/public/appointments/${bookingSuccess.appointment_id}`,
          { 
            signal: abortController.signal,
            _skipAuthRefresh: true 
          } as any
        );

        const isPaid = data.status === "confirmed" && data.payment_status === "paid";
        const isFailed = data.payment_status === "failed" || data.payment_status === "refunded" || data.status === "cancelled";

        if (isPaid) {
          console.log("Payment verified successfully on backend.");
          setPaymentCompleted(true);
          setVerificationStatus("success");
          localStorage.removeItem(VERIFICATION_KEY);
          pollingActiveRef.current = false;
          return;
        }

        if (isFailed) {
          console.error("Payment failed or cancelled during verification.");
          setVerificationStatus("failed");
          localStorage.removeItem(VERIFICATION_KEY);
          pollingActiveRef.current = false;
          return;
        }
      } catch (err: any) {
        if (err.name === "CanceledError" || err.message === "canceled") return;
        console.error("Error polling appointment status:", err);
      }

      if (attemptsRef.current >= maxAttempts) {
        console.error("Payment verification timed out.");
        setVerificationStatus("failed");
        localStorage.removeItem(VERIFICATION_KEY);
        pollingActiveRef.current = false;
      } else {
        timeoutId = setTimeout(checkStatus, 3000);
      }
    };

    checkStatus();

    return () => {
      clearTimeout(timeoutId);
      abortController.abort();
      pollingActiveRef.current = false;
    };
  }, [verificationStatus, bookingSuccess]);

  /* ─── Queries ─── */

  const { data: doctor, isLoading: doctorLoading } = useQuery({
    queryKey: ["public", "doctor", doctorId],
    queryFn: async () => {
      const { data } = await api.get<PublicDoctor>(`/public/doctors/${doctorId}`);
      return data;
    },
    enabled: !!doctorId,
  });

  // Set default mode based on doctor's available modes
  useEffect(() => {
    if (!doctor) return;
    const modes = doctor.available_modes || [];
    if (modes.includes("online")) {
      setMode("online");
      setPaymentChoice("pay_now");
    } else if (modes.includes("walk_in")) {
      setMode("walk_in");
      setPaymentChoice("pay_at_clinic");
    }
  }, [doctor]);

  const dateOptions = useMemo<Date[]>(() => {
    if (!selectedDate) return [];
    const dates: Date[] = [];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      dates.push(d);
    }
    return dates;
  }, [selectedDate]);

  const monthLabel = getMonthRangeLabel(dateOptions);
  const dateString = selectedDate ? toDateString(selectedDate) : "";

  const { data: slotsData, isLoading: slotsLoading } = useQuery({
    queryKey: ["public", "doctor", doctorId, "slots", dateString],
    queryFn: async () => {
      const { data } = await api.get<SlotsResponse>(
        `/public/doctors/${doctorId}/slots`,
        { params: { day: dateString } }
      );
      return data;
    },
    enabled: !!doctorId && !!selectedDate,
  });

  const slots = slotsData?.slots || [];

  const fee = doctor
    ? mode === "online"
      ? doctor.online_fee || 0
      : doctor.walkin_fee || 0
    : 0;

  const effectivePaymentChoice = mode === "online" ? "pay_now" : paymentChoice;

  const canProceedToDetails = !!selectedSlot;

  const canProceedToReview =
    patientName.trim().length >= 2 &&
    patientPhone.trim().length >= 10 &&
    patientAge &&
    parseInt(patientAge) > 0 &&
    parseInt(patientAge) <= 120;

  /* ─── Booking mutation ─── */

  const bookMutation = useMutation({
    mutationFn: async () => {
      if (!doctor || !selectedSlot) throw new Error("Missing data");

      const effectiveMode = mode;
      const effectivePayment = effectiveMode === "online" ? "pay_now" : paymentChoice;

      const payload = {
        doctor_id: doctor.doctor_id,
        patient_name: patientName.trim(),
        patient_phone: patientPhone.trim(),
        patient_age: parseInt(patientAge),
        patient_sex: patientSex,
        scheduled_at: selectedSlot,
        mode: effectiveMode,
        payment_choice: effectivePayment,
        appointment_type: "new" as const,
        ...(patientEmail.trim() ? { patient_email: patientEmail.trim() } : {}),
      };

      const { data } = await api.post<PublicBookingResponse>(
        "/public/appointments/book",
        payload
      );
      return data;
    },
    onSuccess: async (data) => {
      if (data.status === "pending_payment" && data.payment_choice === "pay_now") {
        try {
          console.log("Payment initiated. Creating order...");
          const { data: orderData } = await api.post<{
            message: string;
            order_id: string;
            amount_paise: number;
            currency: string;
            key_id: string;
            expires_at: string | null;
          }>("/public/payments/create-order", {
            appointment_id: data.appointment_id,
          });

          if (orderData.message === "already_paid" || !orderData.order_id) {
            setPaymentCompleted(true);
            setBookingSuccess(data);
            setVerificationStatus("success");
            return;
          }

          // Capture the payment hold expiry so the success-screen countdown
          // knows when to disable the "Pay Now" button.
          if (orderData.expires_at) {
            setPaymentExpiresAt(orderData.expires_at);
          }

          const { openRazorpayCheckout } = await import("@/lib/razorpay");
          console.log("Razorpay checkout opened for booking.");
          await openRazorpayCheckout({
            keyId: orderData.key_id,
            orderId: orderData.order_id,
            amount: orderData.amount_paise,
            currency: orderData.currency,
            patientName: patientName.trim(),
            patientEmail: patientEmail.trim() || undefined,
            patientPhone: patientPhone.trim(),
            description: `Consultation with ${doctor?.full_name || "Doctor"}`,
            onSuccess: () => {
              console.log("Payment success callback received from Razorpay.");
              setBookingSuccess(data);
              setVerificationStatus("verifying");
              localStorage.setItem(VERIFICATION_KEY, JSON.stringify({
                version: 1,
                appointmentId: data.appointment_id,
                bookingData: data,
                startedAt: Date.now(),
                expiresAt: Date.now() + 5 * 60 * 1000
              }));
            },
            onDismiss: () => {
              console.log("Razorpay checkout dismissed.");
              setBookingSuccess(data);
            },
          });
        } catch (err) {
          console.error("Error starting payment:", err);
          setBookingSuccess(data);
        }
      } else {
        setBookingSuccess(data);
        if (data.status === "confirmed") setVerificationStatus("success");
      }
    },
  });

  /* ─── Retry payment for an already-booked appointment ─── */
  // Used when the patient dismissed the Razorpay modal but the slot is still
  // reserved. Re-creates a Razorpay order against the existing appointment
  // (backend handles idempotency: returns the same order if one already exists,
  // and 409s if the 10-min hold has expired — see payment_order_service.py).

  const retryPaymentMutation = useMutation({
    mutationFn: async () => {
      if (!bookingSuccess) throw new Error("No appointment to retry");

      console.log("Retrying payment initiated. Creating order...");
      const { data: orderData } = await api.post<{
        message: string;
        order_id: string;
        amount_paise: number;
        currency: string;
        key_id: string;
        expires_at: string | null;
      }>("/public/payments/create-order", {
        appointment_id: bookingSuccess.appointment_id,
      });

      if (orderData.message === "already_paid" || !orderData.order_id) {
        setPaymentCompleted(true);
        setVerificationStatus("success");
        return;
      }

      // Backend returns the same expires_at on retries (window doesn't reset),
      // but capture it in case this is the first time we see it (e.g. user
      // navigated to a payment-pending appointment from a deep link).
      if (orderData.expires_at) {
        setPaymentExpiresAt(orderData.expires_at);
      }

      const { openRazorpayCheckout } = await import("@/lib/razorpay");
      console.log("Razorpay checkout opened for payment retry.");
      await openRazorpayCheckout({
        keyId: orderData.key_id,
        orderId: orderData.order_id,
        amount: orderData.amount_paise,
        currency: orderData.currency,
        patientName: patientName.trim(),
        patientEmail: patientEmail.trim() || undefined,
        patientPhone: patientPhone.trim(),
        description: `Consultation with ${doctor?.full_name || "Doctor"}`,
        onSuccess: () => {
          console.log("Payment success callback received from Razorpay during retry.");
          setVerificationStatus("verifying");
          if (bookingSuccess) {
            localStorage.setItem(VERIFICATION_KEY, JSON.stringify({
              version: 1,
              appointmentId: bookingSuccess.appointment_id,
              bookingData: bookingSuccess,
              startedAt: Date.now(),
              expiresAt: Date.now() + 5 * 60 * 1000
            }));
          }
        },
        onDismiss: () => {
          console.log("Razorpay checkout dismissed during retry.");
        },
      });
    },
    onError: (error) => {
      // axios.ts interceptor already toasts network/429/5xx errors; show our
      // own message for 4xx (e.g. 409 "Payment window expired").
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status && status >= 400 && status < 500 && status !== 429) {
          toast.error("Could not start payment", {
            description: getApiError(error),
          });
        }
      }
    },
  });

  /* ─── Navigation helpers ─── */

  const goToStep = useCallback((target: Step) => {
    setStep(target);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  /* ─── Render ─── */

  if (doctorLoading) {
    return (
      <div className="min-h-screen bg-brand-bg">
        <Navbar />
        <main className="container-main py-8">
          <div className="mx-auto max-w-3xl space-y-6">
            <Skeleton className="h-8 w-48" />
            <div className="rounded-2xl bg-white p-6">
              <div className="flex gap-4 items-center">
                <Skeleton className="h-16 w-16 rounded-xl" />
                <div className="space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-28" />
                </div>
              </div>
            </div>
            <Skeleton className="h-64 rounded-2xl" />
          </div>
        </main>
      </div>
    );
  }

  if (!doctor) {
    return (
      <div className="min-h-screen bg-brand-bg">
        <Navbar />
        <main className="container-main py-16 text-center">
          <Stethoscope className="mx-auto mb-4 h-12 w-12 text-brand-subtext/25" />
          <h1 className="text-xl font-semibold text-brand-dark mb-2">Doctor not found</h1>
          <p className="text-sm text-brand-subtext mb-6">
            This doctor may no longer be available.
          </p>
          <Link href="/doctors">
            <Button className="rounded-xl">Browse doctors</Button>
          </Link>
        </main>
      </div>
    );
  }

  // Success screen
  if (bookingSuccess) {
    if (verificationStatus === "verifying") {
      return (
        <div className="min-h-screen bg-brand-bg">
          <Navbar />
          <main className="container-main flex items-center justify-center py-16 px-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="w-full max-w-md rounded-2xl border border-gray-200/60 bg-white p-8 text-center shadow-sm"
            >
              <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-brand" />
              <h2 className="text-xl font-bold tracking-tight text-gray-900">
                Verifying Payment...
              </h2>
              <p className="mt-2 text-sm text-gray-500">
                Please don't close or refresh this window. We are confirming your payment with the gateway.
              </p>
            </motion.div>
          </main>
        </div>
      );
    }

    if (verificationStatus === "failed") {
      return (
        <div className="min-h-screen bg-brand-bg">
          <Navbar />
          <main className="container-main flex items-center justify-center py-16 px-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm"
            >
              <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-red-50 ring-8 ring-red-50/50">
                <AlertCircle className="h-10 w-10 text-red-600" />
              </div>
              <h2 className="text-xl font-bold tracking-tight text-gray-900">
                Verification Pending
              </h2>
              <p className="mt-2 text-sm text-gray-500">
                Payment verification is taking longer than expected or encountered an issue. Your money is safe.
              </p>
              <div className="mt-4 rounded-xl bg-gray-50 p-4 text-xs text-gray-600 text-left">
                Please wait a few minutes and check your appointments dashboard. If your payment was deducted but the appointment isn't confirmed, it will be automatically refunded.
              </div>
              <div className="mt-6 flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => router.push("/")}
                  className="w-full rounded-xl"
                >
                  Go Home
                </Button>
                <Button
                  onClick={() => retryPaymentMutation.mutate()}
                  disabled={retryPaymentMutation.isPending}
                  className="w-full rounded-xl bg-brand hover:bg-brand/90"
                >
                  {retryPaymentMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Try Again"
                  )}
                </Button>
              </div>
            </motion.div>
          </main>
        </div>
      );
    }

    const isPaid = paymentCompleted || bookingSuccess.status === "confirmed";
    const isPayLater = !isPaid && bookingSuccess.payment_choice === "pay_at_clinic";
    const isPaymentPending = !isPaid && !isPayLater;
    const refCode = bookingSuccess.appointment_id.slice(0, 8).toUpperCase();

    return (
      <div className="min-h-screen bg-brand-bg">
        <Navbar />
        <main className="container-main flex items-center justify-center py-16 px-4">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="w-full max-w-md"
          >
            {/* Header card */}
            <div className="rounded-2xl border border-gray-200/60 bg-white p-8 text-center shadow-sm">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.15, type: "spring", stiffness: 200, damping: 12 }}
                className={`mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full ring-8 ${
                  isPaymentPending
                    ? "bg-amber-50 ring-amber-50/50"
                    : "bg-emerald-50 ring-emerald-50/50"
                }`}
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.3, type: "spring", stiffness: 300 }}
                >
                  {isPaymentPending ? (
                    <Clock className="h-10 w-10 text-amber-600" />
                  ) : (
                    <CheckCircle2 className="h-10 w-10 text-emerald-600" />
                  )}
                </motion.div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <h2 className="text-xl font-bold tracking-tight text-gray-900">
                  {isPaid
                    ? "Appointment Confirmed!"
                    : isPayLater
                      ? "Appointment Booked!"
                      : "Slot Reserved"}
                </h2>
                <p className="mt-1.5 text-sm text-gray-500">
                  {isPaid
                    ? "Payment received — you\u2019re all set!"
                    : isPayLater
                      ? "Your appointment is confirmed. Pay at the clinic."
                      : "Complete payment to confirm your appointment."}
                </p>
              </motion.div>

              {/* Payment confirmation badge */}
              {isPaid && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="mx-auto mt-4 flex w-fit items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700"
                >
                  <Shield className="h-4 w-4" />
                  ₹{fee} paid successfully
                </motion.div>
              )}

              {/* Reference code */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45 }}
                className="mx-auto mt-4 flex w-fit items-center gap-2 rounded-xl bg-gray-50 px-4 py-2.5 ring-1 ring-gray-100"
              >
                <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Ref</span>
                <span className="font-mono text-sm font-bold tracking-wider text-gray-900">{refCode}</span>
              </motion.div>
            </div>

            {/* Details card */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="mt-3 rounded-2xl border border-gray-200/60 bg-white p-5"
            >
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Doctor</span>
                  <span className="font-semibold text-gray-900">{doctor.full_name}</span>
                </div>
                {selectedSlot && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Date</span>
                      <span className="font-semibold text-gray-900">{formatBookingDate(selectedSlot)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Time</span>
                      <span className="font-semibold text-gray-900">{formatSlotTime(selectedSlot)}</span>
                    </div>
                  </>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Mode</span>
                  <span className="flex items-center gap-1.5 font-semibold text-gray-900">
                    {mode === "online" ? (
                      <MonitorPlay className="h-3.5 w-3.5 text-brand" />
                    ) : (
                      <MapPin className="h-3.5 w-3.5 text-gray-400" />
                    )}
                    {mode === "online" ? "Online (Video)" : "Walk-in"}
                  </span>
                </div>
                <div className="border-t border-gray-100 pt-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-900">Total</span>
                    <span className="text-base font-bold text-brand">
                      {fee === 0 ? "Free" : `₹${fee}`}
                    </span>
                  </div>
                  {isPaid && fee > 0 && (
                    <p className="mt-1 text-right text-[11px] text-emerald-600">Paid via Razorpay</p>
                  )}
                  {isPayLater && fee > 0 && (
                    <p className="mt-1 text-right text-[11px] text-gray-400">Pay at clinic</p>
                  )}
                </div>
              </div>
            </motion.div>

            {/* Notification info — only when actually confirmed */}
            {!isPaymentPending && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.55 }}
                className="mt-3 rounded-2xl border border-gray-200/60 bg-white px-5 py-4"
              >
                <p className="text-center text-xs text-gray-500">
                  Confirmation details have been sent via WhatsApp.
                  {patientEmail.trim() && " A confirmation email is on its way too."}
                </p>
              </motion.div>
            )}

            {/* Payment pending notice — only for dismissed Razorpay */}
            {isPaymentPending && (() => {
              const hasExpiry = paymentExpiresAt !== null;
              const isExpired = hasExpiry && secondsLeft <= 0;
              const isUrgent = hasExpiry && secondsLeft > 0 && secondsLeft <= 60;
              const mm = Math.floor(secondsLeft / 60);
              const ss = (secondsLeft % 60).toString().padStart(2, "0");

              return (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.55 }}
                  className={`mt-3 rounded-2xl border px-5 py-4 ${
                    isExpired
                      ? "border-red-200 bg-red-50"
                      : "border-amber-200 bg-amber-50"
                  }`}
                >
                  <p
                    className={`text-center text-sm font-semibold ${
                      isExpired ? "text-red-800" : "text-amber-800"
                    }`}
                  >
                    {isExpired ? "Booking expired" : "Payment not completed"}
                  </p>
                  <p
                    className={`mt-1 text-center text-xs ${
                      isExpired ? "text-red-600" : "text-amber-600"
                    }`}
                  >
                    {isExpired
                      ? "Your slot was released. Please book again."
                      : "Your slot is reserved. Complete payment to confirm your appointment."}
                  </p>

                  {/* Countdown */}
                  {hasExpiry && !isExpired && (
                    <div
                      className={`mt-3 flex items-center justify-center gap-2 rounded-lg py-1.5 text-sm font-mono font-semibold tabular-nums transition-colors ${
                        isUrgent
                          ? "bg-red-100/70 text-red-700"
                          : "bg-amber-100/70 text-amber-800"
                      }`}
                    >
                      <Clock
                        className={`h-3.5 w-3.5 ${
                          isUrgent ? "animate-pulse text-red-600" : "text-amber-600"
                        }`}
                      />
                      <span>
                        Pay within {mm}:{ss}
                      </span>
                    </div>
                  )}

                  <Button
                    onClick={() => retryPaymentMutation.mutate()}
                    disabled={retryPaymentMutation.isPending || isExpired}
                    className={`mt-3 w-full rounded-xl ${
                      isExpired
                        ? "bg-gray-300 hover:bg-gray-300 cursor-not-allowed"
                        : "bg-amber-600 hover:bg-amber-700"
                    }`}
                  >
                    {retryPaymentMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Opening payment…
                      </>
                    ) : isExpired ? (
                      <>Booking expired</>
                    ) : (
                      <>Pay {fee === 0 ? "Now" : `₹${fee} Now`}</>
                    )}
                  </Button>
                </motion.div>
              );
            })()}

            {/* Actions */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="mt-4 flex gap-3"
            >
              <Link href="/doctors" className="flex-1">
                <Button variant="outline" className="w-full rounded-xl">
                  Book another
                </Button>
              </Link>
              <Link href="/" className="flex-1">
                <Button className="w-full rounded-xl bg-brand hover:bg-brand/90">
                  Go home
                </Button>
              </Link>
            </motion.div>
          </motion.div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      <Navbar />

      <main className="container-main py-6 px-4 sm:py-8">
        <div className="mx-auto max-w-3xl">

          {/* Back link */}
          <button
            onClick={() => router.push("/doctors")}
            className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-subtext transition-colors hover:text-brand-dark"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to doctors
          </button>

          {/* Doctor summary card */}
          <div className="mb-6 rounded-2xl bg-white p-4 shadow-sm border border-gray-100/80 sm:p-5">
            <div className="flex items-center gap-4">
              {doctor.profile_photo ? (
                <img
                  src={doctor.profile_photo}
                  alt={doctor.full_name}
                  className="h-16 w-16 rounded-xl object-cover bg-gray-50"
                />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-blue-600 text-lg font-bold text-white">
                  {getInitials(doctor.full_name)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h1 className="text-lg font-bold text-brand-dark truncate">{doctor.full_name}</h1>
                {doctor.specialization && (
                  <p className="text-sm text-brand-subtext mt-0.5">{doctor.specialization}</p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {doctor.experience_years && (
                    <span className="flex items-center gap-1 text-xs text-brand-subtext">
                      <Briefcase className="h-3 w-3" /> {doctor.experience_years} yrs
                    </span>
                  )}
                  {doctor.city && (
                    <span className="flex items-center gap-1 text-xs text-brand-subtext">
                      <MapPin className="h-3 w-3" /> {doctor.city}
                    </span>
                  )}
                  {doctor.available_modes?.includes("online") && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                      <MonitorPlay className="h-2.5 w-2.5" /> Online
                    </span>
                  )}
                  {doctor.available_modes?.includes("walk_in") && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                      <User className="h-2.5 w-2.5" /> Walk-in
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Step indicator */}
          <div className="mb-6 flex items-center gap-0">
            {STEPS.map((s, i) => {
              const isActive = s.key === step;
              const isPast =
                (s.key === "slot" && (step === "details" || step === "review")) ||
                (s.key === "details" && step === "review");
              return (
                <div key={s.key} className="flex flex-1 items-center">
                  <div className="flex flex-1 flex-col items-center gap-1.5">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all ${
                        isPast
                          ? "bg-green-100 text-green-600"
                          : isActive
                          ? "bg-brand text-white shadow-md shadow-brand/20"
                          : "bg-gray-100 text-brand-subtext/40"
                      }`}
                    >
                      {isPast ? <Check className="h-4 w-4" /> : s.number}
                    </div>
                    <span
                      className={`text-[11px] font-medium transition-colors ${
                        isActive ? "text-brand-dark" : isPast ? "text-green-600" : "text-brand-subtext/40"
                      }`}
                    >
                      {s.label}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div
                      className={`h-px flex-1 -mt-5 ${
                        isPast ? "bg-green-200" : "bg-gray-200"
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Step content */}
          <AnimatePresence mode="wait">
            {/* ═══ STEP 1: Pick a slot ═══ */}
            {step === "slot" && (
              <motion.div
                key="slot"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
                className="space-y-5"
              >
                {/* Consultation mode toggle */}
                {doctor.available_modes && doctor.available_modes.length > 1 && (
                  <div className="rounded-2xl bg-white p-5 shadow-sm border border-gray-100/80">
                    <p className="text-sm font-medium text-brand-subtext mb-3">Consultation type</p>
                    <div className="flex gap-3">
                      {doctor.available_modes.includes("online") && (
                        <button
                          onClick={() => {
                            setMode("online");
                            setPaymentChoice("pay_now");
                          }}
                          className={`flex flex-1 items-center gap-3 rounded-xl border-2 p-3 sm:p-4 text-left transition-all ${
                            mode === "online"
                              ? "border-brand bg-brand/5 shadow-sm shadow-brand/10"
                              : "border-gray-200/60 bg-white hover:border-brand/30"
                          }`}
                        >
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                            <MonitorPlay className="h-5 w-5 text-brand" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-brand-dark">Online</p>
                            <p className="text-xs text-brand-subtext">Video consultation</p>
                          </div>
                          <p className="text-sm font-bold text-brand-dark shrink-0">
                            ₹{doctor.online_fee || 0}
                          </p>
                        </button>
                      )}
                      {doctor.available_modes.includes("walk_in") && (
                        <button
                          onClick={() => setMode("walk_in")}
                          className={`flex flex-1 items-center gap-3 rounded-xl border-2 p-3 sm:p-4 text-left transition-all ${
                            mode === "walk_in"
                              ? "border-brand bg-brand/5 shadow-sm shadow-brand/10"
                              : "border-gray-200/60 bg-white hover:border-brand/30"
                          }`}
                        >
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50">
                            <User className="h-5 w-5 text-emerald-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-brand-dark">Walk-in</p>
                            <p className="text-xs text-brand-subtext truncate">
                              {doctor.clinic_name || "Clinic visit"}
                            </p>
                          </div>
                          <p className="text-sm font-bold text-brand-dark shrink-0">
                            ₹{doctor.walkin_fee || 0}
                          </p>
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Date & time picker */}
                <div className="rounded-2xl bg-white p-5 shadow-sm border border-gray-100/80">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-medium text-brand-subtext">Choose date and time</p>
                    <div className="flex items-center gap-1.5 text-xs font-medium text-brand-dark">
                      <Calendar className="h-3.5 w-3.5 text-brand" />
                      {monthLabel}
                    </div>
                  </div>

                  <div className="h-px bg-gray-200/80 mb-4" />

                  {/* 7-day picker */}
                  <div className="flex gap-0 mb-5">
                    {dateOptions.map((date, idx) => {
                      const isSelected = selectedDate ? date.toDateString() === selectedDate.toDateString() : false;
                      const dayLabel = idx === 0
                        ? "Today"
                        : date.toLocaleDateString("en-US", { weekday: "short" });
                      return (
                        <button
                          key={date.toISOString()}
                          onClick={() => {
                            setSelectedDate(date);
                            setSelectedSlot(null);
                          }}
                          className="flex flex-1 flex-col items-center py-2 transition-all duration-200"
                        >
                          <span className={`text-[11px] mb-1 ${idx === 0 ? "font-semibold text-brand" : "text-brand-subtext"}`}>
                            {dayLabel}
                          </span>
                          <span
                            className={`flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold transition-all ${
                              isSelected
                                ? "bg-brand text-white shadow-md shadow-brand/20"
                                : "text-brand-dark hover:bg-gray-100"
                            }`}
                          >
                            {date.getDate()}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Time slots grouped */}
                  {slotsLoading ? (
                    <div className="flex flex-wrap gap-2">
                      {[1, 2, 3, 4, 5, 6].map((i) => (
                        <Skeleton key={i} className="h-9 w-16 rounded-full" />
                      ))}
                    </div>
                  ) : slots.length === 0 ? (
                    <div className="rounded-xl bg-gray-50 py-8 text-center">
                      <Clock className="mx-auto mb-2 h-5 w-5 text-brand-subtext/30" />
                      <p className="text-xs text-brand-subtext">No slots available for this date</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {groupSlotsByPeriod(slots).map(({ label, icon: PeriodIcon, items }) =>
                        items.length > 0 ? (
                          <div key={label}>
                            <div className="flex items-center gap-1.5 mb-2">
                              <PeriodIcon className="h-3.5 w-3.5 text-brand-subtext/50" />
                              <span className="text-[11px] font-semibold uppercase tracking-wider text-brand-subtext/60">
                                {label}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {items.map((slot) => {
                                const isSlotSelected = selectedSlot === slot;
                                return (
                                  <button
                                    key={slot}
                                    onClick={() => setSelectedSlot(slot)}
                                    className={`rounded-full px-4 py-2.5 text-xs font-medium transition-all duration-200 ${
                                      isSlotSelected
                                        ? "bg-brand text-white shadow-md shadow-brand/20"
                                        : "bg-gray-100 text-brand-subtext hover:bg-gray-200/80"
                                    }`}
                                  >
                                    {formatSlotTime(slot)}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ) : null
                      )}
                    </div>
                  )}
                </div>

                {/* Continue button */}
                <div className="sticky bottom-4 z-10">
                  <Button
                    onClick={() => goToStep("details")}
                    disabled={!canProceedToDetails}
                    className="h-12 w-full rounded-xl bg-brand text-sm font-semibold text-white shadow-[0_8px_24px_-8px_rgba(88,155,255,0.50)] hover:bg-brand/90 disabled:opacity-50 disabled:shadow-none"
                  >
                    {selectedSlot ? (
                      <span className="flex items-center gap-2">
                        Continue — {formatSlotTime(selectedSlot)}
                        <ArrowLeft className="h-4 w-4 rotate-180" />
                      </span>
                    ) : (
                      "Select a time slot to continue"
                    )}
                  </Button>
                </div>
              </motion.div>
            )}

            {/* ═══ STEP 2: Patient details ═══ */}
            {step === "details" && (
              <motion.div
                key="details"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
                className="space-y-5"
              >
                {/* Selected slot summary */}
                {selectedSlot && (
                  <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm border border-gray-100/80 text-sm text-brand-dark">
                    <Calendar className="h-4 w-4 text-brand shrink-0" />
                    <span className="font-medium">{formatBookingDate(selectedSlot)}</span>
                    <span className="text-gray-300">·</span>
                    <Clock className="h-4 w-4 text-brand shrink-0" />
                    <span className="font-medium">{formatSlotTime(selectedSlot)}</span>
                    <button
                      onClick={() => goToStep("slot")}
                      className="ml-auto text-xs font-semibold text-brand hover:text-brand-dark"
                    >
                      Change
                    </button>
                  </div>
                )}

                <div className="rounded-2xl bg-white p-5 shadow-sm border border-gray-100/80 sm:p-6">
                  <h2 className="text-base font-semibold text-brand-dark mb-4">Patient details</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-brand-dark">
                        Full name <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={patientName}
                        onChange={(e) => setPatientName(e.target.value)}
                        placeholder="Enter your full name"
                        autoFocus
                        className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-sm text-brand-dark placeholder:text-brand-subtext/40 focus:border-brand/40 focus:outline-none focus:ring-2 focus:ring-brand/10 transition-all"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-brand-dark">
                        Phone <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="tel"
                        value={patientPhone}
                        onChange={(e) => setPatientPhone(e.target.value)}
                        placeholder="+91 98765 43210"
                        className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-sm text-brand-dark placeholder:text-brand-subtext/40 focus:border-brand/40 focus:outline-none focus:ring-2 focus:ring-brand/10 transition-all"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-brand-dark">
                        Age <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="number"
                        value={patientAge}
                        onChange={(e) => setPatientAge(e.target.value)}
                        placeholder="Age"
                        min={1}
                        max={120}
                        className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-sm text-brand-dark placeholder:text-brand-subtext/40 focus:border-brand/40 focus:outline-none focus:ring-2 focus:ring-brand/10 transition-all"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-brand-dark">
                        Sex <span className="text-red-400">*</span>
                      </label>
                      <div className="flex gap-2">
                        {(["male", "female", "other"] as const).map((s) => (
                          <button
                            key={s}
                            onClick={() => setPatientSex(s)}
                            className={`flex-1 rounded-xl border-2 py-2.5 text-xs font-semibold capitalize transition-all ${
                              patientSex === s
                                ? "border-brand bg-brand/5 text-brand"
                                : "border-gray-200 bg-white text-brand-subtext hover:border-brand/30"
                            }`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="sm:col-span-2 space-y-1.5">
                      <label className="block text-xs font-semibold text-brand-dark">
                        Email <span className="text-brand-subtext/40 font-normal">(optional)</span>
                      </label>
                      <input
                        type="email"
                        value={patientEmail}
                        onChange={(e) => setPatientEmail(e.target.value)}
                        placeholder="your@email.com"
                        className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-sm text-brand-dark placeholder:text-brand-subtext/40 focus:border-brand/40 focus:outline-none focus:ring-2 focus:ring-brand/10 transition-all"
                      />
                    </div>
                  </div>
                </div>

                {/* Navigation buttons */}
                <div className="sticky bottom-4 z-10 flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => goToStep("slot")}
                    className="h-12 flex-1 rounded-xl text-sm font-semibold sm:flex-none sm:w-auto sm:px-6"
                  >
                    <ArrowLeft className="h-4 w-4 mr-1.5" />
                    Back
                  </Button>
                  <Button
                    onClick={() => goToStep("review")}
                    disabled={!canProceedToReview}
                    className="h-12 flex-[2] rounded-xl bg-brand text-sm font-semibold text-white shadow-[0_8px_24px_-8px_rgba(88,155,255,0.50)] hover:bg-brand/90 disabled:opacity-50 disabled:shadow-none"
                  >
                    Review booking
                    <ArrowLeft className="h-4 w-4 ml-1.5 rotate-180" />
                  </Button>
                </div>
              </motion.div>
            )}

            {/* ═══ STEP 3: Review & confirm ═══ */}
            {step === "review" && (
              <motion.div
                key="review"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
                className="space-y-5"
              >
                <div className="rounded-2xl bg-white shadow-sm border border-gray-100/80 overflow-hidden">
                  {/* Booking summary */}
                  <div className="p-5 sm:p-6 space-y-4">
                    <h2 className="text-base font-semibold text-brand-dark">Booking summary</h2>

                    <div className="space-y-3">
                      {/* Doctor */}
                      <div className="flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-3">
                        <Stethoscope className="h-4 w-4 text-brand shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs text-brand-subtext">Doctor</p>
                          <p className="text-sm font-semibold text-brand-dark truncate">{doctor.full_name}</p>
                        </div>
                      </div>

                      {/* Date & time */}
                      {selectedSlot && (
                        <div className="flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-3">
                          <Calendar className="h-4 w-4 text-brand shrink-0" />
                          <div>
                            <p className="text-xs text-brand-subtext">Date & time</p>
                            <p className="text-sm font-semibold text-brand-dark">
                              {formatBookingDate(selectedSlot)} · {formatSlotTime(selectedSlot)}
                            </p>
                          </div>
                          <button
                            onClick={() => goToStep("slot")}
                            className="ml-auto text-xs font-semibold text-brand hover:text-brand-dark"
                          >
                            Change
                          </button>
                        </div>
                      )}

                      {/* Mode */}
                      <div className="flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-3">
                        {mode === "online" ? (
                          <MonitorPlay className="h-4 w-4 text-brand shrink-0" />
                        ) : (
                          <User className="h-4 w-4 text-brand shrink-0" />
                        )}
                        <div>
                          <p className="text-xs text-brand-subtext">Consultation</p>
                          <p className="text-sm font-semibold text-brand-dark">
                            {mode === "online" ? "Online · Video call" : `Walk-in · ${doctor.clinic_name || "Clinic"}`}
                          </p>
                        </div>
                      </div>

                      {/* Patient */}
                      <div className="flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-3">
                        <User className="h-4 w-4 text-brand shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs text-brand-subtext">Patient</p>
                          <p className="text-sm font-semibold text-brand-dark truncate">
                            {patientName} · {patientAge} yrs · {patientSex}
                          </p>
                          <p className="text-xs text-brand-subtext truncate">{patientPhone}</p>
                        </div>
                        <button
                          onClick={() => goToStep("details")}
                          className="ml-auto text-xs font-semibold text-brand hover:text-brand-dark shrink-0"
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Payment section */}
                  <div className="border-t border-gray-100 p-5 sm:p-6 space-y-4">
                    {/* Payment choice for walk-in */}
                    {mode === "walk_in" && (
                      <div>
                        <p className="text-xs font-semibold text-brand-dark mb-2">Payment method</p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setPaymentChoice("pay_now")}
                            className={`flex flex-1 items-center justify-center gap-2 rounded-xl border-2 py-2.5 text-xs font-semibold transition-all ${
                              paymentChoice === "pay_now"
                                ? "border-brand bg-brand/5 text-brand"
                                : "border-gray-200 bg-white text-brand-subtext hover:border-brand/30"
                            }`}
                          >
                            <CreditCard className="h-3.5 w-3.5" />
                            Pay now
                          </button>
                          <button
                            onClick={() => setPaymentChoice("pay_at_clinic")}
                            className={`flex flex-1 items-center justify-center gap-2 rounded-xl border-2 py-2.5 text-xs font-semibold transition-all ${
                              paymentChoice === "pay_at_clinic"
                                ? "border-brand bg-brand/5 text-brand"
                                : "border-gray-200 bg-white text-brand-subtext hover:border-brand/30"
                            }`}
                          >
                            <Wallet className="h-3.5 w-3.5" />
                            Pay at clinic
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Total */}
                    <div className="flex items-center justify-between rounded-xl bg-brand-dark px-5 py-4">
                      <span className="text-sm font-medium text-white/70">Total</span>
                      <span className="text-xl font-bold text-white">₹{fee}</span>
                    </div>

                    {effectivePaymentChoice === "pay_now" && fee > 0 && (
                      <div className="flex items-center gap-2 rounded-xl border border-blue-200/50 bg-blue-50/60 px-3 py-2 text-xs text-blue-700">
                        <Shield className="h-4 w-4 shrink-0" />
                        <span>Secure payment via Razorpay. You&apos;ll be redirected after booking.</span>
                      </div>
                    )}

                    {bookMutation.isError && (
                      <div className="rounded-xl border border-red-200/50 bg-red-50/60 px-4 py-3 text-sm text-red-700">
                        {getApiError(bookMutation.error)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="sticky bottom-4 z-10 flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => goToStep("details")}
                    className="h-12 flex-1 rounded-xl text-sm font-semibold sm:flex-none sm:w-auto sm:px-6"
                  >
                    <ArrowLeft className="h-4 w-4 mr-1.5" />
                    Back
                  </Button>
                  <Button
                    onClick={() => bookMutation.mutate()}
                    disabled={bookMutation.isPending}
                    className="h-12 flex-[2] rounded-xl bg-brand text-sm font-semibold text-white shadow-[0_8px_24px_-8px_rgba(88,155,255,0.50)] hover:bg-brand/90"
                  >
                    {bookMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : effectivePaymentChoice === "pay_now" && fee > 0 ? (
                      <CreditCard className="mr-2 h-4 w-4" />
                    ) : (
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                    )}
                    {bookMutation.isPending
                      ? "Booking..."
                      : effectivePaymentChoice === "pay_now" && fee > 0
                        ? `Pay ₹${fee} & confirm`
                        : "Confirm booking"}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Cancellation note */}
          <p className="mt-4 text-center text-[11px] text-brand-subtext/50">
            Free cancellation up to 2 hours before the appointment.
          </p>
        </div>
      </main>
    </div>
  );
}
