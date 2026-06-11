"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { format, parseISO } from "date-fns";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  Loader2,
  Phone,
  User,
  Video,
  FileText,
  Receipt as ReceiptIcon,
} from "lucide-react";

import { fetchAndOpenPdf } from "@/lib/pdf";
import api from "@/lib/api";
import { hapticTap } from "@/lib/haptics";
import { cn, getInitials } from "@/lib/utils";
import { AuthGuard } from "@/components/auth-guard";
import { DoctorShell } from "@/components/doctor/doctor-shell";
import { StatusBadge } from "@/components/doctor/ui";
import { ConsultationCallPanel } from "@/components/doctor/consultation-call-panel";
import { AppointmentStatusBadge } from "@/components/appointment/appointment-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  DoctorAppointment,
  DoctorAppointmentDetail,
} from "@/types/doctor";
import type { Receipt } from "@/types/receipt";

// Context & Sections
import {
  PrescriptionFormProvider,
  usePrescriptionForm,
} from "@/components/doctor/appointment-detail/PrescriptionFormContext";
import { OverviewSection } from "@/components/doctor/appointment-detail/OverviewSection";
import { ConsultationSection } from "@/components/doctor/appointment-detail/ConsultationSection";
import { PrescriptionSection } from "@/components/doctor/appointment-detail/PrescriptionSection";
import { CompleteSection } from "@/components/doctor/appointment-detail/CompleteSection";
import { ReceiptSection } from "@/components/doctor/appointment-detail/ReceiptSection";
import { ErrorBoundary } from "@/components/ui/error-boundary";

type StepKey =
  | "overview"
  | "consultation"
  | "prescription"
  | "complete"
  | "receipt";

interface StepConfig {
  key: StepKey;
  label: string;
  icon: typeof User;
}

const STEPS: StepConfig[] = [
  { key: "overview", label: "Patient Info", icon: User },
  { key: "consultation", label: "Consultation", icon: Video },
  { key: "prescription", label: "Prescription", icon: FileText },
  { key: "complete", label: "Review & Complete", icon: CheckCircle2 },
  { key: "receipt", label: "Receipt", icon: ReceiptIcon },
];

export default function AppointmentDetailPage() {
  return (
    <AuthGuard role="doctor">
      <DetailPageWrapper />
    </AuthGuard>
  );
}

function DetailPageWrapper() {
  const params = useParams();
  const appointmentId = params.id as string;

  const { data: appointment, isLoading: appointmentLoading } = useQuery({
    queryKey: ["doctor-appointment-detail", appointmentId],
    queryFn: async () => {
      const { data } = await api.get<DoctorAppointmentDetail>(
        `/doctor/appointments/${appointmentId}`,
      );
      return data;
    },
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });

  if (appointmentLoading || !appointment) {
    return (
      <DoctorShell title="Appointment" subtitle="Loading...">
        <div className="flex items-center justify-center py-32">
          <Loader2 className="h-8 w-8 animate-spin text-brand" />
        </div>
      </DoctorShell>
    );
  }

  return (
    <PrescriptionFormProvider
      appointmentId={appointmentId}
      appointment={appointment}
    >
      <DetailContent appointment={appointment} appointmentId={appointmentId} />
    </PrescriptionFormProvider>
  );
}

