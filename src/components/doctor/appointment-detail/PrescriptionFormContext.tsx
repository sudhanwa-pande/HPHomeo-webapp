import React, { createContext, useContext, useState, useEffect, useRef, useMemo, useCallback } from "react";
import axios from "axios";
import isEqual from "fast-deep-equal";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { notifyApiError, notifyError, notifyInfo, notifySuccess } from "@/lib/notify";
import { hapticSuccess, hapticPulse, hapticWarning } from "@/lib/haptics";
import type {
  DoctorAppointmentDetail,
  Prescription,
  PrescriptionPayload,
  PrescriptionTemplate,
  RxItem
} from "@/types/doctor";
import {
  prescriptionToPayload,
  toComparablePayload,
  preparePayloadForApi,
  hasMeaningfulPrescription,
  normalizePayload,
  isPayloadValidForSave
} from "./utils";

type PrescriptionFormContextType = {
  prescription: Prescription | null;
  prescriptionLoading: boolean;
  templates: PrescriptionTemplate[];
  draftPayload: PrescriptionPayload | null;
  setDraftPayload: React.Dispatch<React.SetStateAction<PrescriptionPayload | null>>;
  payload: PrescriptionPayload;
  isFinalized: boolean;
  hasDraft: boolean;
  canManage: boolean;
  hasUnsavedChanges: boolean;
  autoSaveStatus: "idle" | "saving" | "saved";
  templateDialogOpen: boolean;
  setTemplateDialogOpen: (v: boolean) => void;
  saveTemplateDialogOpen: boolean;
  setSaveTemplateDialogOpen: (v: boolean) => void;
  templateName: string;
  setTemplateName: (v: string) => void;
  previewOpen: boolean;
  setPreviewOpen: (v: boolean) => void;
  previewBlobUrl: string | null;
  previewPending: boolean;
  finalizePending: boolean;
  saveTemplatePending: boolean;
  handleFieldChange: (field: keyof Omit<PrescriptionPayload, "items">, value: string) => void;
  updateItem: (index: number, field: keyof RxItem, value: string) => void;
  addItem: () => void;
  duplicateItem: (index: number) => void;
  removeItem: (index: number) => void;
  handleFinalize: () => Promise<void>;
  handleTogglePreview: () => Promise<void>;
  applyTemplate: (t: PrescriptionTemplate) => void;
  handleSaveTemplate: () => Promise<void>;
  isTyping: boolean;
  setIsTyping: (v: boolean) => void;
};

const PrescriptionFormContext = createContext<PrescriptionFormContextType | undefined>(undefined);

export function usePrescriptionForm() {
  const context = useContext(PrescriptionFormContext);
  if (!context) {
    throw new Error("usePrescriptionForm must be used within a PrescriptionFormProvider");
  }
  return context;
}

