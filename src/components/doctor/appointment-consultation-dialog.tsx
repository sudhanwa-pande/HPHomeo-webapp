"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardList,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  Eye,
  FileText,
  IndianRupee,
  LayoutTemplate,
  Loader2,
  MapPin,
  MonitorPlay,
  Plus,
  Receipt as ReceiptIcon,
  Save,
  Sparkles,
  Trash2,
  Video,
} from "lucide-react";

import { openPdfBlob, fetchAndOpenPdf } from "@/lib/pdf";
import api from "@/lib/api";
import { notifyApiError, notifyError, notifyInfo, notifySuccess } from "@/lib/notify";
import { cn } from "@/lib/utils";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

function normalizePayload(payload?: Partial<PrescriptionPayload> | null): PrescriptionPayload {
  const items = payload?.items?.length ? payload.items.map(normalizeItem) : [{ ...EMPTY_RX_ITEM }];

  return {
    chief_complaints: payload?.chief_complaints ?? "",
    diagnosis: payload?.diagnosis ?? "",
    advice: payload?.advice ?? "",
    items,
  };
}

function prescriptionToPayload(prescription?: Prescription | null): PrescriptionPayload {
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

function preparePayloadForApi(payload: PrescriptionPayload): PrescriptionPayload {
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

function ConsultationStateBadge({
  isFinalized,
  hasUnsavedChanges,
  hasDraft,
}: {
  isFinalized: boolean;
  hasUnsavedChanges: boolean;
  hasDraft: boolean;
}) {
  if (isFinalized) {
    return <StatusBadge variant="final" className="rounded-full" />;
  }

  if (hasUnsavedChanges) {
    return (
      <Badge className="rounded-full bg-amber-100 text-amber-700 shadow-none" variant="secondary">
        Unsaved changes
      </Badge>
    );
  }

  if (hasDraft) {
    return <StatusBadge variant="draft" className="rounded-full" label="Draft saved" />;
  }

  return (
    <Badge className="rounded-full bg-slate-100 text-slate-700 shadow-none" variant="secondary">
      No prescription
    </Badge>
  );
}

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
    <section className="rounded-[26px] border border-border/60 bg-white/90 p-4 shadow-[0_12px_35px_rgba(15,23,42,0.04)]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-brand-dark">{title}</h3>
          {description ? <p className="mt-1 text-xs text-brand-subtext">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

function ReadonlyLabel({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/50 bg-brand-bg/35 px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-subtext/70">{label}</p>
      <p className="mt-1 text-sm text-brand-dark">{value || "-"}</p>
    </div>
  );
}

export function AppointmentConsultationDialog({
  appointmentId,
  fallbackAppointment,
  onClose,
  onUpdated,
}: {
  appointmentId: string;
  fallbackAppointment: DoctorAppointment;
  onClose: () => void;
  onUpdated: () => Promise<void> | void;
}) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("overview");
  const [draftPayload, setDraftPayload] = useState<PrescriptionPayload | null>(null);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [saveTemplateDialogOpen, setSaveTemplateDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");

  const { data: appointment } = useQuery({
    queryKey: ["doctor-appointment-detail", appointmentId],
    queryFn: async () => {
      const { data } = await api.get<DoctorAppointmentDetail>(`/doctor/appointments/${appointmentId}`);
      return data;
    },
    refetchOnWindowFocus: false,
  });

  const { data: prescriptionData, isLoading: prescriptionLoading } = useQuery({
    queryKey: ["doctor-appointment-prescription", appointmentId],
    queryFn: async () => {
      const { data } = await api.get<PrescriptionResponse>(`/doctor/appointments/${appointmentId}/prescription`);
      return data;
    },
    refetchOnWindowFocus: false,
  });

  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ["prescription-templates"],
    queryFn: async () => {
      const { data } = await api.get<{ items: PrescriptionTemplate[] }>("/doctor/prescription-templates");
      return data.items;
    },
    refetchOnWindowFocus: false,
  });

  const { data: receiptData, isLoading: receiptLoading } = useQuery({
    queryKey: ["doctor-appointment-receipt", appointmentId],
    queryFn: async () => {
      const { data } = await api.get<{ exists: boolean; receipt: Receipt | null }>(
        `/doctor/appointments/${appointmentId}/receipt`,
      );
      return data.receipt;
    },
    enabled: !!appointmentId,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const currentAppointment = useMemo(
    () =>
      appointment ??
      ({
        ...fallbackAppointment,
        doctor_id: "",
        updated_at: fallbackAppointment.created_at,
        patient: {
          ...fallbackAppointment.patient,
          notes: null,
        },
        doctor: {
          full_name: "",
          specialization: "",
          clinic_name: "",
          city: "",
        },
      } as DoctorAppointmentDetail),
    [appointment, fallbackAppointment]
  );

  const prescription = prescriptionData?.prescription ?? null;
  const prescriptionExists = Boolean(prescriptionData?.exists);
  const serverPayload = useMemo(
    () => prescriptionToPayload(prescriptionData?.prescription),
    [prescriptionData?.prescription]
  );
  const payload = draftPayload ?? serverPayload;
  const baseline = serverPayload;
  const isFinalized = prescription?.status === "final" && !prescription?.is_draft;
  const hasDraft = Boolean(prescription && prescription.is_draft);
  const canManagePrescription = ["confirmed", "completed"].includes(currentAppointment.status);
  const hasUnsavedChanges =
    !isFinalized &&
    JSON.stringify(toComparablePayload(payload)) !== JSON.stringify(toComparablePayload(baseline));
  const preparedPayload = useMemo(() => preparePayloadForApi(payload), [payload]);

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
      queryClient.setQueryData<PrescriptionResponse>(["doctor-appointment-prescription", appointmentId], {
        exists: true,
        prescription: data,
      });
      setDraftPayload(null);
      notifySuccess("Draft saved", "Prescription changes were saved to this appointment.");
    },
    onError: (error) => notifyApiError(error, "Couldn't save draft"),
  });

  const finalizeMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{ pdf_url: string; prescription: Prescription }>(
        `/doctor/appointments/${appointmentId}/prescription/generate`
      );
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData<PrescriptionResponse>(["doctor-appointment-prescription", appointmentId], {
        exists: true,
        prescription: data.prescription,
      });
      setDraftPayload(null);
      notifySuccess("Prescription finalized", "The prescription is now locked and ready to view.");
    },
    onError: (error) => notifyApiError(error, "Couldn't finalize prescription"),
  });

  const saveTemplateMutation = useMutation({
    mutationFn: async (name: string) => {
      const { data } = await api.post<PrescriptionTemplate>("/doctor/prescription-templates", {
        name,
        payload: preparePayloadForApi(payload),
      });
      return data;
    },
    onSuccess: () => {
      notifySuccess("Template saved", "You can now reuse this prescription structure.");
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
      notifySuccess("Appointment completed", "The consultation has been closed successfully.");
      await onUpdated();
      onClose();
    },
    onError: (error) => notifyApiError(error, "Couldn't complete appointment"),
  });

  const openPdfMutation = useMutation({
    mutationFn: async () => {
      await fetchAndOpenPdf(`/doctor/appointments/${appointmentId}/prescription/pdf/view`);
    },
    onError: (error) => notifyApiError(error, "Couldn't open prescription PDF"),
  });

  const previewMutation = useMutation({
    mutationFn: async (nextPayload: PrescriptionPayload) => {
      if (isFinalized) {
        return await api.get(`/doctor/appointments/${appointmentId}/prescription/pdf/view`, { responseType: 'blob' }).then(res => res.data as Blob);
      }

      const response = await api.post(`/doctor/appointments/${appointmentId}/prescription/preview`, preparePayloadForApi(nextPayload), {
        responseType: "blob",
      });
      return response.data as Blob;
    },
    onSuccess: (blob) => {
      openPdfBlob(blob);
    },
    onError: (error) => notifyApiError(error, "Couldn't build prescription preview"),
  });

  const canStartConsultation =
    currentAppointment.mode === "online" &&
    currentAppointment.video_enabled &&
    currentAppointment.status === "confirmed";
  const openConsultationWorkspace = () => {
    setActiveTab("prescription");
  };
  const canComplete =
    currentAppointment.status === "confirmed" &&
    (prescription?.status === "final" || currentAppointment.prescription_status === "final");

  const timelineItems = useMemo(
    () =>
      [
        { label: "Appointment created", value: currentAppointment.created_at },
        { label: "Appointment confirmed", value: currentAppointment.confirmed_at },
        { label: "Rescheduled", value: currentAppointment.rescheduled_at },
        { label: "Marked no-show", value: currentAppointment.no_show_at },
        { label: "Appointment cancelled", value: currentAppointment.cancelled_at },
        { label: "Appointment completed", value: currentAppointment.completed_at },
        { label: "Prescription drafted", value: prescription?.created_at },
        {
          label: "Prescription last updated",
          value: prescription?.updated_at && prescription?.updated_at !== prescription?.created_at ? prescription.updated_at : null,
        },
        { label: "Prescription finalized", value: !prescription?.is_draft ? prescription?.updated_at ?? prescription?.created_at : null },
      ].filter((item) => item.value),
    [currentAppointment, prescription]
  );

  const handleFieldChange = (field: keyof Omit<PrescriptionPayload, "items">, value: string) => {
    setDraftPayload((current) => ({ ...(current ?? serverPayload), [field]: value }));
  };

  const updateItem = (index: number, field: keyof RxItem, value: string) => {
    setDraftPayload((current) => {
      const source = current ?? serverPayload;
      return {
        ...source,
        items: source.items.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)),
      };
    });
  };

  const addItem = () => {
    setDraftPayload((current) => {
      const source = current ?? serverPayload;
      return {
        ...source,
        items: [...source.items, { ...EMPTY_RX_ITEM }],
      };
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
      const next = source.items.filter((_, itemIndex) => itemIndex !== index);
      return {
        ...source,
        items: next.length ? next : [{ ...EMPTY_RX_ITEM }],
      };
    });
  };

  const handleSaveDraft = async () => {
    if (!canManagePrescription) {
      notifyInfo(
        "Prescription editing unavailable",
        "Drafts can only be saved for confirmed or completed appointments."
      );
      return;
    }

    await saveDraftMutation.mutateAsync(payload);
  };

  const handleFinalize = async () => {
    if (!canManagePrescription) {
      notifyInfo(
        "Prescription finalization unavailable",
        "Only confirmed or completed appointments can be finalized."
      );
      return;
    }

    if (!hasMeaningfulPrescription(payload)) {
      notifyError("Add prescription details first", "Include at least one meaningful clinical or medication detail.");
      return;
    }

    if (!prescriptionExists || hasUnsavedChanges) {
      await saveDraftMutation.mutateAsync(payload);
    }

    await finalizeMutation.mutateAsync();
  };

  const handleTogglePreview = async () => {
    if (!isFinalized && !canManagePrescription) {
      notifyInfo(
        "Preview unavailable",
        "Prescription preview is available only for confirmed or completed appointments."
      );
      return;
    }

    await previewMutation.mutateAsync(payload);
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) {
      notifyError("Template name required", "Give this template a name before saving it.");
      return;
    }

    if (!hasMeaningfulPrescription(payload)) {
      notifyError("Nothing to save yet", "Add some prescription content before saving a template.");
      return;
    }

    await saveTemplateMutation.mutateAsync(templateName.trim());
  };

  const applyTemplate = (template: PrescriptionTemplate) => {
    setDraftPayload(normalizePayload(template.payload));
    setTemplateDialogOpen(false);
    notifyInfo("Template applied", `${template.name} has been loaded into this prescription.`);
  };

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="min-h-0 h-[min(94vh,980px)] max-h-[94vh] max-w-[calc(100vw-1rem)] gap-0 overflow-hidden rounded-[32px] border border-border/70 p-0 shadow-[0_36px_120px_rgba(15,23,42,0.2)] sm:max-w-[calc(100vw-2.5rem)] 2xl:max-w-[1400px]">
          <div className="flex min-h-0 h-full flex-col bg-[radial-gradient(circle_at_top_right,rgba(88,155,255,0.08),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.99),rgba(248,250,252,0.98))]">
            <div className="shrink-0 border-b border-border/60 bg-white/85 px-5 py-5 backdrop-blur-sm sm:px-6 xl:px-8">
              <DialogHeader className="gap-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex min-w-0 gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] border border-brand/10 bg-brand/10 text-lg font-bold text-brand shadow-[0_10px_30px_rgba(88,155,255,0.12)]">
                      {currentAppointment.patient.full_name
                        ?.split(" ")
                        .slice(0, 2)
                        .map((part) => part[0])
                        .join("")
                        .toUpperCase() || "P"}
                    </div>
                    <div className="min-w-0">
                      <DialogTitle className="truncate text-xl font-semibold tracking-[-0.04em] text-brand-dark">
                        {currentAppointment.patient.full_name}
                      </DialogTitle>
                      <DialogDescription className="mt-1 text-sm text-brand-subtext">
                        Appointment on {formatDateTime(currentAppointment.scheduled_at)}.
                      </DialogDescription>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <AppointmentStatusBadge
                          status={currentAppointment.status as "confirmed" | "completed" | "cancelled" | "no_show"}
                          animated
                          className="rounded-full"
                        />
                        <StatusBadge variant={currentAppointment.mode === "online" ? "online" : "walk_in"} className="rounded-full" />
                        <StatusBadge
                          variant={currentAppointment.appointment_type === "follow_up" ? "follow_up" : "new"}
                          className="rounded-full"
                        />
                        <ConsultationStateBadge
                          isFinalized={isFinalized}
                          hasUnsavedChanges={hasUnsavedChanges}
                          hasDraft={hasDraft}
                        />
                        {prescriptionLoading ? (
                          <Badge className="rounded-full bg-slate-100 text-slate-500 shadow-none" variant="secondary">
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            Loading prescription
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {canStartConsultation ? (
                      <Button className="rounded-xl" onClick={openConsultationWorkspace}>
                        <Video className="h-4 w-4" />
                        Open Workspace
                      </Button>
                    ) : null}
                    {isFinalized ? (
                      <Button
                        variant="outline"
                        className="rounded-xl"
                        onClick={() => openPdfMutation.mutate()}
                        loading={openPdfMutation.isPending}
                      >
                        <Eye className="h-4 w-4" />
                        View PDF
                      </Button>
                    ) : null}
                  </div>
                </div>
              </DialogHeader>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6 xl:px-8">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="min-h-full gap-5">
                <div className="sticky top-0 z-20 -mx-1 rounded-[22px] bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(248,250,252,0.82))] px-1 py-1.5 backdrop-blur-sm">
                  <TabsList className="flex w-full justify-start overflow-x-auto rounded-2xl border border-border/60 bg-white/92 p-1 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
                  <TabsTrigger className="rounded-xl px-4" value="overview">
                    Overview
                  </TabsTrigger>
                  <TabsTrigger className="rounded-xl px-4" value="prescription">
                    Prescription
                  </TabsTrigger>
                  <TabsTrigger className="rounded-xl px-4" value="timeline">
                    Timeline
                  </TabsTrigger>
                  <TabsTrigger className="rounded-xl px-4" value="receipt">
                    Receipt
                  </TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="overview" className="space-y-4 pb-6">
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1.12fr)_minmax(320px,0.88fr)]">
                    <SectionShell title="Patient snapshot" description="Accessible context for the consult.">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <ReadonlyLabel label="Patient" value={currentAppointment.patient.full_name} />
                        <ReadonlyLabel
                          label="Age / Sex"
                          value={[
                            currentAppointment.patient.age ? `${currentAppointment.patient.age}y` : null,
                            currentAppointment.patient.sex || null,
                          ]
                            .filter(Boolean)
                            .join(" / ") || "-"}
                        />
                        <ReadonlyLabel label="Phone" value={currentAppointment.patient.phone || "-"} />
                        <ReadonlyLabel label="Email" value={currentAppointment.patient.email || "-"} />
                      </div>
                      <div className="mt-4 rounded-[22px] border border-border/50 bg-brand-bg/35 p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-subtext/70">
                          Patient notes
                        </p>
                        <p className="mt-2 text-sm leading-6 text-brand-dark">
                          {currentAppointment.patient.notes || "No patient notes recorded yet."}
                        </p>
                      </div>

                      {/* Patient review (read-only) */}
                      {currentAppointment.review && (
                        <div className="mt-4 rounded-[22px] border border-border/50 bg-brand-bg/35 p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-subtext/70">
                            Patient review
                          </p>
                          <div className="mt-2 flex items-center gap-3">
                            <StarRating value={currentAppointment.review.rating} readonly size="md" />
                            <span className="text-xs text-brand-subtext">
                              {format(parseISO(currentAppointment.review.created_at), "dd MMM yyyy")}
                            </span>
                          </div>
                          {currentAppointment.review.comment && (
                            <p className="mt-2 rounded-xl bg-white/80 p-3 text-sm leading-6 text-brand-dark ring-1 ring-border/50">
                              {currentAppointment.review.comment}
                            </p>
                          )}
                        </div>
                      )}
                    </SectionShell>

                    <SectionShell title="Appointment snapshot" description="Schedule, payment, and follow-up context.">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <ReadonlyLabel label="Date" value={formatDateOnly(currentAppointment.scheduled_at)} />
                        <ReadonlyLabel
                          label="Time"
                          value={currentAppointment.scheduled_at ? format(parseISO(currentAppointment.scheduled_at), "hh:mm a") : "-"}
                        />
                        <ReadonlyLabel label="Duration" value={`${currentAppointment.duration_min} min`} />
                        <ReadonlyLabel
                          label="Fee"
                          value={`\u20B9 ${(currentAppointment.fee || 0).toLocaleString("en-IN")}`}
                        />
                        <ReadonlyLabel label="Payment" value={currentAppointment.payment_status.replace("_", " ")} />
                        <ReadonlyLabel
                          label="Follow-up window"
                          value={
                            currentAppointment.follow_up_eligible_until
                              ? formatDateOnly(currentAppointment.follow_up_eligible_until)
                              : "Not available"
                          }
                        />
                      </div>
                    </SectionShell>
                  </div>

                  <SectionShell title="Consultation workflow" description="The recommended doctor flow for this appointment.">
                    <div className="grid gap-3 md:grid-cols-4">
                      {[
                        {
                          label: "Consultation workspace",
                          value: canStartConsultation ? "Open in the prescription tab" : "Consultation ready",
                          icon: Video,
                        },
                        {
                          label: "Write prescription",
                          value: hasDraft || isFinalized ? "In progress" : "Start in Prescription tab",
                          icon: FileText,
                        },
                        {
                          label: "Finalize",
                          value: isFinalized ? "Completed" : "Lock when done",
                          icon: CheckCircle2,
                        },
                        {
                          label: "Complete appointment",
                          value: canComplete ? "Ready to complete" : "Available after finalization",
                          icon: Sparkles,
                        },
                      ].map((item) => {
                        const Icon = item.icon;
                        return (
                          <div
                            key={item.label}
                            className="rounded-2xl border border-border/60 bg-white/80 p-3.5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]"
                          >
                            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/10 text-brand">
                              <Icon className="h-4 w-4" />
                            </div>
                            <p className="mt-3 text-sm font-semibold text-brand-dark">{item.label}</p>
                            <p className="mt-1 text-xs leading-5 text-brand-subtext">{item.value}</p>
                          </div>
                        );
                      })}
                    </div>
                  </SectionShell>
                </TabsContent>

                <TabsContent value="prescription" className="space-y-4 pb-6">
                  <SectionShell
                    title="Prescription workspace"
                    description={
                      canManagePrescription
                        ? "Consult, chat, and build the final prescription together in one workspace."
                        : "This appointment is read-only here because prescription actions are allowed only for confirmed or completed appointments."
                    }
                    actions={
                      <>
                        <Button
                          variant="outline"
                          className="rounded-xl"
                          onClick={() => setTemplateDialogOpen(true)}
                          disabled={isFinalized || !canManagePrescription}
                        >
                          <LayoutTemplate className="h-4 w-4" />
                          Add Template
                        </Button>
                        <Button
                          variant="outline"
                          className="rounded-xl"
                          onClick={() => setSaveTemplateDialogOpen(true)}
                          disabled={isFinalized || !canManagePrescription}
                        >
                          <Save className="h-4 w-4" />
                          Save as Template
                        </Button>
                        <Button
                          variant="outline"
                          className="rounded-xl"
                          onClick={handleTogglePreview}
                          loading={previewMutation.isPending}
                        >
                          <Eye className="h-4 w-4" />
                          Preview PDF
                        </Button>
                        <Button
                          variant="outline"
                          className="rounded-xl"
                          onClick={handleSaveDraft}
                          loading={saveDraftMutation.isPending}
                          disabled={isFinalized || !canManagePrescription}
                        >
                          <Save className="h-4 w-4" />
                          Save Draft
                        </Button>
                        <Button
                          className="rounded-xl"
                          onClick={handleFinalize}
                          loading={finalizeMutation.isPending}
                          disabled={isFinalized || !canManagePrescription}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          {isFinalized ? "Finalized" : "Finalize Prescription"}
                        </Button>
                      </>
                    }
                  >
                    <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
                      <div className="space-y-4">
                        {!canManagePrescription ? (
                          <div className="rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                            Prescription changes are disabled for appointments with status{" "}
                            <span className="font-semibold">{currentAppointment.status.replace("_", " ")}</span>.
                          </div>
                        ) : null}
                        <SectionShell
                          title="Auto-filled patient header"
                              description="These details are pulled from the appointment and used in the final prescription."
                            >
                              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                                <ReadonlyLabel label="Name" value={currentAppointment.patient.full_name} />
                                <ReadonlyLabel label="Age" value={currentAppointment.patient.age ? String(currentAppointment.patient.age) : "-"} />
                                <ReadonlyLabel label="Sex" value={currentAppointment.patient.sex || "-"} />
                                <ReadonlyLabel label="Phone" value={currentAppointment.patient.phone || "-"} />
                                <ReadonlyLabel label="Date" value={formatDateOnly(currentAppointment.scheduled_at)} />
                              </div>
                            </SectionShell>

                            <SectionShell
                              title="Clinical details"
                              description="These sections sit above the medicine list in the final prescription."
                            >
                              <div className="grid gap-4 xl:grid-cols-2">
                                <div>
                                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-brand-subtext/70">
                                    C/O
                                  </label>
                                  <Textarea
                                    rows={6}
                                    value={payload.chief_complaints || ""}
                                    onChange={(event) => handleFieldChange("chief_complaints", event.target.value)}
                                    disabled={isFinalized || !canManagePrescription}
                                    placeholder="Patient complaints and presenting symptoms."
                                    className="rounded-2xl"
                                  />
                                </div>
                                <div>
                                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-brand-subtext/70">
                                    Diagnosis
                                  </label>
                                  <Textarea
                                    rows={6}
                                    value={payload.diagnosis || ""}
                                    onChange={(event) => handleFieldChange("diagnosis", event.target.value)}
                                    disabled={isFinalized || !canManagePrescription}
                                    placeholder="Clinical diagnosis or impression."
                                    className="rounded-2xl"
                                  />
                                </div>
                              </div>
                            </SectionShell>

                            <SectionShell
                              title="Rx (Medicines)"
                              description="Add the medicines exactly as you want them to appear in the prescription."
                              actions={
                                !isFinalized && canManagePrescription ? (
                                  <Button variant="outline" className="rounded-xl" onClick={addItem}>
                                    <Plus className="h-4 w-4" />
                                    Add medicine
                                  </Button>
                                ) : null
                              }
                            >
                              <div className="space-y-3">
                                {payload.items.map((item, index) => (
                                  <div
                                    key={`medicine-row-${index}`}
                                    className="rounded-[22px] border border-border/60 bg-brand-bg/25 p-3.5"
                                  >
                                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                                      <Input
                                        value={item.name}
                                        onChange={(event) => updateItem(index, "name", event.target.value)}
                                        disabled={isFinalized || !canManagePrescription}
                                        placeholder="Medicine name"
                                        className="rounded-xl"
                                      />
                                      <Input
                                        value={item.dosage || ""}
                                        onChange={(event) => updateItem(index, "dosage", event.target.value)}
                                        disabled={isFinalized || !canManagePrescription}
                                        placeholder="Dosage"
                                        className="rounded-xl"
                                      />
                                      <Input
                                        value={item.frequency || ""}
                                        onChange={(event) => updateItem(index, "frequency", event.target.value)}
                                        disabled={isFinalized || !canManagePrescription}
                                        placeholder="Frequency"
                                        className="rounded-xl"
                                      />
                                      <Input
                                        value={item.duration || ""}
                                        onChange={(event) => updateItem(index, "duration", event.target.value)}
                                        disabled={isFinalized || !canManagePrescription}
                                        placeholder="Duration"
                                        className="rounded-xl"
                                      />
                                      <Input
                                        value={item.instructions || ""}
                                        onChange={(event) => updateItem(index, "instructions", event.target.value)}
                                        disabled={isFinalized || !canManagePrescription}
                                        placeholder="Instructions"
                                        className="rounded-xl"
                                      />
                                    </div>
                                    {!isFinalized && canManagePrescription ? (
                                      <div className="mt-3 flex flex-wrap items-center gap-2">
                                        <Button variant="outline" size="sm" className="rounded-xl" onClick={() => duplicateItem(index)}>
                                          <Copy className="h-3.5 w-3.5" />
                                          Duplicate
                                        </Button>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="rounded-xl text-red-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                                          onClick={() => removeItem(index)}
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                          Remove
                                        </Button>
                                      </div>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            </SectionShell>

                            <SectionShell title="Advice / Notes" description="This section appears at the bottom of the final prescription.">
                              <Textarea
                                rows={7}
                                value={payload.advice || ""}
                                onChange={(event) => handleFieldChange("advice", event.target.value)}
                                disabled={isFinalized || !canManagePrescription}
                                placeholder="Advice, precautions, and any notes for the patient."
                                className="rounded-2xl"
                              />
                            </SectionShell>
                      </div>

                      <div className="space-y-4">
                        {currentAppointment.mode === "online" ? (
                          <ConsultationCallPanel
                            appointmentId={appointmentId}
                            appointment={currentAppointment}
                          />
                        ) : null}

                        <SectionShell title="Quick checklist">
                          <div className="space-y-3 text-sm text-brand-dark">
                            {[
                              {
                                label: "C/O or diagnosis added",
                                done: Boolean(payload.chief_complaints || payload.diagnosis),
                              },
                              {
                                label: "Medicine or advice added",
                                done: Boolean(preparedPayload.items.length || payload.advice),
                              },
                              {
                                label: "Draft saved",
                                done: hasDraft || isFinalized,
                              },
                              {
                                label: "Prescription finalized",
                                done: isFinalized,
                              },
                            ].map((item) => (
                              <div
                                key={item.label}
                                className="flex items-center gap-3 rounded-2xl border border-border/60 bg-white/80 px-3 py-2.5"
                              >
                                <span
                                  className={cn(
                                    "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold",
                                    item.done ? "bg-brand-accent/20 text-brand-dark" : "bg-slate-100 text-slate-500"
                                  )}
                                >
                                  {item.done ? <Check className="h-3.5 w-3.5" /> : "*"}
                                </span>
                                <span>{item.label}</span>
                              </div>
                            ))}
                          </div>
                        </SectionShell>
                      </div>
                    </div>
                  </SectionShell>
                </TabsContent>

                <TabsContent value="timeline" className="space-y-4 pb-6">
                  <SectionShell title="Activity timeline" description="Visual journey of this appointment from booking to completion.">
                    <AppointmentTimeline
                      appointment={{
                        status: currentAppointment.status,
                        created_at: currentAppointment.created_at,
                        scheduled_at: currentAppointment.scheduled_at,
                        call_status: currentAppointment.call_status,
                        confirmed_at: currentAppointment.confirmed_at,
                        completed_at: currentAppointment.completed_at,
                        cancelled_at: currentAppointment.cancelled_at,
                        no_show_at: currentAppointment.no_show_at,
                      }}
                    />

                    {/* Detailed event log */}
                    {timelineItems.length > 0 && (
                      <div className="mt-6">
                        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-brand-subtext/70">
                          Detailed event log
                        </p>
                        <div className="space-y-2">
                          {timelineItems.map((item) => (
                            <div
                              key={`${item.label}-${item.value}`}
                              className="flex items-center gap-3 rounded-xl border border-border/50 bg-white/80 px-3.5 py-2.5"
                            >
                              <CalendarDays className="h-3.5 w-3.5 shrink-0 text-brand-subtext" />
                              <div className="flex flex-1 items-center justify-between gap-2">
                                <p className="text-sm font-medium text-brand-dark">{item.label}</p>
                                <p className="shrink-0 text-xs text-brand-subtext">{formatDateTime(item.value)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </SectionShell>
                </TabsContent>

                <TabsContent value="receipt" className="space-y-4 pb-6">
                  <SectionShell title="Payment receipt" description="Auto-generated receipt for this appointment's payment.">
                    {receiptLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-brand-subtext" />
                      </div>
                    ) : receiptData ? (
                      <div className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          <div className="rounded-2xl border border-border/60 bg-white/80 p-3.5">
                            <p className="text-xs font-medium text-brand-subtext">Receipt ID</p>
                            <p className="mt-1 font-mono text-sm font-semibold text-brand-dark">{receiptData.receipt_id}</p>
                          </div>
                          <div className="rounded-2xl border border-border/60 bg-white/80 p-3.5">
                            <p className="text-xs font-medium text-brand-subtext">Amount Paid</p>
                            <p className="mt-1 flex items-center gap-1 text-lg font-bold text-brand-dark">
                              <IndianRupee className="h-4 w-4" />
                              {receiptData.consultation_fee}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-border/60 bg-white/80 p-3.5">
                            <p className="text-xs font-medium text-brand-subtext">Payment Method</p>
                            <p className="mt-1 flex items-center gap-1 text-sm font-semibold capitalize text-brand-dark">
                              <CreditCard className="h-3.5 w-3.5 text-brand-subtext" />
                              {receiptData.payment_method}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-border/60 bg-white/80 p-3.5">
                            <p className="text-xs font-medium text-brand-subtext">Payment ID</p>
                            <p className="mt-1 truncate font-mono text-xs text-brand-dark">{receiptData.payment_id || "-"}</p>
                          </div>
                          <div className="rounded-2xl border border-border/60 bg-white/80 p-3.5">
                            <p className="text-xs font-medium text-brand-subtext">Receipt Date</p>
                            <p className="mt-1 text-sm font-semibold text-brand-dark">
                              {format(parseISO(receiptData.receipt_date), "dd MMM yyyy")}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-border/60 bg-white/80 p-3.5">
                            <p className="text-xs font-medium text-brand-subtext">Patient</p>
                            <p className="mt-1 text-sm font-semibold text-brand-dark">{receiptData.patient_name}</p>
                          </div>
                        </div>

                        {receiptData.pdf_url ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            onClick={() =>
                              fetchAndOpenPdf(`/doctor/appointments/${appointmentId}/receipt/pdf/view`)
                            }
                          >
                            <Download className="h-3.5 w-3.5" />
                            Download PDF
                          </Button>
                        ) : null}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-border/70 bg-brand-bg/30 px-4 py-6 text-center text-sm text-brand-subtext">
                        No receipt available for this appointment.
                      </div>
                    )}
                  </SectionShell>
                </TabsContent>
              </Tabs>
            </div>
            <div className="shrink-0 border-t border-border/60 bg-white/92 px-5 py-4 backdrop-blur-sm sm:px-6 xl:px-8">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-brand-subtext">
                  {canComplete
                    ? "Prescription is finalized. You can complete the appointment now."
                    : "Appointments can be completed only after the prescription is finalized."}
                </p>

                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" className="rounded-xl" onClick={onClose}>
                    Close
                  </Button>
                  <Button
                    className="rounded-xl"
                    onClick={() => completeMutation.mutate()}
                    disabled={!canComplete}
                    loading={completeMutation.isPending}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Complete Appointment
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Prescription templates</DialogTitle>
            <DialogDescription>Choose a saved template to pre-fill this prescription.</DialogDescription>
          </DialogHeader>

          {templatesLoading ? (
            <div className="flex items-center justify-center py-12 text-sm text-brand-subtext">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading templates...
            </div>
          ) : templates.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => applyTemplate(template)}
                  className="rounded-[24px] border border-border/60 bg-white px-4 py-4 text-left shadow-[0_12px_30px_rgba(15,23,42,0.04)] transition-colors hover:border-brand/20 hover:bg-brand-bg/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-brand-dark">{template.name}</p>
                      <p className="mt-1 text-xs text-brand-subtext">
                        {template.payload.diagnosis || template.payload.chief_complaints || "Reusable prescription template"}
                      </p>
                    </div>
                    <LayoutTemplate className="h-4 w-4 text-brand" />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Badge className="rounded-full bg-brand/10 text-brand shadow-none" variant="secondary">
                      {template.payload.items.length} medicines
                    </Badge>
                    {template.payload.advice ? (
                      <Badge className="rounded-full bg-brand-accent/20 text-brand-dark shadow-none" variant="secondary">
                        Advice / Notes
                      </Badge>
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border/70 bg-brand-bg/30 px-4 py-8 text-center">
              <ClipboardList className="mx-auto h-6 w-6 text-brand-subtext/70" />
              <p className="mt-3 text-sm font-medium text-brand-dark">No templates saved yet</p>
              <p className="mt-1 text-xs text-brand-subtext">
                Save this prescription as a template once you have a reusable pattern.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={saveTemplateDialogOpen} onOpenChange={setSaveTemplateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Save as template</DialogTitle>
            <DialogDescription>Create a reusable template from the current prescription draft.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-brand-subtext/70">
                Template name
              </label>
              <Input
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
                placeholder="e.g. Fever consult"
                className="rounded-xl"
              />
            </div>
            <div className="rounded-2xl border border-border/60 bg-brand-bg/35 p-3 text-xs leading-5 text-brand-subtext">
              This saves C/O, diagnosis, medicines, and advice or notes as a doctor-only template.
            </div>
          </div>

          <div className="-mx-4 -mb-4 mt-4 flex items-center justify-end gap-2 rounded-b-3xl border-t border-border/60 bg-brand-bg/35 p-4">
            <Button variant="outline" className="rounded-xl" onClick={() => setSaveTemplateDialogOpen(false)}>
              Cancel
            </Button>
            <Button className="rounded-xl" onClick={handleSaveTemplate} loading={saveTemplateMutation.isPending}>
              <Save className="h-4 w-4" />
              Save template
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