function DetailContent({
  appointment: apt,
  appointmentId,
}: {
  appointment: DoctorAppointmentDetail;
  appointmentId: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const initialStep = (searchParams.get("step") as StepKey) || "overview";
  const [activeStep, setActiveStep] = useState<StepKey>(initialStep);
  const [completionCelebration, setCompletionCelebration] = useState(false);

  const { isFinalized, hasDraft, hasUnsavedChanges, autoSaveStatus, isTyping } =
    usePrescriptionForm();

  // Dynamic header blur on typing
  const headerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!headerRef.current) return;
    if (isTyping) {
      headerRef.current.classList.remove("bg-white/80", "backdrop-blur-lg");
      headerRef.current.classList.add("bg-white");
    } else {
      headerRef.current.classList.add("bg-white/80", "backdrop-blur-lg");
      headerRef.current.classList.remove("bg-white");
    }
  }, [isTyping]);

  const [keyboardSpacerHeight, setKeyboardSpacerHeight] = useState(0);
  const lastSpacerHeightRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;
    const vv = window.visualViewport;

    // Track max height to infer keyboard
    let maxHeight = vv.height;

    const handleResize = () => {
      if (vv.height > maxHeight) maxHeight = vv.height;
      const keyboardHeight = Math.max(0, maxHeight - vv.height - 10);

      const newSpacerHeight = keyboardHeight > 100 ? keyboardHeight : 0;
      if (Math.abs(newSpacerHeight - lastSpacerHeightRef.current) > 50) {
        lastSpacerHeightRef.current = newSpacerHeight;
        setKeyboardSpacerHeight(newSpacerHeight);
      }
    };

    vv.addEventListener("resize", handleResize);
    return () => vv.removeEventListener("resize", handleResize);
  }, []);

  /* ── queries ───────────────────────────────────────────────────── */

  const { data: receiptData } = useQuery({
    queryKey: ["doctor-appointment-receipt", appointmentId],
    queryFn: async () => {
      const { data } = await api.get<{
        exists: boolean;
        receipt: Receipt | null;
      }>(`/doctor/appointments/${appointmentId}/receipt`);
      return data.receipt;
    },
    enabled: activeStep === "receipt" || activeStep === "complete",
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Patient history — other appointments for same patient
  const patientId = apt.patient.id;
  const { data: patientHistory = [] } = useQuery({
    queryKey: ["doctor-patient-history", patientId],
    queryFn: async () => {
      const { data } = await api.get<{ appointments: DoctorAppointment[] }>(
        "/doctor/appointments/range",
        {
          params: {
            from: "2026-03-01",
            to: format(new Date(), "yyyy-MM-dd"),
            patient_id: patientId,
            limit: 6,
          },
        },
      );
      return data.appointments
        .filter((a) => a.appointment_id !== appointmentId)
        .sort(
          (a, b) =>
            new Date(b.scheduled_at).getTime() -
            new Date(a.scheduled_at).getTime(),
        )
        .slice(0, 5);
    },
    enabled: !!patientId,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const canStartConsultation =
    apt.mode === "online" && apt.video_enabled && apt.status === "confirmed";

  const canComplete =
    apt.status === "confirmed" &&
    (isFinalized || apt.prescription_status === "final");

  /* ── stepper completion state ──────────────────────────────────── */

  const stepState = useMemo(() => {
    const overview = "completed" as const;
    const consultation =
      apt.status === "completed" || isFinalized
        ? "completed"
        : canStartConsultation
          ? "active"
          : "upcoming";
    const prescriptionState = isFinalized
      ? "completed"
      : ["confirmed", "completed"].includes(apt.status)
        ? "active"
        : "upcoming";
    const complete =
      apt.status === "completed"
        ? "completed"
        : canComplete
          ? "active"
          : "upcoming";
    const receipt = receiptData
      ? "completed"
      : apt.status === "completed"
        ? "active"
        : "upcoming";

    return {
      overview,
      consultation,
      prescription: prescriptionState,
      complete,
      receipt,
    };
  }, [apt, isFinalized, canStartConsultation, canComplete, receiptData]);

  /* ── mutations ─────────────────────────────────────────────────── */

  const completeMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/doctor/appointments/${appointmentId}/complete`);
    },
    onSuccess: async () => {
      setCompletionCelebration(true);
      queryClient.invalidateQueries({
        queryKey: ["doctor-appointment-detail", appointmentId],
      });
      queryClient.invalidateQueries({ queryKey: ["doctor-stats"] });
      queryClient.invalidateQueries({
        predicate: (q) => q.queryKey[0] === "doctor-appointments-range",
      });
    },
  });

  const initials = getInitials(apt.patient.full_name);

  return (
    <DoctorShell
      title="Appointment"
      subtitle={`${apt.patient.full_name} · ${format(parseISO(apt.scheduled_at), "dd MMM yyyy, hh:mm a")}`}
    >
      {/* Completion celebration overlay */}
      <AnimatePresence>
        {completionCelebration && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: "spring", damping: 20, stiffness: 300 }}
              className="flex flex-col items-center rounded-3xl border border-border/60 bg-white p-10 shadow-2xl"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring", damping: 15 }}
                className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100"
              >
                <CheckCircle2 className="h-10 w-10 text-emerald-600" />
              </motion.div>
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="mt-5 text-xl font-bold text-brand-dark"
              >
                Appointment Completed
              </motion.p>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="mt-2 text-sm text-brand-subtext"
              >
                {apt.patient.full_name}&apos;s consultation has been closed.
              </motion.p>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7 }}
              >
                <Button
                  className="mt-6 rounded-xl"
                  onClick={() => {
                    setCompletionCelebration(false);
                    router.push("/doctor/appointments");
                  }}
                >
                  Back to Appointments
                </Button>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-0">
        {/* ─── Back button + compact header ────────────────────── */}
        <div
          ref={headerRef}
          style={{ top: "calc(var(--doctor-header-height, 64px) - 1px)" }}
          className="sticky z-30 -mx-4 border-b border-border/10 bg-white/80 px-4 py-3 backdrop-blur-lg sm:-mx-5 sm:px-5 sm:py-4 lg:-mx-6 lg:px-6 transition-all duration-200"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            {/* Row 1: Back + avatar + name + badges */}
            <div className="flex min-w-0 items-center gap-2 sm:gap-4">
              <Button
                variant="ghost"
                size="icon-sm"
                className="shrink-0 rounded-xl"
                onClick={() => router.push("/doctor/appointments")}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand/20 to-brand/5 text-xs font-bold text-brand sm:flex">
                  {initials}
                </div>
                <div className="min-w-0">
                  <h1 className="truncate text-sm font-semibold text-brand-dark sm:text-base">
                    {apt.patient.full_name}
                  </h1>
                  <div className="flex flex-wrap items-center gap-1">
                    <AppointmentStatusBadge
                      status={
                        apt.status as
                          | "confirmed"
                          | "completed"
                          | "cancelled"
                          | "no_show"
                      }
                      className="rounded-full"
                    />
                    <StatusBadge
                      variant={apt.mode === "online" ? "online" : "walk_in"}
                      className="rounded-full"
                      size="xs"
                    />
                    {isFinalized && (
                      <StatusBadge
                        variant="final"
                        className="rounded-full"
                        size="xs"
                      />
                    )}
                    {hasDraft && !isFinalized && (
                      <StatusBadge
                        variant="draft"
                        className="rounded-full"
                        size="xs"
                        label="Rx Draft"
                      />
                    )}
                    {hasUnsavedChanges && (
                      <Badge
                        className="rounded-full bg-amber-100 text-amber-700 shadow-none"
                        variant="secondary"
                      >
                        Unsaved
                      </Badge>
                    )}
                    {autoSaveStatus === "saving" && (
                      <span className="flex items-center gap-1 text-[10px] text-brand-subtext">
                        <Loader2 className="h-3 w-3 animate-spin" /> Saving...
                      </span>
                    )}
                    {autoSaveStatus === "saved" && (
                      <span className="flex items-center gap-1 text-[10px] text-emerald-600">
                        <Check className="h-3 w-3" /> Saved
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Row 2: Primary action buttons — grid on mobile for full-width tappable targets */}
            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-2">
              {apt.call_status === "waiting" && apt.mode === "online" && (
                <Button
                  className="w-full rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 sm:w-auto"
                  onClick={() => router.push(`/doctor/call/${appointmentId}`)}
                >
                  <Phone className="h-4 w-4" />
                  Join Call
                </Button>
              )}
              {canComplete && (
                <Button
                  className="w-full rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 sm:w-auto"
                  onClick={() => {
                    hapticTap();
                    setActiveStep("complete");
                  }}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Complete
                </Button>
              )}
              {isFinalized && (
                <Button
                  variant="brand"
                  className="w-full rounded-xl sm:w-auto"
                  onClick={() => {
                    fetchAndOpenPdf(
                      `/doctor/appointments/${appointmentId}/prescription/pdf/view`,
                    );
                  }}
                >
                  <Eye className="h-4 w-4" />
                  View Rx PDF
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* ─── Main layout: sidebar stepper + content ──────────── */}
        <div className="mt-4 flex flex-col gap-4 lg:flex-row sm:mt-6 sm:gap-6">
          {/* Vertical stepper sidebar */}
          <div className="hidden w-56 shrink-0 lg:block">
            <nav
              role="tablist"
              aria-label="Appointment steps"
              style={{ top: "calc(var(--doctor-header-height, 64px) + 24px)" }}
              className="sticky space-y-1"
            >
              {STEPS.map((step) => {
                const state = stepState[step.key];
                const isActive = activeStep === step.key;
                const Icon = step.icon;
                return (
                  <button
                    key={step.key}
                    id={`step-${step.key}`}
                    role="tab"
                    aria-selected={isActive}
                    aria-controls={`steppanel-${step.key}`}
                    type="button"
                    onClick={() => setActiveStep(step.key)}
                    className={cn(
                      "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all",
                      isActive
                        ? "bg-brand/10 text-brand"
                        : "text-brand-subtext hover:bg-brand-bg hover:text-brand-dark",
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                        isActive
                          ? "bg-brand text-white"
                          : state === "completed"
                            ? "bg-emerald-100 text-emerald-600"
                            : "bg-brand-bg text-brand-subtext",
                      )}
                    >
                      {state === "completed" && !isActive ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Icon className="h-4 w-4" />
                      )}
                    </div>
                    <span className="text-sm font-medium">{step.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Mobile step selector — snap scroll with native-like feel */}
          <div className="relative mb-3 lg:hidden">
            <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-white to-transparent z-10 animate-fade-in" />
            <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white to-transparent z-10 animate-fade-in" />
            <div className="w-full overflow-x-auto overscroll-x-contain scrollbar-hide snap-x snap-mandatory">
              <div
                role="tablist"
                aria-label="Appointment steps mobile"
                className="flex gap-0.5 rounded-2xl border border-border/60 bg-white p-1"
              >
                {STEPS.map((step) => {
                  const Icon = step.icon;
                  const isActive = activeStep === step.key;
                  const state = stepState[step.key];
                  return (
                    <button
                      key={step.key}
                      id={`step-mobile-${step.key}`}
                      role="tab"
                      aria-selected={isActive}
                      aria-controls={`steppanel-${step.key}`}
                      type="button"
                      onClick={() => {
                        hapticTap();
                        setActiveStep(step.key);
                      }}
                      className={cn(
                        "flex shrink-0 snap-start items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-[11px] font-medium transition-all",
                        isActive
                          ? "bg-brand/10 text-brand shadow-sm"
                          : "text-brand-subtext active:bg-brand-bg",
                      )}
                    >
                      {state === "completed" && !isActive ? (
                        <Check className="h-3 w-3 text-emerald-500" />
                      ) : (
                        <Icon className="h-3 w-3" />
                      )}
                      {step.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Content area — extra bottom padding on mobile for keyboard safety */}
          <div className="min-w-0 flex-1 pb-24 sm:pb-12">
            {/* Persistent call panel — lives outside AnimatePresence so it never unmounts on tab switch */}
            {apt.mode === "online" && (
              <ConsultationCallPanel
                appointmentId={appointmentId}
                appointment={apt}
                minimized={activeStep !== "consultation"}
                onMaximize={() => {
                  hapticTap();
                  setActiveStep("consultation");
                }}
                onMinimize={() => {
                  hapticTap();
                  setActiveStep("overview");
                }}
              />
            )}

            <AnimatePresence mode="wait">
              <motion.div
                key={activeStep}
                role="tabpanel"
                id={`steppanel-${activeStep}`}
                aria-labelledby={`step-${activeStep}`}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.2 }}
              >
                {activeStep === "overview" && (
                  <OverviewSection
                    appointment={apt}
                    patientHistory={patientHistory}
                  />
                )}
                {activeStep === "consultation" && (
                  <ConsultationSection
                    appointment={apt}
                    appointmentId={appointmentId}
                    canStart={!!canStartConsultation}
                    onOpenPrescription={() => {
                      hapticTap();
                      setActiveStep("prescription");
                    }}
                    callPanelRenderedOutside
                  />
                )}
                {activeStep === "prescription" && (
                  <ErrorBoundary>
                    <PrescriptionSection appointment={apt} />
                  </ErrorBoundary>
                )}
                {activeStep === "complete" && (
                  <CompleteSection
                    appointment={apt}
                    canComplete={!!canComplete}
                    isFinalized={isFinalized}
                    completePending={completeMutation.isPending}
                    onComplete={() => completeMutation.mutate()}
                  />
                )}
                {activeStep === "receipt" && (
                  <ReceiptSection
                    appointmentId={appointmentId}
                    receipt={receiptData ?? null}
                  />
                )}
              </motion.div>
            </AnimatePresence>

            {/* Dynamic Keyboard & PiP Spacer */}
            <div
              style={{
                height:
                  keyboardSpacerHeight > 0
                    ? keyboardSpacerHeight +
                      (apt.mode === "online" && activeStep !== "consultation"
                        ? 160
                        : 0)
                    : 0,
              }}
              className="w-full transition-all duration-150"
            />
          </div>
        </div>
      </div>
    </DoctorShell>
  );
}
