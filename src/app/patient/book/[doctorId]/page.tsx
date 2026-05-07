"use client";

import { useState, useMemo } from "react";
import { useRouter, useSearchParams, useParams } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Loader2,
  MonitorPlay,
  Shield,
  Sparkles,
  User,
  Wallet,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

import { useEffect, useRef } from "react";

import api, { getApiError } from "@/lib/api";
import { beginPatientAppointmentPayment } from "@/lib/patient-payment";
import { usePatientAuth } from "@/stores/patient-auth";
import { notifyError, notifySuccess, notifyInfo } from "@/lib/notify";
import { formatDateLabel, formatSlotTime } from "@/lib/appointment-utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { AuthGuard } from "@/components/auth-guard";
import { PatientShell } from "@/components/patient/patient-shell";
import { Button } from "@/components/ui/button";
import { GlowingButton } from "@/components/ui/glowing-button";
import { Skeleton } from "@/components/loading";
import {
  DoctorInfoCard,
  SlotPicker,
} from "@/components/appointment";
import { BookingStepper } from "@/components/appointment/booking-stepper";
import { PostBookingConfirmation } from "@/components/appointment/post-booking-confirmation";
import type { PublicDoctor, BookingResponse } from "@/types/patient";

const fadeVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" as const } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.2 } },
};

type BookingStep = "select-date" | "select-mode" | "confirm" | "processing" | "verifying" | "failed" | "success";

const VERIFICATION_KEY = "hphomeo:v1:payment_verification";

interface VerificationState {
  version: number;
  appointmentId: string;
  bookingData: BookingResponse;
  startedAt: number;
  expiresAt: number;
}

