"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { format, parseISO } from "date-fns";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Copy,
  CreditCard,
  Download,
  Eye,
  FileText,
  LayoutTemplate,
  Loader2,
  MonitorPlay,
  MapPin,
  Phone,
  Plus,
  Receipt as ReceiptIcon,
  Save,
  Sparkles,
  Star,
  Trash2,
  User,
  Video,
} from "lucide-react";

import { openPdfBlob, fetchAndOpenPdf } from "@/lib/pdf";
import api from "@/lib/api";
import { notifyApiError, notifyError, notifyInfo, notifySuccess } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { AuthGuard } from "@/components/auth-guard";
import { DoctorShell } from "@/components/doctor/doctor-shell";
import { StatusBadge } from "@/components/doctor/ui";
import { ConsultationCallPanel } from "@/components/doctor/consultation-call-panel";
import { AppointmentTimeline } from "@/components/appointment/appointment-timeline";
import { AppointmentStatusBadge } from "@/components/appointment/appointment-status-badge";
import { StarRating } from "@/components/appointment/star-rating";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import type {
  DoctorAppointment,
  DoctorAppointmentDetail,
  Prescription,
  PrescriptionPayload,
  PrescriptionTemplate,
  RxItem,
} from "@/types/doctor";
import type { Receipt } from "@/types/receipt";

/* ─── prescription helpers ──────────────────────────────────────── */

const EMPTY_RX_ITEM: RxItem = {
  name: "",
  dosage: "",
  frequency: "",
  duration: "",
  instructions: "",
};

type PrescriptionResponse = {
  exists: boolean;
  prescription: Prescription | null;
};