export function PrescriptionFormProvider({
  appointmentId,
  appointment,
  children,
}: {
  appointmentId: string;
  appointment: DoctorAppointmentDetail;
  children: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const [draftPayload, setDraftPayload] = useState<PrescriptionPayload | null>(null);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [saveTemplateDialogOpen, setSaveTemplateDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const previewAbortRef = useRef<AbortController | null>(null);

  // Clean up blob URL on unmount
  useEffect(() => {
    return () => {
      if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
      if (previewAbortRef.current) previewAbortRef.current.abort();
    };
  }, [previewBlobUrl]);

  // Auto-save timer ref
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveAbortControllerRef = useRef<AbortController | null>(null);
  const latestSaveId = useRef(0);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  // Prescription query
  const { data: prescriptionData, isLoading: prescriptionLoading } = useQuery({
    queryKey: ["doctor-appointment-prescription", appointmentId],
    queryFn: async () => {
      const { data } = await api.get<{ exists: boolean; prescription: Prescription | null }>(
        `/doctor/appointments/${appointmentId}/prescription`,
      );
      return data;
    },
    refetchOnWindowFocus: false,
  });

  // Templates query
  const { data: templates = [] } = useQuery({
    queryKey: ["prescription-templates"],
    queryFn: async () => {
      const { data } = await api.get<{ items: PrescriptionTemplate[] }>(
        "/doctor/prescription-templates",
      );
      return data.items;
    },
    refetchOnWindowFocus: false,
  });

  const prescription = prescriptionData?.prescription ?? null;
  const prescriptionExists = Boolean(prescriptionData?.exists);

  const serverPayload = useMemo(
    () => prescriptionToPayload(prescriptionData?.prescription),
    [prescriptionData?.prescription],
  );

  const payload = draftPayload ?? serverPayload;
  const payloadRef = useRef(payload);
  useEffect(() => {
    payloadRef.current = payload;
  }, [payload]);
  const baseline = serverPayload;
  const isFinalized = prescription?.status === "final" && !prescription?.is_draft;
  const hasDraft = Boolean(prescription && prescription.is_draft);
  const canManage = appointment
    ? ["confirmed", "completed"].includes(appointment.status)
    : false;
  const comparablePayload = useMemo(() => toComparablePayload(payload), [payload]);
  const comparableBaseline = useMemo(() => toComparablePayload(baseline), [baseline]);

  const hasUnsavedChanges =
    !isFinalized &&
    !isEqual(comparablePayload, comparableBaseline);

  // Mutations
  const saveDraftMutation = useMutation({
    mutationFn: async ({ nextPayload, signal }: { nextPayload: PrescriptionPayload; signal?: AbortSignal }) => {
      const prepared = preparePayloadForApi(nextPayload);
      const endpoint = `/doctor/appointments/${appointmentId}/prescription`;
      const payloadWithVersion = {
        ...prepared,
        version: prescription?.updated_at,
      };
      const { data } = prescriptionExists
        ? await api.put<Prescription>(endpoint, payloadWithVersion, { signal })
        : await api.post<Prescription>(endpoint, payloadWithVersion, { signal });
      return data;
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData<{ exists: boolean; prescription: Prescription | null }>(
        ["doctor-appointment-prescription", appointmentId],
        { exists: true, prescription: data },
      );
      setDraftPayload((current) => {
        if (!current) return null;
        if (isEqual(toComparablePayload(current), toComparablePayload(variables.nextPayload))) {
          return null;
        }
        return current;
      });
      setAutoSaveStatus("saved");
      setTimeout(() => setAutoSaveStatus("idle"), 2000);
    },
    onError: (error) => {
      if (axios.isCancel(error)) return;
      setAutoSaveStatus("idle");
      notifyError(
        "Auto-save failed",
        "Your changes are not saved. Please check connection."
      );
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{
        pdf_url: string;
        prescription: Prescription;
      }>(`/doctor/appointments/${appointmentId}/prescription/generate`);
      return data;
    },
    onMutate: () => {
      setDraftPayload(null);
    },
    onSuccess: (data) => {
      queryClient.setQueryData<{ exists: boolean; prescription: Prescription | null }>(
        ["doctor-appointment-prescription", appointmentId],
        { exists: true, prescription: data.prescription },
      );
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

  const previewMutation = useMutation({
    mutationFn: async (nextPayload: PrescriptionPayload) => {
      if (previewAbortRef.current) previewAbortRef.current.abort();
      previewAbortRef.current = new AbortController();

      if (isFinalized) {
        return await api.get(
          `/doctor/appointments/${appointmentId}/prescription/pdf/view`,
          { responseType: "blob", signal: previewAbortRef.current.signal }
        ).then(res => res.data as Blob);
      }
      const response = await api.post(
        `/doctor/appointments/${appointmentId}/prescription/preview`,
        preparePayloadForApi(nextPayload),
        { responseType: "blob", signal: previewAbortRef.current.signal },
      );
      return response.data as Blob;
    },
    onSuccess: (blob) => {
      if (previewAbortRef.current?.signal.aborted) return;
      const isMobile = typeof window !== "undefined" && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
      if (isMobile) return;
      setPreviewBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
      setPreviewOpen(true);
    },
    onError: (error) =>
      notifyApiError(error, "Couldn't build prescription preview"),
  });

  // Auto-save logic
  useEffect(() => {
    if (!hasUnsavedChanges || isFinalized || !canManage || !isPayloadValidForSave(payload)) return;

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

    autoSaveTimerRef.current = setTimeout(() => {
      const saveId = ++latestSaveId.current;

      setAutoSaveStatus("saving");

      if (autoSaveAbortControllerRef.current) {
        autoSaveAbortControllerRef.current.abort();
      }
      autoSaveAbortControllerRef.current = new AbortController();

      saveDraftMutation.mutate(
        { nextPayload: payload, signal: autoSaveAbortControllerRef.current.signal },
        {
          onSuccess: () => {
            if (saveId !== latestSaveId.current) return;
            setAutoSaveStatus("saved");
            setTimeout(() => setAutoSaveStatus("idle"), 2000);
          },
        }
      );
    }, 3000);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [payload, hasUnsavedChanges, isFinalized, canManage, saveDraftMutation]);

  // Before unload handler
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedChanges]);

  // Field handlers
  const handleFieldChange = useCallback((
    field: keyof Omit<PrescriptionPayload, "items">,
    value: string,
  ) => {
    setDraftPayload((current) => ({
      ...(current ?? serverPayload),
      [field]: value,
    }));
  }, [serverPayload]);

  const updateItem = useCallback((index: number, field: keyof RxItem, value: string) => {
    setDraftPayload((current) => {
      const source = current ?? serverPayload;
      return {
        ...source,
        items: source.items.map((item, i) =>
          i === index ? { ...item, [field]: value } : item,
        ),
      };
    });
  }, [serverPayload]);

  const addItem = useCallback(() => {
    setDraftPayload((current) => {
      const source = current ?? serverPayload;
      const EMPTY_RX_ITEM = {
        name: "",
        dosage: "",
        frequency: "",
        duration: "",
        instructions: "",
      };
      return { ...source, items: [...source.items, { ...EMPTY_RX_ITEM, _clientId: crypto.randomUUID() }] };
    });
  }, [serverPayload]);

  const duplicateItem = useCallback((index: number) => {
    setDraftPayload((current) => {
      const source = current ?? serverPayload;
      const next = [...source.items];
      next.splice(index + 1, 0, { ...source.items[index], _clientId: crypto.randomUUID() });
      return { ...source, items: next };
    });
  }, [serverPayload]);

  const removeItem = useCallback((index: number) => {
    setDraftPayload((current) => {
      const source = current ?? serverPayload;
      const next = source.items.filter((_, i) => i !== index);
      return {
        ...source,
        items: next,
      };
    });
  }, [serverPayload]);

  const handleFinalize = async () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    await Promise.resolve();
    const latestPayload = payloadRef.current;

    if (!canManage) {
      notifyInfo("Unavailable", "Only confirmed/completed appointments can be finalized.");
      return;
    }
    if (!hasMeaningfulPrescription(latestPayload)) {
      notifyError("Add details first", "Include at least one clinical or medication detail.");
      return;
    }
    if (!isPayloadValidForSave(latestPayload)) {
      notifyError("Medicine name required", "Provide a name for all medicines.");
      return;
    }

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    latestSaveId.current++;

    try {
      if (!prescriptionExists || hasUnsavedChanges) {
        await saveDraftMutation.mutateAsync({ nextPayload: latestPayload });
      }
      await finalizeMutation.mutateAsync();
    } catch {
      return;
    }
    hapticSuccess();
  };

  const handleTogglePreview = async () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    await Promise.resolve();
    const latestPayload = payloadRef.current;

    if (!isFinalized && !canManage) {
      notifyInfo("Preview unavailable", "Only for confirmed/completed appointments.");
      return;
    }

    const isMobile = typeof window !== "undefined" && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    let newWindow: Window | null = null;
    if (isMobile) {
      newWindow = window.open("", "_blank");
      if (newWindow) {
        newWindow.document.write(`
          <html>
            <head>
              <title>Prescription Preview...</title>
              <style>
                body {
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  justify-content: center;
                  height: 100vh;
                  margin: 0;
                  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                  background-color: #f8fafc;
                  color: #0f172a;
                }
                .spinner {
                  border: 3px solid #e2e8f0;
                  border-top: 3px solid #16a34a;
                  border-radius: 50%;
                  width: 24px;
                  height: 24px;
                  animation: spin 1s linear infinite;
                  margin-bottom: 12px;
                }
                @keyframes spin {
                  0% { transform: rotate(0deg); }
                  100% { transform: rotate(360deg); }
                }
              </style>
            </head>
            <body>
              <div class="spinner"></div>
              <p style="font-size: 14px; font-weight: 500; color: #475569;">Building preview, please wait...</p>
            </body>
          </html>
        `);
        newWindow.document.close();
      }
    }

    try {
      const blob = await previewMutation.mutateAsync(latestPayload);
      if (isMobile && newWindow) {
        const objectUrl = URL.createObjectURL(blob);
        newWindow.location.href = objectUrl;
        setTimeout(() => URL.revokeObjectURL(objectUrl), 15000);
      }
    } catch (error) {
      if (newWindow) newWindow.close();
    }
  };

  const applyTemplate = (template: PrescriptionTemplate) => {
    if (hasMeaningfulPrescription(payload)) {
      const confirmOverride = window.confirm(
        "Are you sure you want to load this template? This will replace your current unsaved prescription details.",
      );
      if (!confirmOverride) return;
    } else if (hasUnsavedChanges) {
      notifyInfo("Unsaved changes will be replaced", "Applying template over unsaved work.");
    }
    setDraftPayload(normalizePayload(template.payload));
    setTemplateDialogOpen(false);
    notifySuccess("Template applied", `${template.name} loaded.`);
  };

  const handleSaveTemplate = async () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    await Promise.resolve();
    const latestPayload = payloadRef.current;
    if (!templateName.trim()) {
      notifyError("Name required", "Give the template a name.");
      return;
    }
    if (!hasMeaningfulPrescription(latestPayload)) {
      notifyError("Nothing to save", "Add content first.");
      return;
    }
    await saveTemplateMutation.mutateAsync(templateName.trim());
  };

  return (
    <PrescriptionFormContext.Provider
      value={{
        prescription,
        prescriptionLoading,
        templates,
        draftPayload,
        setDraftPayload,
        payload,
        isFinalized,
        hasDraft,
        canManage,
        hasUnsavedChanges,
        autoSaveStatus,
        templateDialogOpen,
        setTemplateDialogOpen,
        saveTemplateDialogOpen,
        setSaveTemplateDialogOpen,
        templateName,
        setTemplateName,
        previewOpen,
        setPreviewOpen,
        previewBlobUrl,
        previewPending: previewMutation.isPending,
        finalizePending: finalizeMutation.isPending,
        saveTemplatePending: saveTemplateMutation.isPending,
        handleFieldChange,
        updateItem,
        addItem,
        duplicateItem,
        removeItem,
        handleFinalize,
        handleTogglePreview,
        applyTemplate,
        handleSaveTemplate,
        isTyping,
        setIsTyping,
      }}
    >
      {children}
    </PrescriptionFormContext.Provider>
  );
}
