import React, { useState } from "react";
import {
  Eye,
  Loader2,
  Check,
  CheckCircle2,
  Plus,
  ChevronUp,
  ChevronDown,
  Copy,
  Trash2,
  LayoutTemplate,
  Save,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { hapticTap, hapticPulse, hapticWarning } from "@/lib/haptics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AutoResizeTextarea } from "@/components/ui/auto-resize-textarea";
import { IsolatedInput } from "@/components/ui/isolated-input";
import { SectionShell, InfoLabel } from "./shared";
import { formatDateOnly } from "./utils";
import { usePrescriptionForm } from "./PrescriptionFormContext";
import type { DoctorAppointmentDetail, RxItem, PrescriptionTemplate } from "@/types/doctor";

export function PrescriptionSection({
  appointment,
}: {
  appointment: DoctorAppointmentDetail;
}) {
  const {
    payload,
    isFinalized,
    hasDraft,
    canManage,
    hasUnsavedChanges,
    autoSaveStatus,
    templates,
    templateDialogOpen,
    setTemplateDialogOpen,
    saveTemplateDialogOpen,
    setSaveTemplateDialogOpen,
    templateName,
    setTemplateName,
    previewOpen,
    setPreviewOpen,
    previewBlobUrl,
    previewPending,
    finalizePending,
    saveTemplatePending,
    handleFieldChange,
    updateItem,
    addItem,
    duplicateItem,
    removeItem,
    handleFinalize,
    handleTogglePreview,
    applyTemplate,
    handleSaveTemplate,
    setIsTyping,
  } = usePrescriptionForm();

  const [patientDetailsExpanded, setPatientDetailsExpanded] = useState(false);

  return (
    <div className="space-y-5">
      {/* Toolbar — mobile: stacked grid; desktop: inline flex */}
      <div className="rounded-2xl border border-border/60 bg-white p-2 sm:p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          {/* Left group: Templates + Preview */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <TemplateDropdown
              templates={templates}
              disabled={isFinalized || !canManage}
              onApply={applyTemplate}
              onOpenSave={() => setSaveTemplateDialogOpen(true)}
            />
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={handleTogglePreview}
              loading={previewPending}
            >
              <Eye className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Preview</span>
            </Button>
          </div>

          {/* Right group: auto-save status + Finalize */}
          <div className="flex items-center justify-between gap-1.5 sm:justify-end sm:gap-2">
            <div className="flex items-center gap-2">
              {autoSaveStatus === "saving" && (
                <span className="hidden items-center gap-1 text-xs text-brand-subtext sm:flex">
                  <Loader2 className="h-3 w-3 animate-spin" /> Saving...
                </span>
              )}
              {autoSaveStatus === "saved" && (
                <span className="hidden items-center gap-1 text-xs text-emerald-600 sm:flex">
                  <Check className="h-3 w-3" /> Draft saved
                </span>
              )}
              {hasUnsavedChanges && autoSaveStatus === "idle" && (
                <span className="hidden text-xs text-amber-600 sm:inline">Unsaved</span>
              )}
            </div>

            <Button
              size="sm"
              className="rounded-xl"
              onClick={handleFinalize}
              loading={finalizePending}
              disabled={isFinalized || !canManage}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {isFinalized ? "Finalized" : "Finalize"}
            </Button>
          </div>
        </div>

        {/* Mobile-only auto-save status bar */}
        <div className="mt-1.5 flex items-center justify-center sm:hidden">
          {autoSaveStatus === "saving" && (
            <span className="flex items-center gap-1 text-[11px] text-brand-subtext">
              <Loader2 className="h-3 w-3 animate-spin" /> Auto-saving...
            </span>
          )}
          {autoSaveStatus === "saved" && (
            <span className="flex items-center gap-1 text-[11px] text-emerald-600">
              <Check className="h-3 w-3" /> Saved
            </span>
          )}
          {hasUnsavedChanges && autoSaveStatus === "idle" && (
            <span className="text-[11px] text-amber-600">Unsaved changes</span>
          )}
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
        actions={
          <Button
            variant="ghost"
            size="sm"
            className="h-8 rounded-lg px-2 text-xs"
            onClick={() => setPatientDetailsExpanded(!patientDetailsExpanded)}
          >
            {patientDetailsExpanded ? "Hide" : "Show"}
          </Button>
        }
      >
        {patientDetailsExpanded && (
          <div className="grid grid-cols-1 gap-4 xs:grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 pt-2 border-t border-border/40">
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
        )}
      </SectionShell>

      {/* Clinical details */}
      <SectionShell title="Clinical Details">
        <div className="grid gap-4 xl:grid-cols-2">
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-brand-subtext/70">
              Chief Complaints
            </label>
            <AutoResizeTextarea
              rows={5}
              value={payload.chief_complaints || ""}
              onValueChange={(val) =>
                handleFieldChange("chief_complaints", val)
              }
              onTypingStateChange={(t) => setIsTyping(t)}
              disabled={isFinalized || !canManage}
              placeholder="Patient complaints and presenting symptoms."
              className="rounded-xl"
            />
          </div>
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-brand-subtext/70">
              Diagnosis
            </label>
            <AutoResizeTextarea
              rows={5}
              value={payload.diagnosis || ""}
              onValueChange={(val) =>
                handleFieldChange("diagnosis", val)
              }
              onTypingStateChange={(t) => setIsTyping(t)}
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
              variant="brand"
              size="sm"
              className="rounded-xl shadow-sm"
              onClick={() => {
                hapticPulse();
                addItem();
              }}
            >
              <Plus className="h-4 w-4" />
              Add Medicine
            </Button>
          ) : undefined
        }
      >
        <div className="space-y-3.5">
          {payload.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-brand-bg/10 py-8">
              <p className="text-sm font-medium text-brand-dark">No medicines added</p>
              <p className="mt-1 text-xs text-brand-subtext">Add medicines to this prescription</p>
              {!isFinalized && canManage && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 rounded-xl"
                  onClick={() => {
                    hapticPulse();
                    addItem();
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add first medicine
                </Button>
              )}
            </div>
          ) : (
            payload.items.map((item, index) => (
              <MedicineCard
                key={item._clientId || `medicine-${index}`}
                item={item}
                index={index}
                disabled={isFinalized || !canManage}
                onUpdate={updateItem}
                onDuplicate={duplicateItem}
                onRemove={removeItem}
              />
            ))
          )}
        </div>
        {payload.items.length > 0 && !isFinalized && canManage && (
          <button
            type="button"
            onClick={() => {
              hapticPulse();
              addItem();
            }}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border/60 py-2.5 text-xs font-medium text-brand-subtext transition-colors hover:border-brand/30 hover:text-brand"
          >
            <Plus className="h-3.5 w-3.5" />
            Add another medicine
          </button>
        )}
      </SectionShell>

      {/* Advice */}
      <SectionShell title="Advice / Notes">
        <AutoResizeTextarea
          rows={5}
          value={payload.advice || ""}
          onValueChange={(val) => handleFieldChange("advice", val)}
          onTypingStateChange={(t) => setIsTyping(t)}
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
                  onClick={() => applyTemplate(t)}
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
              onClick={handleSaveTemplate}
              loading={saveTemplatePending}
            >
              Save Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden sm:max-h-[90vh]">
          <DialogHeader className="px-4 py-3 border-b bg-brand-bg/50">
            <DialogTitle>Prescription Preview</DialogTitle>
          </DialogHeader>
          {previewBlobUrl && (
            <iframe src={previewBlobUrl} className="w-full h-[75vh]" />
          )}
          <DialogFooter className="px-4 py-3 border-t bg-brand-bg/50 sm:justify-end">
            <Button onClick={() => setPreviewOpen(false)} variant="outline">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const MedicineCard = React.memo(function MedicineCard({
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
  onUpdate: (index: number, field: keyof RxItem, value: string) => void;
  onDuplicate: (index: number) => void;
  onRemove: (index: number) => void;
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
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          hapticTap();
          setExpanded(!expanded);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
        className="flex w-full cursor-pointer items-center gap-3 px-3 py-4 text-left sm:px-4"
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-[11px] font-bold text-brand">
          {index + 1}
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "truncate text-sm font-semibold",
              hasName ? "text-brand-dark" : "text-brand-subtext/70",
            )}
          >
            {hasName ? item.name : "New Medicine"}
          </p>
          {summary && !expanded && (
            <p className="mt-0.5 truncate text-[11px] text-brand-subtext">{summary}</p>
          )}
        </div>
        {!disabled && (
          <div className="flex items-center gap-1.5 sm:gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                hapticPulse();
                onDuplicate(index);
              }}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-bg/50 text-brand-subtext/70 transition-colors active:scale-90 hover:bg-brand-bg hover:text-brand-dark sm:h-8 sm:w-8"
              title="Duplicate"
            >
              <Copy className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                hapticWarning();
                onRemove(index);
              }}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-50/50 text-red-400 transition-colors active:scale-90 hover:bg-red-50 hover:text-red-600 sm:h-8 sm:w-8"
              title="Remove"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="ml-1 shrink-0">
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-brand-subtext/40" />
          ) : (
            <ChevronDown className="h-4 w-4 text-brand-subtext/40" />
          )}
        </div>
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
            <div className="border-t border-border/40 px-3 pb-4 pt-4 sm:px-4">
              {/* Medicine name + dosage — paired together */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-brand-subtext/70">
                    Medicine name
                  </label>
                  <IsolatedInput
                    value={item.name}
                    onValueChange={(val) => onUpdate(index, "name", val)}
                    disabled={disabled}
                    placeholder="e.g. Paracetamol"
                    className="h-11 rounded-xl scroll-mt-32 sm:h-10 sm:rounded-lg"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-brand-subtext/70">
                    Dosage
                  </label>
                  <IsolatedInput
                    value={item.dosage || ""}
                    onValueChange={(val) => onUpdate(index, "dosage", val)}
                    disabled={disabled}
                    placeholder="e.g. 500mg"
                    className="h-11 rounded-xl scroll-mt-32 sm:h-10 sm:rounded-lg"
                  />
                </div>
              </div>
              {/* Frequency + Duration — paired together */}
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-brand-subtext/70">
                    Frequency
                  </label>
                  <IsolatedInput
                    value={item.frequency || ""}
                    onValueChange={(val) => onUpdate(index, "frequency", val)}
                    disabled={disabled}
                    placeholder="e.g. 1-0-1"
                    className="h-11 rounded-xl scroll-mt-32 sm:h-10 sm:rounded-lg"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-brand-subtext/70">
                    Duration
                  </label>
                  <IsolatedInput
                    value={item.duration || ""}
                    onValueChange={(val) => onUpdate(index, "duration", val)}
                    disabled={disabled}
                    placeholder="e.g. 5 days"
                    className="h-11 rounded-xl scroll-mt-32 sm:h-10 sm:rounded-lg"
                  />
                </div>
              </div>
              {/* Instructions — full width */}
              <div className="mt-4">
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-brand-subtext/70">
                  Instructions
                </label>
                <IsolatedInput
                  value={item.instructions || ""}
                  onValueChange={(val) => onUpdate(index, "instructions", val)}
                  disabled={disabled}
                  placeholder="e.g. After food"
                  className="h-11 rounded-xl scroll-mt-32 sm:h-10 sm:rounded-lg"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.item === nextProps.item &&
    prevProps.index === nextProps.index &&
    prevProps.disabled === nextProps.disabled
  );
});

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