function BookingContent() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const doctorId = params.doctorId as string;
  const followUpId = searchParams.get("followUp");
  const { patient } = usePatientAuth();
  const isMobile = useIsMobile();

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [mode, setMode] = useState<"online" | "walk_in">("online");
  const [paymentChoice, setPaymentChoice] = useState<"pay_now" | "pay_at_clinic">("pay_now");
  const [step, setStep] = useState<BookingStep>("select-date");
  const [processingMessage, setProcessingMessage] = useState("");
  const [bookedData, setBookedData] = useState<BookingResponse | null>(null);

  const { data: doctor, isLoading: doctorLoading } = useQuery({
    queryKey: ["public", "doctor", doctorId],
    queryFn: async () => {
      const { data } = await api.get<PublicDoctor>(`/public/doctors/${doctorId}`);
      return data;
    },
  });

  const profileIncomplete = !patient?.full_name || !patient?.age || !patient?.sex;
  const fee = mode === "online" ? doctor?.online_fee || 0 : doctor?.walkin_fee || 0;
  const isFollowUp = !!followUpId;
  const displayFee = isFollowUp ? 0 : fee;
  const effectivePaymentChoice = mode === "online" ? "pay_now" : paymentChoice;
  const needsPayment = displayFee > 0 && effectivePaymentChoice === "pay_now";

  const bookMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSlot) throw new Error("No slot selected");

      setStep("processing");
      setProcessingMessage("Creating your appointment...");

      const payload: Record<string, unknown> = {
        doctor_id: doctorId,
        scheduled_at: selectedSlot,
        mode,
        payment_choice: effectivePaymentChoice,
        appointment_type: followUpId ? "follow_up" : "new",
      };
      if (followUpId) payload.follow_up_of_appointment_id = followUpId;

      const { data: bookingData } = await api.post<BookingResponse>(
        "/patient/appointments/book",
        payload,
      );

      if (needsPayment && bookingData.status === "pending_payment") {
        setProcessingMessage("Preparing payment...");
        return new Promise<BookingResponse>((resolve, reject) => {
          beginPatientAppointmentPayment({
            appointmentId: bookingData.appointment_id,
            patientName: patient?.full_name,
            patientEmail: patient?.email,
            patientPhone: patient?.phone,
            description: `Consultation with ${doctor?.full_name || "Doctor"}`,
            onSuccess: () => {
              console.log("Payment success callback received from Razorpay.");
              resolve(bookingData);
            },
            onDismiss: () => {
              console.log("Razorpay checkout dismissed.");
              reject(new Error("PAYMENT_DISMISSED"));
            },
          })
            .then((orderData) => {
              if (orderData.message === "already_paid") {
                resolve(bookingData);
                return;
              }
              setProcessingMessage("Opening payment gateway...");
            })
            .catch(reject);
        });
      }

      return bookingData;
    },
    onSuccess: (data) => {
      setBookedData(data);
      if (needsPayment && data.status === "pending_payment") {
        setStep("verifying");
        localStorage.setItem(VERIFICATION_KEY, JSON.stringify({
          version: 1,
          appointmentId: data.appointment_id,
          bookingData: data,
          startedAt: Date.now(),
          expiresAt: Date.now() + 5 * 60 * 1000
        }));
      } else {
        setStep("success");
      }
    },
    onError: (error) => {
      setStep("confirm");
      if (error instanceof Error && error.message === "PAYMENT_DISMISSED") {
        notifyInfo("Payment not completed", "Your appointment is reserved. Complete payment from the appointments page.");
        router.push("/patient/appointments");
        return;
      }
      notifyError("Booking failed", getApiError(error));
    },
  });

  const stepLabels = ["Date & Time", "Consultation", "Confirm"];
  const stepOrder: BookingStep[] = ["select-date", "select-mode", "confirm"];
  const currentIdx = stepOrder.indexOf(step);

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
        const { data } = await api.get(`/patient/appointments/${parsed.appointmentId}`);

        const isPaid = data.status === "confirmed" && data.payment_status === "paid";
        const isFailed = data.payment_status === "failed" || data.payment_status === "refunded" || data.status === "cancelled";

        if (isPaid) {
          setBookedData(parsed.bookingData);
          setStep("success");
          localStorage.removeItem(VERIFICATION_KEY);
          return;
        }

        if (isFailed) {
          setBookedData(parsed.bookingData);
          setStep("failed");
          localStorage.removeItem(VERIFICATION_KEY);
          return;
        }

        // Still pending
        setBookedData(parsed.bookingData);
        setStep("verifying");
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
    if (step !== "verifying" || !bookedData) {
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
        const { data } = await api.get(`/patient/appointments/${bookedData.appointment_id}`, {
          signal: abortController.signal
        });

        const isPaid = data.status === "confirmed" && data.payment_status === "paid";
        const isFailed = data.payment_status === "failed" || data.payment_status === "refunded" || data.status === "cancelled";

        if (isPaid) {
          console.log("Payment verified successfully on backend.");
          setStep("success");
          localStorage.removeItem(VERIFICATION_KEY);
          pollingActiveRef.current = false;
          return;
        }

        if (isFailed) {
          console.error("Payment failed or cancelled during verification.");
          setStep("failed");
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
        setStep("failed");
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
  }, [step, bookedData]);

  const stepData = useMemo(() => {
    return stepLabels.map((label, i) => ({
      label,
      summary:
        i === 0 && selectedSlot
          ? `${formatDateLabel(selectedDate)}, ${formatSlotTime(selectedSlot)}`
          : i === 1 && currentIdx > 1
            ? `${mode === "online" ? "Online" : "Walk-in"} · ${displayFee === 0 ? "Free" : `₹${displayFee}`}`
            : undefined,
    }));
  }, [stepLabels, selectedSlot, selectedDate, mode, displayFee, currentIdx]);

  const showSidebar = !isMobile && step !== "processing" && step !== "success";

  return (
    <PatientShell
      title="Book Appointment"
      subtitle={doctor?.full_name || "Loading..."}
      headerRight={
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-1">
          <ChevronLeft className="h-3.5 w-3.5" />
          Back
        </Button>
      }
    >
      <div className="mx-auto max-w-4xl">
        {/* Profile warning */}
        {profileIncomplete && step !== "processing" && step !== "success" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-4 rounded-2xl border border-red-200/50 bg-red-50/60 p-4"
          >
            <p className="text-sm font-semibold text-red-700">Profile incomplete</p>
            <p className="mt-0.5 text-xs text-red-600">Please complete your profile (name, age, sex) before booking.</p>
            <Button size="sm" className="mt-2" onClick={() => router.push("/patient/profile")}>
              Complete Profile
            </Button>
          </motion.div>
        )}

        {isFollowUp && step !== "processing" && step !== "success" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mb-4 flex items-center gap-2 rounded-xl border border-purple-200/50 bg-purple-50/60 p-3"
          >
            <Sparkles className="h-4 w-4 text-purple-600" />
            <div>
              <p className="text-sm font-semibold text-purple-700">Follow-up Appointment (Free)</p>
              <p className="text-xs text-purple-600">This is a free follow-up for your previous consultation</p>
            </div>
          </motion.div>
        )}

        {/* Mobile: Doctor card + horizontal stepper */}
        {isMobile && step !== "processing" && step !== "success" && (
          <>
            {doctorLoading ? (
              <div className="mb-4 rounded-2xl border border-gray-200/60 bg-white p-4">
                <div className="flex gap-3">
                  <Skeleton className="h-10 w-10 rounded-xl" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                </div>
              </div>
            ) : doctor ? (
              <DoctorInfoCard
                doctor={{
                  name: doctor.full_name,
                  photo: doctor.profile_photo,
                  specialization: doctor.specialization,
                  city: doctor.city,
                  clinic_name: doctor.clinic_name,
                }}
                compact
                className="mb-4"
              />
            ) : null}
            <div className="mb-5">
              <BookingStepper steps={stepData} currentStep={currentIdx} />
            </div>
          </>
        )}

        <div className={showSidebar ? "flex gap-6" : ""}>
          {/* Desktop sidebar */}
          {showSidebar && (
            <aside className="w-60 shrink-0">
              <div className="sticky top-24 space-y-4">
                {doctorLoading ? (
                  <div className="rounded-2xl border border-gray-200/60 bg-white p-4">
                    <div className="flex gap-3">
                      <Skeleton className="h-14 w-14 rounded-2xl" />
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </div>
                  </div>
                ) : doctor ? (
                  <DoctorInfoCard
                    doctor={{
                      name: doctor.full_name,
                      photo: doctor.profile_photo,
                      specialization: doctor.specialization,
                      city: doctor.city,
                      clinic_name: doctor.clinic_name,
                    }}
                  />
                ) : null}

                <div className="rounded-2xl border border-gray-200/60 bg-white p-3">
                  <BookingStepper
                    steps={stepData}
                    currentStep={currentIdx}
                    onStepClick={(i) => {
                      if (i < currentIdx) setStep(stepOrder[i]);
                    }}
                  />
                </div>
              </div>
            </aside>
          )}

          {/* Main content */}
          <div className="min-w-0 flex-1">
            <AnimatePresence mode="wait">
              {/* Processing & Verifying */}
              {(step === "processing" || step === "verifying") && (
                <motion.div
                  key="processing"
                  variants={fadeVariants}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                  className="flex flex-col items-center rounded-2xl border border-gray-200/60 bg-white py-16 text-center"
                >
                  <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand/15 to-brand/5">
                    <Loader2 className="h-8 w-8 animate-spin text-brand" />
                  </div>
                  <h2 className="type-h3 mb-2">
                    {step === "verifying" ? "Verifying Payment..." : processingMessage}
                  </h2>
                  <p className="text-sm text-gray-500">
                    {step === "verifying"
                      ? "Please don't close this page. We are confirming your payment."
                      : "Please don't close this page"}
                  </p>
                </motion.div>
              )}

              {/* Failed */}
              {step === "failed" && (
                <motion.div
                  key="failed"
                  variants={fadeVariants}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                  className="flex flex-col items-center rounded-2xl border border-red-200 bg-white p-8 text-center"
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
                  <div className="mt-6 flex gap-3 w-full max-w-sm">
                    <Button
                      variant="outline"
                      onClick={() => router.push("/patient/appointments")}
                      className="w-full rounded-xl"
                    >
                      View Appointments
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* Success */}
              {step === "success" && bookedData && selectedSlot && (
                <motion.div key="success" variants={fadeVariants} initial="hidden" animate="show" exit="exit">
                  <PostBookingConfirmation
                    appointmentId={bookedData.appointment_id}
                    doctorName={doctor?.full_name || "Doctor"}
                    scheduledAt={selectedSlot}
                    mode={mode}
                    fee={displayFee}
                    appointmentType={bookedData.appointment_type as "new" | "follow_up"}
                    isFollowUp={isFollowUp}
                    paidOnline={needsPayment}
                  />
                </motion.div>
              )}

              {/* Step: Select Date & Slot */}
              {step === "select-date" && (
                <motion.div
                  key="select-date"
                  variants={fadeVariants}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                  className="rounded-2xl border border-gray-200/60 bg-white p-5"
                >
                  <h2 className="type-h3 mb-4">Select Date & Time</h2>

                  <SlotPicker
                    doctorId={doctorId}
                    selectedDate={selectedDate}
                    selectedSlot={selectedSlot}
                    onDateChange={(d) => { setSelectedDate(d); setSelectedSlot(null); }}
                    onSlotChange={setSelectedSlot}
                    variant="both"
                    groupByTimeOfDay
                  />

                  <div className="mt-5 flex justify-end">
                    <Button
                      disabled={!selectedSlot || profileIncomplete}
                      onClick={() => setStep("select-mode")}
                      className="gap-1 bg-gradient-to-r from-brand to-blue-600 shadow-lg shadow-brand/20"
                    >
                      Continue <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* Step: Select Mode */}
              {step === "select-mode" && (
                <motion.div
                  key="select-mode"
                  variants={fadeVariants}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                  className="rounded-2xl border border-gray-200/60 bg-white p-5"
                >
                  {isMobile && (
                    <button onClick={() => setStep("select-date")} className="mb-4 flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-900">
                      <ChevronLeft className="h-4 w-4" /> Back to date selection
                    </button>
                  )}

                  <h2 className="type-h3 mb-4">Consultation Type</h2>

                  <div className="space-y-3">
                    {doctor?.available_modes?.includes("online") && (
                      <motion.button
                        whileHover={{ scale: 1.01 }}
                        onClick={() => { setMode("online"); setPaymentChoice("pay_now"); }}
                        className={`flex w-full items-center gap-3 rounded-xl border-2 p-4 text-left transition-all ${
                          mode === "online"
                            ? "border-brand bg-brand/5 shadow-lg shadow-brand/10"
                            : "border-gray-200/60 bg-white hover:border-brand/30"
                        }`}
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand/15 to-brand/5 ring-1 ring-brand/10">
                          <MonitorPlay className="h-5 w-5 text-brand" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-gray-900">Online Consultation</p>
                          <p className="text-xs text-gray-500">Video call from home</p>
                        </div>
                        <p className="text-sm font-bold text-gray-900">{isFollowUp ? "Free" : `₹${doctor.online_fee || 0}`}</p>
                        {mode === "online" && <Check className="h-5 w-5 text-brand" />}
                      </motion.button>
                    )}

                    {doctor?.available_modes?.includes("walk_in") && (
                      <motion.button
                        whileHover={{ scale: 1.01 }}
                        onClick={() => setMode("walk_in")}
                        className={`flex w-full items-center gap-3 rounded-xl border-2 p-4 text-left transition-all ${
                          mode === "walk_in"
                            ? "border-brand bg-brand/5 shadow-lg shadow-brand/10"
                            : "border-gray-200/60 bg-white hover:border-brand/30"
                        }`}
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-100 to-teal-100">
                          <User className="h-5 w-5 text-emerald-600" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-gray-900">Walk-in Visit</p>
                          <p className="text-xs text-gray-500">Visit at {doctor.clinic_name || "the clinic"}</p>
                        </div>
                        <p className="text-sm font-bold text-gray-900">{isFollowUp ? "Free" : `₹${doctor.walkin_fee || 0}`}</p>
                        {mode === "walk_in" && <Check className="h-5 w-5 text-emerald-600" />}
                      </motion.button>
                    )}
                  </div>

                  {mode === "walk_in" && !isFollowUp && (
                    <div className="mt-4">
                      <p className="eyebrow mb-2">Payment Method</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setPaymentChoice("pay_now")}
                          className={`flex flex-1 items-center gap-2 rounded-xl border-2 p-3 transition-all ${
                            paymentChoice === "pay_now"
                              ? "border-brand bg-brand/5 shadow-lg shadow-brand/10"
                              : "border-gray-200/60 bg-white hover:border-brand/30"
                          }`}
                        >
                          <CreditCard className="h-4 w-4 text-brand" />
                          <span className="text-xs font-semibold">Pay Now</span>
                        </button>
                        <button
                          onClick={() => setPaymentChoice("pay_at_clinic")}
                          className={`flex flex-1 items-center gap-2 rounded-xl border-2 p-3 transition-all ${
                            paymentChoice === "pay_at_clinic"
                              ? "border-brand bg-brand/5 shadow-lg shadow-brand/10"
                              : "border-gray-200/60 bg-white hover:border-brand/30"
                          }`}
                        >
                          <Wallet className="h-4 w-4 text-brand" />
                          <span className="text-xs font-semibold">Pay at Clinic</span>
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="mt-5 flex justify-end">
                    <Button onClick={() => setStep("confirm")} className="gap-1 bg-gradient-to-r from-brand to-blue-600 shadow-lg shadow-brand/20">
                      Review Booking <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* Step: Confirm */}
              {step === "confirm" && (
                <motion.div
                  key="confirm"
                  variants={fadeVariants}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                  className="rounded-2xl border border-gray-200/60 bg-white p-5"
                >
                  {isMobile && (
                    <button onClick={() => setStep("select-mode")} className="mb-4 flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-900">
                      <ChevronLeft className="h-4 w-4" /> Back
                    </button>
                  )}

                  <h2 className="type-h3 mb-4">Confirm Your Booking</h2>

                  <div className="space-y-3 rounded-xl bg-gray-50 p-4 ring-1 ring-gray-100">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">Doctor</span>
                      <span className="text-sm font-semibold text-gray-900">{doctor?.full_name}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">Date</span>
                      <span className="text-sm font-semibold text-gray-900">{selectedSlot ? formatDateLabel(new Date(selectedSlot)) : "—"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">Time</span>
                      <span className="text-sm font-semibold text-gray-900">{selectedSlot ? formatSlotTime(selectedSlot) : "—"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">Mode</span>
                      <span className="text-sm font-semibold capitalize text-gray-900">{mode === "online" ? "Online (Video Call)" : "Walk-in Visit"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">Payment</span>
                      <span className="text-sm font-semibold text-gray-900">{displayFee === 0 ? "Free" : effectivePaymentChoice === "pay_now" ? "Pay Online" : "Pay at Clinic"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">Type</span>
                      <span className="text-sm font-semibold text-gray-900">{isFollowUp ? "Follow-up" : "New Consultation"}</span>
                    </div>
                    <div className="border-t border-gray-100 pt-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-gray-900">Total</span>
                        <span className="type-ui-metric bg-gradient-to-r from-brand to-blue-600 bg-clip-text text-transparent">
                          {displayFee === 0 ? "Free" : `₹${displayFee}`}
                        </span>
                      </div>
                    </div>
                  </div>

                  {needsPayment && (
                    <div className="mt-3 flex items-center gap-2 rounded-xl border border-blue-200/50 bg-blue-50/60 px-3 py-2.5 text-xs text-blue-700">
                      <Shield className="h-4 w-4 shrink-0" />
                      <span>Secure payment via Razorpay. You&apos;ll be redirected to complete payment.</span>
                    </div>
                  )}

                  <GlowingButton
                    onClick={() => bookMutation.mutate()}
                    disabled={bookMutation.isPending || profileIncomplete}
                    className="mt-5 h-12 w-full text-base font-semibold"
                    glowColor={needsPayment ? "#589BFF" : "#22C55E"}
                  >
                    {bookMutation.isPending ? (
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    ) : needsPayment ? (
                      <CreditCard className="mr-2 h-5 w-5" />
                    ) : (
                      <CheckCircle2 className="mr-2 h-5 w-5" />
                    )}
                    {needsPayment ? `Pay ₹${displayFee} & Confirm` : "Confirm Booking"}
                  </GlowingButton>

                  <p className="mt-3 text-center text-[11px] text-gray-500/60">
                    Free cancellation up to 2 hours before the appointment.
                    {needsPayment && " Full refund will be processed if cancelled within the allowed window."}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </PatientShell>
  );
}

export default function PatientBookPage() {
  return (
    <AuthGuard role="patient">
      <BookingContent />
    </AuthGuard>
  );
}