function blankToUndefined(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeItem(item?: RxItem | null): RxItem {
  return {
    name: item?.name ?? "",
    dosage: item?.dosage ?? "",
    frequency: item?.frequency ?? "",
    duration: item?.duration ?? "",
    instructions: item?.instructions ?? "",
  };
}

function createEmptyPayload(): PrescriptionPayload {
  return {
    chief_complaints: "",
    diagnosis: "",
    advice: "",
    items: [{ ...EMPTY_RX_ITEM }],
  };
}

function normalizePayload(
  payload?: Partial<PrescriptionPayload> | null,
): PrescriptionPayload {
  const items = payload?.items?.length
    ? payload.items.map(normalizeItem)
    : [{ ...EMPTY_RX_ITEM }];
  return {
    chief_complaints: payload?.chief_complaints ?? "",
    diagnosis: payload?.diagnosis ?? "",
    advice: payload?.advice ?? "",
    items,
  };
}

function prescriptionToPayload(
  prescription?: Prescription | null,
): PrescriptionPayload {
  if (!prescription) return createEmptyPayload();
  return normalizePayload({
    chief_complaints: prescription.chief_complaints,
    diagnosis: prescription.diagnosis,
    advice: prescription.advice,
    items: prescription.items,
  });
}

function toComparablePayload(payload: PrescriptionPayload) {
  return {
    chief_complaints: payload.chief_complaints?.trim() ?? "",
    diagnosis: payload.diagnosis?.trim() ?? "",
    advice: payload.advice?.trim() ?? "",
    items: payload.items
      .map((item) => ({
        name: item.name?.trim() ?? "",
        dosage: item.dosage?.trim() ?? "",
        frequency: item.frequency?.trim() ?? "",
        duration: item.duration?.trim() ?? "",
        instructions: item.instructions?.trim() ?? "",
      }))
      .filter((item) => Object.values(item).some(Boolean)),
  };
}

function preparePayloadForApi(
  payload: PrescriptionPayload,
): PrescriptionPayload {
  return {
    chief_complaints: blankToUndefined(payload.chief_complaints),
    diagnosis: blankToUndefined(payload.diagnosis),
    advice: blankToUndefined(payload.advice),
    items: payload.items
      .map((item) => ({
        name: item.name.trim(),
        dosage: blankToUndefined(item.dosage),
        frequency: blankToUndefined(item.frequency),
        duration: blankToUndefined(item.duration),
        instructions: blankToUndefined(item.instructions),
      }))
      .filter((item) => item.name),
  };
}

function hasMeaningfulPrescription(payload: PrescriptionPayload) {
  const comparable = toComparablePayload(payload);
  return (
    Boolean(comparable.chief_complaints) ||
    Boolean(comparable.diagnosis) ||
    Boolean(comparable.advice) ||
    comparable.items.length > 0
  );
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return format(parseISO(value), "dd MMM yyyy, hh:mm a");
}

function formatDateOnly(value?: string | null) {
  if (!value) return "-";
  return format(parseISO(value), "dd MMM yyyy");
}

/* ─── stepper types ─────────────────────────────────────────────── */

type StepKey = "overview" | "consultation" | "prescription" | "complete" | "receipt";

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

/* ─── page wrapper ──────────────────────────────────────────────── */

export default function AppointmentDetailPage() {
  return (
    <AuthGuard role="doctor">
      <DetailContent />
    </AuthGuard>
  );
}

/* ─── main content ──────────────────────────────────────────────── */

function DetailContent() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const appointmentId = params.id as string;

  const [activeStep, setActiveStep] = useState<StepKey>("overview");
  const [draftPayload, setDraftPayload] = useState<PrescriptionPayload | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [saveTemplateDialogOpen, setSaveTemplateDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [completionCelebration, setCompletionCelebration] = useState(false);

  // Auto-save timer ref
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  /* ── queries ───────────────────────────────────────────────────── */

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

  // Defer prescription fetch — not needed until doctor opens prescription/consultation tab
  const needsPrescription = activeStep === "prescription" || activeStep === "consultation" || activeStep === "complete";
  const { data: prescriptionData, isLoading: prescriptionLoading } = useQuery({
    queryKey: ["doctor-appointment-prescription", appointmentId],
    queryFn: async () => {
      const { data } = await api.get<PrescriptionResponse>(
        `/doctor/appointments/${appointmentId}/prescription`,
      );
      return data;
    },
    enabled: needsPrescription,
    refetchOnWindowFocus: false,
  });

  // Defer templates fetch — only needed on prescription tab
  const { data: templates = [] } = useQuery({
    queryKey: ["prescription-templates"],
    queryFn: async () => {
      const { data } = await api.get<{ items: PrescriptionTemplate[] }>(
        "/doctor/prescription-templates",
      );
      return data.items;
    },
    enabled: activeStep === "prescription",
    refetchOnWindowFocus: false,
  });

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
  const patientId = appointment?.patient?.id;
  const { data: patientHistory } = useQuery({
    queryKey: ["doctor-patient-history", patientId],
    queryFn: async () => {
      const { data } = await api.get<{ appointments: DoctorAppointment[] }>(
        "/doctor/appointments/range",
        { params: { from: "2020-01-01", to: format(new Date(), "yyyy-MM-dd"), patient_id: patientId } },
      );
      return data.appointments
        .filter((a) => a.appointment_id !== appointmentId)
        .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())
        .slice(0, 5);
    },
    enabled: !!patientId,
    retry: false,
    refetchOnWindowFocus: false,
  });

  /* ── derived state ─────────────────────────────────────────────── */

  const apt = appointment;
  const prescription = prescriptionData?.prescription ?? null;
  const prescriptionExists = Boolean(prescriptionData?.exists);

  const serverPayload = useMemo(
    () => prescriptionToPayload(prescriptionData?.prescription),
    [prescriptionData?.prescription],
  );
  const payload = draftPayload ?? serverPayload;
  const baseline = serverPayload;
  const isFinalized = prescription?.status === "final" && !prescription?.is_draft;
  const hasDraft = Boolean(prescription && prescription.is_draft);
  const canManagePrescription = apt
    ? ["confirmed", "completed"].includes(apt.status)
    : false;
  const hasUnsavedChanges =
    !isFinalized &&
    JSON.stringify(toComparablePayload(payload)) !==
      JSON.stringify(toComparablePayload(baseline));

  const canStartConsultation =
    apt?.mode === "online" && apt?.video_enabled && apt?.status === "confirmed";

  const canComplete =
    apt?.status === "confirmed" &&
    (prescription?.status === "final" || apt?.prescription_status === "final");

  /* ── stepper completion state ──────────────────────────────────── */

  const stepState = useMemo(() => {
    if (!apt)
      return {
        overview: "upcoming" as const,
        consultation: "upcoming" as const,
        prescription: "upcoming" as const,
        complete: "upcoming" as const,
        receipt: "upcoming" as const,
      };

    const overview: "completed" | "active" | "upcoming" = "completed"; // always viewable
    const consultation: "completed" | "active" | "upcoming" =
      apt.status === "completed" || isFinalized ? "completed" : canStartConsultation ? "active" : "upcoming";
    const prescriptionState: "completed" | "active" | "upcoming" = isFinalized
      ? "completed"
      : canManagePrescription
        ? "active"
        : "upcoming";
    const complete: "completed" | "active" | "upcoming" =
      apt.status === "completed" ? "completed" : canComplete ? "active" : "upcoming";
    const receipt: "completed" | "active" | "upcoming" = receiptData
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
  }, [apt, isFinalized, canStartConsultation, canManagePrescription, canComplete, receiptData]);

  /* ── mutations ─────────────────────────────────────────────────── */

  const saveDraftMutation = useMutation({
    mutationFn: async (nextPayload: PrescriptionPayload) => {
      const prepared = preparePayloadForApi(nextPayload);
      const endpoint = `/doctor/appointments/${appointmentId}/prescription`;
      const { data } = prescriptionExists
        ? await api.put<Prescription>(endpoint, prepared)
        : await api.post<Prescription>(endpoint, prepared);
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData<PrescriptionResponse>(
        ["doctor-appointment-prescription", appointmentId],
        { exists: true, prescription: data },
      );
      setDraftPayload(null);
      setAutoSaveStatus("saved");
      setTimeout(() => setAutoSaveStatus("idle"), 2000);
    },
    onError: (error) => notifyApiError(error, "Couldn't save draft"),
  });

  const finalizeMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{
        pdf_url: string;
        prescription: Prescription;
      }>(`/doctor/appointments/${appointmentId}/prescription/generate`);
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData<PrescriptionResponse>(
        ["doctor-appointment-prescription", appointmentId],
        { exists: true, prescription: data.prescription },
      );
      setDraftPayload(null);
      notifySuccess(
        "Prescription finalized",
        "The prescription is now locked and ready to view.",
      );
    },
    onError: (error) => notifyApiError(error, "Couldn't finalize prescription"),
  });

  const saveTemplateMutation = useMutation({
    mutationFn: async (name: string) => {
      const { data } = await api.post<PrescriptionTemplate>(
        "/doctor/prescription-templates",
        { name, payload: preparePayloadForApi(payload) },
      );
      return data;
    },
    onSuccess: () => {
      notifySuccess("Template saved", "You can now reuse this prescription.");
      setSaveTemplateDialogOpen(false);
      setTemplateName("");
      queryClient.invalidateQueries({ queryKey: ["prescription-templates"] });
    },
    onError: (error) => notifyApiError(error, "Couldn't save template"),
  });

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
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === "doctor-appointments-range" });
    },
    onError: (error) => notifyApiError(error, "Couldn't complete appointment"),
  });

  const previewMutation = useMutation({
    mutationFn: async (nextPayload: PrescriptionPayload) => {
      if (isFinalized) {
        return await api.get(
          `/doctor/appointments/${appointmentId}/prescription/pdf/view`,
          { responseType: "blob" }
        ).then(res => res.data as Blob);
      }
      const response = await api.post(
        `/doctor/appointments/${appointmentId}/prescription/preview`,
        preparePayloadForApi(nextPayload),
        { responseType: "blob" },
      );
      return response.data as Blob;
    },
    onSuccess: (blob) => {
      openPdfBlob(blob);
    },
    onError: (error) =>
      notifyApiError(error, "Couldn't build prescription preview"),
  });

  /* ── auto-save logic ───────────────────────────────────────────── */

  useEffect(() => {
    if (!hasUnsavedChanges || isFinalized || !canManagePrescription) return;

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

    autoSaveTimerRef.current = setTimeout(() => {
      setAutoSaveStatus("saving");
      saveDraftMutation.mutate(payload);
    }, 3000);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload, hasUnsavedChanges, isFinalized, canManagePrescription]);

  // Cleanup blob URLs
  useEffect(() => {
    return () => {
      if (previewPdfUrl?.startsWith("blob:")) URL.revokeObjectURL(previewPdfUrl);
    };
  }, [previewPdfUrl]);

  /* ── prescription field handlers ───────────────────────────────── */

  const handleFieldChange = (
    field: keyof Omit<PrescriptionPayload, "items">,
    value: string,
  ) => {
    setDraftPayload((current) => ({
      ...(current ?? serverPayload),
      [field]: value,
    }));
  };

  const updateItem = (index: number, field: keyof RxItem, value: string) => {
    setDraftPayload((current) => {
      const source = current ?? serverPayload;
      return {
        ...source,
        items: source.items.map((item, i) =>
          i === index ? { ...item, [field]: value } : item,
        ),
      };
    });
  };

  const addItem = () => {
    setDraftPayload((current) => {
      const source = current ?? serverPayload;
      return { ...source, items: [...source.items, { ...EMPTY_RX_ITEM }] };
    });
  };

  const duplicateItem = (index: number) => {
    setDraftPayload((current) => {
      const source = current ?? serverPayload;
      const next = [...source.items];
      next.splice(index + 1, 0, { ...source.items[index] });
      return { ...source, items: next };
    });
  };

  const removeItem = (index: number) => {
    setDraftPayload((current) => {
      const source = current ?? serverPayload;
      const next = source.items.filter((_, i) => i !== index);
      return {
        ...source,
        items: next.length ? next : [{ ...EMPTY_RX_ITEM }],
      };
    });
  };

  const handleFinalize = async () => {
    if (!canManagePrescription) {
      notifyInfo("Unavailable", "Only confirmed/completed appointments can be finalized.");
      return;
    }
    if (!hasMeaningfulPrescription(payload)) {
      notifyError("Add details first", "Include at least one clinical or medication detail.");
      return;
    }
    if (!prescriptionExists || hasUnsavedChanges) {
      await saveDraftMutation.mutateAsync(payload);
    }
    await finalizeMutation.mutateAsync();
  };

  const handleTogglePreview = async () => {
    if (!isFinalized && !canManagePrescription) {
      notifyInfo("Preview unavailable", "Only for confirmed/completed appointments.");
      return;
    }
    if (previewMode) {
      setPreviewPdfUrl((current) => {
        if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
        return isFinalized ? current : null;
      });
      setPreviewMode(false);
      return;
    }
    await previewMutation.mutateAsync(payload);
  };

  const applyTemplate = (template: PrescriptionTemplate) => {
    setDraftPayload(normalizePayload(template.payload));
    setPreviewPdfUrl((current) => {
      if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
      return null;
    });
    setPreviewMode(false);
    setTemplateDialogOpen(false);
    notifyInfo("Template applied", `${template.name} loaded.`);
  };

  /* ── loading state ─────────────────────────────────────────────── */

  if (appointmentLoading || !apt) {
    return (
      <DoctorShell title="Appointment" subtitle="Loading...">
        <div className="flex items-center justify-center py-32">
          <Loader2 className="h-8 w-8 animate-spin text-brand" />
        </div>
      </DoctorShell>
    );
  }

  const initials =
    apt.patient.full_name
      ?.split(" ")
      .slice(0, 2)
      .map((n) => n[0])
      .join("")
      .toUpperCase() || "P";

  /* ── render ────────────────────────────────────────────────────── */

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
        <div className="sticky top-0 z-30 -mx-1 rounded-b-2xl bg-white/90 px-1 py-4 backdrop-blur-md">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon-sm"
                className="rounded-xl"
                onClick={() => router.push("/doctor/appointments")}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand/20 to-brand/5 text-xs font-bold text-brand">
                  {initials}
                </div>
                <div>
                  <h1 className="text-base font-semibold text-brand-dark">
                    {apt.patient.full_name}
                  </h1>
                  <div className="flex flex-wrap items-center gap-1.5">
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

            {/* Primary action button (contextual) */}
            <div className="flex items-center gap-2">
              {apt.call_status === "waiting" && apt.mode === "online" && (
                <Button
                  className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
                  onClick={() => router.push(`/doctor/call/${appointmentId}`)}
                >
                  <Phone className="h-4 w-4" />
                  Join Call
                </Button>
              )}
              {canComplete && (
                <Button
                  className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
                  onClick={() => setActiveStep("complete")}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Complete
                </Button>
              )}
              {isFinalized && (
                <Button
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => {
                    fetchAndOpenPdf(`/doctor/appointments/${appointmentId}/prescription/pdf/view`);
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
        <div className="mt-6 flex gap-6">
          {/* Vertical stepper sidebar */}
          <div className="hidden w-56 shrink-0 lg:block">
            <nav className="sticky top-24 space-y-1">
              {STEPS.map((step, i) => {
                const state = stepState[step.key];
                const isActive = activeStep === step.key;
                const Icon = step.icon;
                return (
                  <button
                    key={step.key}
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

          {/* Mobile step selector */}
          <div className="mb-4 flex w-full overflow-x-auto lg:hidden">
            <div className="flex gap-1 rounded-2xl border border-border/60 bg-white p-1">
              {STEPS.map((step) => {
                const Icon = step.icon;
                const isActive = activeStep === step.key;
                return (
                  <button
                    key={step.key}
                    type="button"
                    onClick={() => setActiveStep(step.key)}
                    className={cn(
                      "flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-all",
                      isActive
                        ? "bg-brand/10 text-brand"
                        : "text-brand-subtext",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {step.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Content area */}
          <div className="min-w-0 flex-1 pb-12">
            {/* Persistent call panel — lives outside AnimatePresence so it never unmounts on tab switch */}
            {apt.mode === "online" && (
              <ConsultationCallPanel
                appointmentId={appointmentId}
                appointment={apt}
                minimized={activeStep !== "consultation"}
                onMaximize={() => setActiveStep("consultation")}
              />
            )}

            <AnimatePresence mode="wait">
              <motion.div
                key={activeStep}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.2 }}
              >
                {activeStep === "overview" && (
                  <OverviewSection
                    appointment={apt}
                    patientHistory={patientHistory ?? []}
                  />
                )}
                {activeStep === "consultation" && (
                  <ConsultationSection
                    appointment={apt}
                    appointmentId={appointmentId}
                    canStart={!!canStartConsultation}
                    onOpenPrescription={() => setActiveStep("prescription")}
                    callPanelRenderedOutside
                  />
                )}
                {activeStep === "prescription" && (
                  <PrescriptionSection
                    appointment={apt}
                    payload={payload}
                    isFinalized={isFinalized}
                    hasDraft={hasDraft}
                    canManage={canManagePrescription}
                    hasUnsavedChanges={hasUnsavedChanges}
                    previewMode={previewMode}
                    previewPdfUrl={previewPdfUrl}
                    templates={templates}
                    templateDialogOpen={templateDialogOpen}
                    setTemplateDialogOpen={setTemplateDialogOpen}
                    saveTemplateDialogOpen={saveTemplateDialogOpen}
                    setSaveTemplateDialogOpen={setSaveTemplateDialogOpen}
                    templateName={templateName}
                    setTemplateName={setTemplateName}
                    onFieldChange={handleFieldChange}
                    onUpdateItem={updateItem}
                    onAddItem={addItem}
                    onDuplicateItem={duplicateItem}
                    onRemoveItem={removeItem}
                    onTogglePreview={handleTogglePreview}
                    onFinalize={handleFinalize}
                    onApplyTemplate={applyTemplate}
                    onSaveTemplate={async () => {
                      if (!templateName.trim()) {
                        notifyError("Name required", "Give the template a name.");
                        return;
                      }
                      if (!hasMeaningfulPrescription(payload)) {
                        notifyError("Nothing to save", "Add content first.");
                        return;
                      }
                      await saveTemplateMutation.mutateAsync(templateName.trim());
                    }}
                    finalizePending={finalizeMutation.isPending}
                    previewPending={previewMutation.isPending}
                    saveTemplatePending={saveTemplateMutation.isPending}
                    autoSaveStatus={autoSaveStatus}
                  />
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
          </div>
        </div>
      </div>
    </DoctorShell>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SECTION: Overview
   ═══════════════════════════════════════════════════════════════════ */

function SectionShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border/60 bg-white p-5 shadow-[0_4px_20px_rgba(15,23,42,0.03)]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-brand-dark">{title}</h3>
          {description && (
            <p className="mt-0.5 text-xs text-brand-subtext">{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
      {children}
    </section>
  );
}

function InfoLabel({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-subtext/70">
        {label}
      </p>
      <p className="mt-0.5 text-sm text-brand-dark">{value || "-"}</p>
    </div>
  );
}

function OverviewSection({
  appointment: apt,
  patientHistory,
}: {
  appointment: DoctorAppointmentDetail;
  patientHistory: DoctorAppointment[];
}) {
  return (
    <div className="space-y-5">
      {/* Patient + Appointment in a 2-col grid */}
      <div className="grid gap-5 xl:grid-cols-2">
        <SectionShell title="Patient">
          <div className="grid gap-4 sm:grid-cols-2">
            <InfoLabel label="Name" value={apt.patient.full_name} />
            <InfoLabel
              label="Age / Sex"
              value={
                [
                  apt.patient.age ? `${apt.patient.age}y` : null,
                  apt.patient.sex,
                ]
                  .filter(Boolean)
                  .join(" / ") || "-"
              }
            />
            <InfoLabel label="Phone" value={apt.patient.phone || "-"} />
            <InfoLabel label="Email" value={apt.patient.email || "-"} />
          </div>
          {apt.patient.notes && (
            <div className="mt-4 rounded-xl bg-brand-bg/50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-subtext/70">
                Notes
              </p>
              <p className="mt-1 text-sm leading-relaxed text-brand-dark">
                {apt.patient.notes}
              </p>
            </div>
          )}
        </SectionShell>

        <SectionShell title="Appointment">
          <div className="grid gap-4 sm:grid-cols-2">
            <InfoLabel
              label="Date"
              value={formatDateOnly(apt.scheduled_at)}
            />
            <InfoLabel
              label="Time"
              value={format(parseISO(apt.scheduled_at), "hh:mm a")}
            />
            <InfoLabel
              label="Duration"
              value={`${apt.duration_min} min`}
            />
            <InfoLabel
              label="Fee"
              value={`₹ ${(apt.fee || 0).toLocaleString("en-IN")}`}
            />
            <InfoLabel
              label="Payment"
              value={apt.payment_status.replace("_", " ")}
            />
            <InfoLabel
              label="Follow-up"
              value={
                apt.follow_up_eligible_until
                  ? `Until ${formatDateOnly(apt.follow_up_eligible_until)}`
                  : "Not available"
              }
            />
          </div>
        </SectionShell>
      </div>

      {/* Patient review */}
      {apt.review && (
        <SectionShell title="Patient Review">
          <div className="flex items-center gap-3">
            <StarRating value={apt.review.rating} readonly size="md" />
            <span className="text-xs text-brand-subtext">
              {format(parseISO(apt.review.created_at), "dd MMM yyyy")}
            </span>
          </div>
          {apt.review.comment && (
            <p className="mt-3 rounded-xl bg-brand-bg/50 p-3 text-sm leading-relaxed text-brand-dark">
              {apt.review.comment}
            </p>
          )}
        </SectionShell>
      )}

      {/* Patient history */}
      {patientHistory.length > 0 && (
        <SectionShell
          title="Previous Visits"
          description={`${patientHistory.length} previous appointment${patientHistory.length > 1 ? "s" : ""} with this patient`}
        >
          <div className="space-y-2">
            {patientHistory.map((h) => (
              <div
                key={h.appointment_id}
                className="flex items-center justify-between rounded-xl border border-border/40 bg-brand-bg/30 px-3 py-2.5"
              >
                <div className="flex items-center gap-3">
                  <div className="text-xs text-brand-subtext">
                    {formatDateOnly(h.scheduled_at)}
                  </div>
                  <StatusBadge
                    variant={
                      h.status as
                        | "confirmed"
                        | "completed"
                        | "cancelled"
                        | "no_show"
                    }
                    size="xs"
                    className="rounded-xl"
                  />
                  {h.prescription_status === "final" && (
                    <span className="text-[10px] font-medium text-emerald-600">
                      Rx Finalized
                    </span>
                  )}
                </div>
                <span className="text-xs font-medium text-brand-dark">
                  ₹{(h.fee || 0).toLocaleString("en-IN")}
                </span>
              </div>
            ))}
          </div>
        </SectionShell>
      )}

      {/* Timeline */}
      <SectionShell title="Timeline">
        <AppointmentTimeline appointment={apt} />
      </SectionShell>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SECTION: Consultation (video call)
   ═══════════════════════════════════════════════════════════════════ */

function ConsultationSection({
  appointment,
  appointmentId,
  canStart,
  onOpenPrescription,
  callPanelRenderedOutside = false,
}: {
  appointment: DoctorAppointmentDetail;
  appointmentId: string;
  canStart: boolean;
  onOpenPrescription: () => void;
  callPanelRenderedOutside?: boolean;
}) {
  const router = useRouter();

  if (appointment.mode !== "online") {
    return (
      <div className="space-y-5">
        <SectionShell title="Walk-in Consultation">
          <div className="rounded-xl bg-brand-bg/50 p-6 text-center">
            <MapPin className="mx-auto h-8 w-8 text-brand-subtext/50" />
            <p className="mt-3 text-sm font-medium text-brand-dark">
              This is a walk-in appointment
            </p>
            <p className="mt-1 text-xs text-brand-subtext">
              Video consultation is not available. Proceed to the prescription
              when ready.
            </p>
            <Button
              className="mt-4 rounded-xl"
              onClick={onOpenPrescription}
            >
              <FileText className="h-4 w-4" />
              Write Prescription
            </Button>
          </div>
        </SectionShell>
      </div>
    );
  }

  if (!canStart) {
    return (
      <div className="space-y-5">
        <SectionShell title="Video Consultation">
          <div className="rounded-xl bg-brand-bg/50 p-6 text-center">
            <Video className="mx-auto h-8 w-8 text-brand-subtext/50" />
            <p className="mt-3 text-sm font-medium text-brand-dark">
              Consultation not available
            </p>
            <p className="mt-1 text-xs text-brand-subtext">
              {appointment.status === "completed"
                ? "This appointment has been completed."
                : "Video consultation will be available when the appointment is confirmed."}
            </p>
          </div>
        </SectionShell>
      </div>
    );
  }

  // When callPanelRenderedOutside is true, the ConsultationCallPanel is rendered
  // persistently outside AnimatePresence (above), so we just show quick actions here.
  if (callPanelRenderedOutside) {
    return (
      <div className="mt-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={onOpenPrescription}
          >
            <FileText className="h-4 w-4" />
            Write Prescription
          </Button>
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => router.push(`/doctor/call/${appointmentId}`)}
          >
            <MonitorPlay className="h-4 w-4" />
            Full-screen Call
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <SectionShell
        title="Video Consultation"
        description="Start or join the video call with your patient."
        actions={
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={onOpenPrescription}
          >
            <FileText className="h-4 w-4" />
            Open Rx
          </Button>
        }
      >
        <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
          <ConsultationCallPanel
            appointmentId={appointmentId}
            appointment={appointment}
          />
          <div className="hidden 2xl:block">
            <div className="rounded-xl bg-brand-bg/50 p-4">
              <p className="text-xs font-semibold text-brand-subtext/70">
                Quick actions
              </p>
              <div className="mt-3 space-y-2">
                <Button
                  variant="outline"
                  className="w-full justify-start rounded-xl"
                  onClick={onOpenPrescription}
                >
                  <FileText className="h-4 w-4" />
                  Write Prescription
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start rounded-xl"
                  onClick={() =>
                    router.push(`/doctor/call/${appointmentId}`)
                  }
                >
                  <MonitorPlay className="h-4 w-4" />
                  Full-screen Call
                </Button>
              </div>
            </div>
          </div>
        </div>
      </SectionShell>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SECTION: Prescription
   ═══════════════════════════════════════════════════════════════════ */

function PrescriptionSection({
  appointment,
  payload,
  isFinalized,
  hasDraft,
  canManage,
  hasUnsavedChanges,
  previewMode,
  previewPdfUrl,
  templates,
  templateDialogOpen,
  setTemplateDialogOpen,
  saveTemplateDialogOpen,
  setSaveTemplateDialogOpen,
  templateName,
  setTemplateName,
  onFieldChange,
  onUpdateItem,
  onAddItem,
  onDuplicateItem,
  onRemoveItem,
  onTogglePreview,
  onFinalize,
  onApplyTemplate,
  onSaveTemplate,
  finalizePending,
  previewPending,
  saveTemplatePending,
  autoSaveStatus,
}: {
  appointment: DoctorAppointmentDetail;
  payload: PrescriptionPayload;
  isFinalized: boolean;
  hasDraft: boolean;
  canManage: boolean;
  hasUnsavedChanges: boolean;
  previewMode: boolean;
  previewPdfUrl: string | null;
  templates: PrescriptionTemplate[];
  templateDialogOpen: boolean;
  setTemplateDialogOpen: (v: boolean) => void;
  saveTemplateDialogOpen: boolean;
  setSaveTemplateDialogOpen: (v: boolean) => void;
  templateName: string;
  setTemplateName: (v: string) => void;
  onFieldChange: (
    field: keyof Omit<PrescriptionPayload, "items">,
    value: string,
  ) => void;
  onUpdateItem: (index: number, field: keyof RxItem, value: string) => void;
  onAddItem: () => void;
  onDuplicateItem: (index: number) => void;
  onRemoveItem: (index: number) => void;
  onTogglePreview: () => void;
  onFinalize: () => void;
  onApplyTemplate: (t: PrescriptionTemplate) => void;
  onSaveTemplate: () => void;
  finalizePending: boolean;
  previewPending: boolean;
  saveTemplatePending: boolean;
  autoSaveStatus: "idle" | "saving" | "saved";
}) {
  return (
    <div className="space-y-5">
      {/* Toolbar — simplified: Preview + Templates dropdown + Finalize */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-white p-3">
        <div className="flex items-center gap-2">
          {/* Templates dropdown */}
          <TemplateDropdown
            templates={templates}
            disabled={isFinalized || !canManage}
            onApply={onApplyTemplate}
            onOpenSave={() => setSaveTemplateDialogOpen(true)}
          />
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl"
            onClick={onTogglePreview}
            loading={previewPending}
          >
            <Eye className="h-3.5 w-3.5" />
            {previewMode ? "Edit" : "Preview"}
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {/* Auto-save indicator */}
          {autoSaveStatus === "saving" && (
            <span className="flex items-center gap-1 text-xs text-brand-subtext">
              <Loader2 className="h-3 w-3 animate-spin" /> Saving...
            </span>
          )}
          {autoSaveStatus === "saved" && (
            <span className="flex items-center gap-1 text-xs text-emerald-600">
              <Check className="h-3 w-3" /> Draft saved
            </span>
          )}
          {hasUnsavedChanges && autoSaveStatus === "idle" && (
            <span className="text-xs text-amber-600">Unsaved changes</span>
          )}

          <Button
            size="sm"
            className="rounded-xl"
            onClick={onFinalize}
            loading={finalizePending}
            disabled={isFinalized || !canManage}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {isFinalized ? "Finalized" : "Finalize"}
          </Button>
        </div>
      </div>

      {!canManage && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Prescription editing is disabled for{" "}
          <span className="font-semibold">
            {appointment.status.replace("_", " ")}
          </span>{" "}
          appointments.
        </div>
      )}

      {/* Patient header (auto-filled, read-only) */}
          <SectionShell
            title="Patient Details"
            description="Auto-filled from appointment"
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <InfoLabel label="Name" value={appointment.patient.full_name} />
              <InfoLabel
                label="Age"
                value={
                  appointment.patient.age
                    ? String(appointment.patient.age)
                    : "-"
                }
              />
              <InfoLabel label="Sex" value={appointment.patient.sex || "-"} />
              <InfoLabel
                label="Phone"
                value={appointment.patient.phone || "-"}
              />
              <InfoLabel
                label="Date"
                value={formatDateOnly(appointment.scheduled_at)}
              />
            </div>
          </SectionShell>

          {/* Clinical details */}
          <SectionShell title="Clinical Details">
            <div className="grid gap-4 xl:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-brand-subtext/70">
                  Chief Complaints
                </label>
                <Textarea
                  rows={5}
                  value={payload.chief_complaints || ""}
                  onChange={(e) =>
                    onFieldChange("chief_complaints", e.target.value)
                  }
                  disabled={isFinalized || !canManage}
                  placeholder="Patient complaints and presenting symptoms."
                  className="rounded-xl"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-brand-subtext/70">
                  Diagnosis
                </label>
                <Textarea
                  rows={5}
                  value={payload.diagnosis || ""}
                  onChange={(e) =>
                    onFieldChange("diagnosis", e.target.value)
                  }
                  disabled={isFinalized || !canManage}
                  placeholder="Clinical diagnosis or impression."
                  className="rounded-xl"
                />
              </div>
            </div>
          </SectionShell>

          {/* Medicine list — expandable cards */}
          <SectionShell
            title="Medicines (Rx)"
            actions={
              !isFinalized && canManage ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl"
                  onClick={onAddItem}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Medicine
                </Button>
              ) : undefined
            }
          >
            <div className="space-y-3">
              {payload.items.map((item, index) => (
                <MedicineCard
                  key={`medicine-${index}`}
                  item={item}
                  index={index}
                  disabled={isFinalized || !canManage}
                  onUpdate={(field, value) => onUpdateItem(index, field, value)}
                  onDuplicate={() => onDuplicateItem(index)}
                  onRemove={() => onRemoveItem(index)}
                />
              ))}
            </div>
            {!isFinalized && canManage && (
              <button
                type="button"
                onClick={onAddItem}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border/60 py-2.5 text-xs font-medium text-brand-subtext transition-colors hover:border-brand/30 hover:text-brand"
              >
                <Plus className="h-3.5 w-3.5" />
                Add another medicine
              </button>
            )}
          </SectionShell>

          {/* Advice */}
          <SectionShell title="Advice / Notes">
            <Textarea
              rows={5}
              value={payload.advice || ""}
              onChange={(e) => onFieldChange("advice", e.target.value)}
              disabled={isFinalized || !canManage}
              placeholder="Advice, precautions, and notes for the patient."
              className="rounded-xl"
            />
          </SectionShell>

      {/* Template dialogs */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Load Template</DialogTitle>
            <DialogDescription>
              Choose a saved prescription template.
            </DialogDescription>
          </DialogHeader>
          {templates.length === 0 ? (
            <p className="py-6 text-center text-sm text-brand-subtext">
              No templates saved yet.
            </p>
          ) : (
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onApplyTemplate(t)}
                  className="w-full rounded-xl border border-border/60 px-4 py-3 text-left transition-colors hover:bg-brand-bg"
                >
                  <p className="text-sm font-medium text-brand-dark">
                    {t.name}
                  </p>
                  <p className="mt-0.5 text-xs text-brand-subtext">
                    {t.payload.items?.length ?? 0} medicine
                    {(t.payload.items?.length ?? 0) !== 1 ? "s" : ""}
                  </p>
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={saveTemplateDialogOpen}
        onOpenChange={setSaveTemplateDialogOpen}
      >
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>Save as Template</DialogTitle>
            <DialogDescription>
              Give this prescription a reusable name.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Template name"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            className="rounded-xl"
          />
          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => setSaveTemplateDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="rounded-xl"
              onClick={onSaveTemplate}
              loading={saveTemplatePending}
            >
              Save Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─── Medicine card (expandable) ────────────────────────────────── */

function MedicineCard({
  item,
  index,
  disabled,
  onUpdate,
  onDuplicate,
  onRemove,
}: {
  item: RxItem;
  index: number;
  disabled: boolean;
  onUpdate: (field: keyof RxItem, value: string) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(!item.name);
  const hasName = item.name.trim().length > 0;
  const summary = [item.dosage, item.frequency, item.duration]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className={cn(
        "rounded-xl border transition-colors",
        expanded
          ? "border-brand/20 bg-white shadow-sm"
          : "border-border/60 bg-brand-bg/20 hover:border-brand/15",
      )}
    >
      {/* Collapsed header */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded(!expanded); } }}
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left"
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-[11px] font-bold text-brand">
          {index + 1}
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "truncate text-sm font-medium",
              hasName ? "text-brand-dark" : "text-brand-subtext",
            )}
          >
            {hasName ? item.name : "Untitled medicine"}
          </p>
          {summary && !expanded && (
            <p className="truncate text-xs text-brand-subtext">{summary}</p>
          )}
        </div>
        {!disabled && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate();
              }}
              className="rounded-lg p-1 text-brand-subtext/60 hover:bg-brand-bg hover:text-brand-dark"
              title="Duplicate"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="rounded-lg p-1 text-brand-subtext/60 hover:bg-red-50 hover:text-red-600"
              title="Remove"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-brand-subtext/60" />
        ) : (
          <ChevronDown className="h-4 w-4 text-brand-subtext/60" />
        )}
      </div>

      {/* Expanded fields */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/40 px-4 pb-4 pt-3">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <div className="xl:col-span-2">
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-brand-subtext/70">
                    Medicine name
                  </label>
                  <Input
                    value={item.name}
                    onChange={(e) => onUpdate("name", e.target.value)}
                    disabled={disabled}
                    placeholder="Medicine name"
                    className="rounded-lg"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-brand-subtext/70">
                    Dosage
                  </label>
                  <Input
                    value={item.dosage || ""}
                    onChange={(e) => onUpdate("dosage", e.target.value)}
                    disabled={disabled}
                    placeholder="e.g. 200mg"
                    className="rounded-lg"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-brand-subtext/70">
                    Frequency
                  </label>
                  <Input
                    value={item.frequency || ""}
                    onChange={(e) => onUpdate("frequency", e.target.value)}
                    disabled={disabled}
                    placeholder="e.g. Twice daily"
                    className="rounded-lg"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-brand-subtext/70">
                    Duration
                  </label>
                  <Input
                    value={item.duration || ""}
                    onChange={(e) => onUpdate("duration", e.target.value)}
                    disabled={disabled}
                    placeholder="e.g. 7 days"
                    className="rounded-lg"
                  />
                </div>
              </div>
              <div className="mt-3">
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-brand-subtext/70">
                  Instructions
                </label>
                <Input
                  value={item.instructions || ""}
                  onChange={(e) => onUpdate("instructions", e.target.value)}
                  disabled={disabled}
                  placeholder="e.g. After meals"
                  className="rounded-lg"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Template dropdown ─────────────────────────────────────────── */

function TemplateDropdown({
  templates,
  disabled,
  onApply,
  onOpenSave,
}: {
  templates: PrescriptionTemplate[];
  disabled: boolean;
  onApply: (t: PrescriptionTemplate) => void;
  onOpenSave: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        className="rounded-xl"
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        <LayoutTemplate className="h-3.5 w-3.5" />
        Templates
        <ChevronDown className="ml-1 h-3 w-3" />
      </Button>

      <AnimatePresence>
        {open && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.95 }}
              transition={{ duration: 0.12 }}
              className="absolute left-0 top-full z-50 mt-1 w-64 rounded-xl border border-border/60 bg-white p-1.5 shadow-lg"
            >
              <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-brand-subtext/70">
                Load Template
              </p>
              {templates.length === 0 ? (
                <p className="px-2 py-3 text-xs text-brand-subtext">
                  No templates yet.
                </p>
              ) : (
                <div className="max-h-40 overflow-y-auto">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        onApply(t);
                        setOpen(false);
                      }}
                      className="w-full rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-brand-bg"
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-1 border-t border-border/40 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    onOpenSave();
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-brand transition-colors hover:bg-brand/5"
                >
                  <Save className="h-3.5 w-3.5" />
                  Save current as template
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SECTION: Review & Complete
   ═══════════════════════════════════════════════════════════════════ */

function CompleteSection({
  appointment,
  canComplete,
  isFinalized,
  completePending,
  onComplete,
}: {
  appointment: DoctorAppointmentDetail;
  canComplete: boolean;
  isFinalized: boolean;
  completePending: boolean;
  onComplete: () => void;
}) {
  if (appointment.status === "completed") {
    return (
      <SectionShell title="Appointment Completed">
        <div className="flex flex-col items-center py-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          </div>
          <p className="mt-4 text-base font-semibold text-brand-dark">
            This appointment has been completed
          </p>
          <p className="mt-1 text-sm text-brand-subtext">
            Completed on {formatDateTime(appointment.completed_at)}
          </p>
        </div>
      </SectionShell>
    );
  }

  return (
    <div className="space-y-5">
      <SectionShell title="Review & Complete">
        <div className="space-y-4">
          {/* Summary checklist */}
          <div className="space-y-3">
            <ChecklistItem
              label="Patient information reviewed"
              checked
            />
            <ChecklistItem
              label="Prescription finalized"
              checked={isFinalized}
              hint={!isFinalized ? "Finalize the prescription first" : undefined}
            />
            <ChecklistItem
              label="Payment confirmed"
              checked={
                appointment.payment_status === "paid" ||
                appointment.payment_status === "transferred"
              }
              hint={
                appointment.payment_status !== "paid" &&
                appointment.payment_status !== "transferred"
                  ? `Current: ${appointment.payment_status.replace("_", " ")}`
                  : undefined
              }
            />
          </div>

          {/* Completion card */}
          <div className="mt-6 rounded-2xl border border-border/60 bg-gradient-to-br from-emerald-50/50 to-white p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-100">
                <Sparkles className="h-6 w-6 text-emerald-600" />
              </div>
              <div className="flex-1">
                <h4 className="text-base font-semibold text-brand-dark">
                  Complete Appointment
                </h4>
                <p className="mt-1 text-sm text-brand-subtext">
                  This will close the consultation for{" "}
                  <strong>{appointment.patient.full_name}</strong> and update
                  their follow-up eligibility.
                </p>
                <Button
                  className="mt-4 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
                  disabled={!canComplete}
                  loading={completePending}
                  onClick={onComplete}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Complete Appointment
                </Button>
                {!canComplete && !isFinalized && (
                  <p className="mt-2 text-xs text-amber-600">
                    Finalize the prescription to enable completion.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </SectionShell>
    </div>
  );
}

function ChecklistItem({
  label,
  checked,
  hint,
}: {
  label: string;
  checked: boolean;
  hint?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
          checked ? "bg-emerald-100" : "bg-brand-bg",
        )}
      >
        {checked ? (
          <Check className="h-3.5 w-3.5 text-emerald-600" />
        ) : (
          <div className="h-2 w-2 rounded-full bg-brand-subtext/30" />
        )}
      </div>
      <div>
        <p
          className={cn(
            "text-sm",
            checked
              ? "font-medium text-brand-dark"
              : "text-brand-subtext",
          )}
        >
          {label}
        </p>
        {hint && <p className="text-xs text-amber-600">{hint}</p>}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SECTION: Receipt
   ═══════════════════════════════════════════════════════════════════ */

function ReceiptSection({
  appointmentId,
  receipt,
}: {
  appointmentId: string;
  receipt: Receipt | null;
}) {
  if (!receipt) {
    return (
      <SectionShell title="Receipt">
        <div className="flex flex-col items-center py-10">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-bg">
            <ReceiptIcon className="h-6 w-6 text-brand-subtext/50" />
          </div>
          <p className="mt-4 text-sm font-medium text-brand-dark">
            No receipt available
          </p>
          <p className="mt-1 text-xs text-brand-subtext">
            A receipt will be generated after the appointment is completed and
            payment is confirmed.
          </p>
        </div>
      </SectionShell>
    );
  }

  const pdfUrl = api.getUri({
    url: `/doctor/appointments/${appointmentId}/receipt/pdf/view`,
  });

  return (
    <div className="space-y-5">
      <SectionShell
        title="Receipt"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={() =>
                fetchAndOpenPdf(`/doctor/appointments/${appointmentId}/receipt/pdf/view`)
              }
            >
              <Download className="h-3.5 w-3.5" />
              Download PDF
            </Button>
          </div>
        }
      >
        {/* Receipt summary */}
        <div className="grid gap-4 sm:grid-cols-2">
          <InfoLabel label="Receipt ID" value={receipt.receipt_id} />
          <InfoLabel label="Patient" value={receipt.patient_name} />
          <InfoLabel
            label="Consultation Fee"
            value={`₹ ${receipt.consultation_fee.toLocaleString("en-IN")}`}
          />
          <InfoLabel label="Payment Method" value={receipt.payment_method} />
          <InfoLabel
            label="Date"
            value={formatDateOnly(receipt.receipt_date)}
          />
          {receipt.payment_id && (
            <InfoLabel label="Payment ID" value={receipt.payment_id} />
          )}
        </div>
      </SectionShell>

    </div>
  );
}
