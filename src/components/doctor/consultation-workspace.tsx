"use client";

import React, { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { 
  FileText, 
  User, 
  MessageSquare, 
  Plus, 
  Copy, 
  Trash2, 
  ChevronDown, 
  ChevronUp, 
  Eye, 
  Loader2, 
  Check, 
  CheckCircle2, 
  Send,
  Calendar,
  Clock,
  Phone,
  Mail,
  ShieldAlert,
  UserCheck,
  Sparkles,
  X
} from "lucide-react";
import { useChat, useRoomContext } from "@livekit/components-react";
import { motion, AnimatePresence } from "framer-motion";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { hapticTap, hapticPulse, hapticWarning, hapticSuccess } from "@/lib/haptics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePrescriptionForm } from "@/components/doctor/appointment-detail/PrescriptionFormContext";
import type { DoctorAppointment, DoctorAppointmentDetail, RxItem } from "@/types/doctor";

interface DoctorConsultationWorkspaceProps {
  appointmentId: string;
  appointment: DoctorAppointmentDetail;
  activeTab: "notes" | "info" | "chat";
  onTabChange: (tab: "notes" | "info" | "chat") => void;
  onClose?: () => void;
}

export function DoctorConsultationWorkspace({
  appointmentId,
  appointment,
  activeTab,
  onTabChange,
  onClose,
}: DoctorConsultationWorkspaceProps) {
  const patientId = appointment.patient.id;

  // Fetch patient medical history
  const { data: patientHistory = [] } = useQuery({
    queryKey: ["doctor-patient-history", patientId],
    queryFn: async () => {
      const { data } = await api.get<{ appointments: DoctorAppointment[] }>(
        "/doctor/appointments/range",
        { params: { from: "2020-01-01", to: format(new Date(), "yyyy-MM-dd"), patient_id: patientId, limit: 6 } },
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

  return (
    <div className="flex h-full flex-col bg-panel text-white border-l border-call-border">
      {/* Workspace Tabs */}
      <div className="flex items-center justify-between border-b border-white/[0.06] bg-black/20 p-1.5 shrink-0">
        <div className="flex flex-1 gap-1">
          <TabButton
            active={activeTab === "notes"}
            onClick={() => onTabChange("notes")}
            icon={FileText}
            label="Prescription"
          />
          <TabButton
            active={activeTab === "info"}
            onClick={() => onTabChange("info")}
            icon={User}
            label="Patient Info"
          />
          <TabButton
            active={activeTab === "chat"}
            onClick={() => onTabChange("chat")}
            icon={MessageSquare}
            label="Chat"
          />
        </div>
        {onClose && (
          <button
            onClick={() => {
              hapticTap();
              onClose();
            }}
            className="ml-2 flex h-8 w-8 items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-white/50 hover:text-white border border-call-border interactive"
            title="Close Panel"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Tab Contents */}
      <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-5">
        <AnimatePresence mode="wait">
          {activeTab === "notes" && (
            <motion.div
              key="notes"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="space-y-5"
            >
              <PrescriptionFormTab appointment={appointment} />
            </motion.div>
          )}

          {activeTab === "info" && (
            <motion.div
              key="info"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="space-y-4"
            >
              <PatientInfoTab appointment={appointment} history={patientHistory} />
            </motion.div>
          )}

          {activeTab === "chat" && (
            <motion.div
              key="chat"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="h-full"
            >
              <ChatTab />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ───────────────── Tab Button ───────────────── */

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof FileText;
  label: string;
}) {
  return (
    <button
      onClick={() => {
        hapticTap();
        onClick();
      }}
      className={cn(
        "flex flex-1 items-center justify-center gap-2 rounded-xl py-2 px-3 text-xs font-semibold tracking-tight interactive",
        active
          ? "bg-white/[0.08] text-white border border-call-border shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
          : "text-white/40 hover:text-white/60 hover:bg-white/[0.02]"
      )}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </button>
  );
}

/* ───────────────── Prescription Tab ───────────────── */

function PrescriptionFormTab({ appointment }: { appointment: DoctorAppointmentDetail }) {
  const {
    payload,
    isFinalized,
    canManage,
    hasUnsavedChanges,
    autoSaveStatus,
    templates,
    finalizePending,
    previewPending,
    handleFieldChange,
    updateItem,
    addItem,
    duplicateItem,
    removeItem,
    handleFinalize,
    handleTogglePreview,
    applyTemplate,
    setIsTyping,
  } = usePrescriptionForm();

  return (
    <div className="space-y-4">
      {/* Auto-Save & Actions bar */}
      <div className="flex items-center justify-between rounded-xl bg-white/[0.02] border border-call-border p-3 shadow-inner">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            {autoSaveStatus === "saving" ? (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-state-waiting opacity-75" />
            ) : null}
            <span className={cn(
              "relative inline-flex h-2 w-2 rounded-full",
              autoSaveStatus === "saved" ? "bg-state-live" : autoSaveStatus === "saving" ? "bg-state-waiting" : "bg-white/20"
            )} />
          </span>
          <span className="text-[11px] font-medium text-white/50">
            {autoSaveStatus === "saving" ? "Saving draft..." : autoSaveStatus === "saved" ? "Draft saved" : hasUnsavedChanges ? "Unsaved changes" : "Sync complete"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleTogglePreview}
            loading={previewPending}
            className="h-8 rounded-lg text-xs font-bold text-white/70 hover:text-white hover:bg-white/5"
          >
            <Eye className="h-3.5 w-3.5" />
            Preview
          </Button>
          <Button
            size="sm"
            onClick={handleFinalize}
            loading={finalizePending}
            disabled={isFinalized || !canManage}
            className="h-8 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white border-none shadow-sm"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {isFinalized ? "Finalized" : "Finalize"}
          </Button>
        </div>
      </div>

      {/* Templates Selector */}
      {templates.length > 0 && !isFinalized && (
        <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-3 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-white/30 flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-brand" />
            Apply Prescription Template
          </p>
          <div className="flex flex-wrap gap-1.5">
            {templates.slice(0, 3).map((t) => (
              <button
                key={t.id}
                onClick={() => applyTemplate(t)}
                className="rounded-lg bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] hover:border-white/[0.12] px-2.5 py-1 text-xs font-medium text-white/80 transition-all cursor-pointer active:scale-95"
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Chief Complaints & Diagnosis */}
      <div className="space-y-4">
        <div>
          <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-white/30">
            Chief Complaints
          </label>
          <textarea
            value={payload.chief_complaints || ""}
            onChange={(e) => handleFieldChange("chief_complaints", e.target.value)}
            onFocus={() => setIsTyping(true)}
            onBlur={() => setIsTyping(false)}
            disabled={isFinalized || !canManage}
            rows={3}
            placeholder="Symptoms reported by patient..."
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-brand/40 focus:ring-1 focus:ring-brand/30 transition-all leading-relaxed"
          />
        </div>

        <div>
          <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-white/30">
            Diagnosis
          </label>
          <textarea
            value={payload.diagnosis || ""}
            onChange={(e) => handleFieldChange("diagnosis", e.target.value)}
            onFocus={() => setIsTyping(true)}
            onBlur={() => setIsTyping(false)}
            disabled={isFinalized || !canManage}
            rows={3}
            placeholder="Clinical diagnosis..."
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-brand/40 focus:ring-1 focus:ring-brand/30 transition-all leading-relaxed"
          />
        </div>
      </div>

      {/* Medicines List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between border-t border-white/[0.06] pt-4">
          <label className="text-[10px] font-bold uppercase tracking-widest text-white/30">
            Medicines (Rx)
          </label>
          {!isFinalized && canManage && (
            <button
              onClick={() => {
                hapticPulse();
                addItem();
              }}
              className="flex items-center gap-1.5 rounded-lg bg-brand/10 hover:bg-brand/15 border border-brand/20 px-2.5 py-1 text-xs font-bold text-brand transition-all cursor-pointer active:scale-95 shadow-sm"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Medicine
            </button>
          )}
        </div>

        <div className="space-y-2.5">
          {payload.items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.01] p-6 text-center">
              <p className="text-xs text-white/40 font-medium">No medicines added yet</p>
              {!isFinalized && canManage && (
                <button
                  onClick={addItem}
                  className="mt-3 text-xs font-bold text-brand hover:underline"
                >
                  Add first item
                </button>
              )}
            </div>
          ) : (
            payload.items.map((item, index) => (
              <MedicineWorkspaceCard
                key={item._clientId || `rx-${index}`}
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
      </div>

      {/* Advice */}
      <div className="border-t border-white/[0.06] pt-4">
        <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-white/30">
          Advice / Instructions
        </label>
        <textarea
          value={payload.advice || ""}
          onChange={(e) => handleFieldChange("advice", e.target.value)}
          onFocus={() => setIsTyping(true)}
          onBlur={() => setIsTyping(false)}
          disabled={isFinalized || !canManage}
          rows={3}
          placeholder="Precautions, diet, or lifestyle advice..."
          className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-brand/40 focus:ring-1 focus:ring-brand/30 transition-all leading-relaxed"
        />
      </div>
    </div>
  );
}

/* ───────────────── Patient Info Tab ───────────────── */

function PatientInfoTab({
  appointment: apt,
  history,
}: {
  appointment: DoctorAppointmentDetail;
  history: DoctorAppointment[];
}) {
  return (
    <div className="space-y-5">
      {/* Contact Details Card */}
      <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-4 space-y-4 shadow-sm backdrop-blur-sm">
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 flex items-center gap-1.5">
          <UserCheck className="h-3.5 w-3.5 text-brand" />
          Patient Information
        </p>
        <div className="grid grid-cols-2 gap-3 text-xs leading-relaxed">
          <div className="col-span-2 flex justify-between items-center border-b border-white/[0.04] pb-2">
            <span className="text-white/40">Full Name</span>
            <span className="font-semibold text-white/95">{apt.patient.full_name}</span>
          </div>
          <div className="flex justify-between items-center border-b border-white/[0.04] pb-2">
            <span className="text-white/40">Age</span>
            <span className="font-semibold text-white/95">{apt.patient.age ? `${apt.patient.age}y` : "-"}</span>
          </div>
          <div className="flex justify-between items-center border-b border-white/[0.04] pb-2">
            <span className="text-white/40">Sex</span>
            <span className="font-semibold text-white/95">{apt.patient.sex || "-"}</span>
          </div>
          <div className="col-span-2 flex items-center justify-between gap-3 border-b border-white/[0.04] pb-2">
            <span className="text-white/40 flex items-center gap-1 shrink-0"><Phone className="h-3 w-3" /> Phone</span>
            <span className="font-semibold text-white/80 truncate">{apt.patient.phone || "-"}</span>
          </div>
          <div className="col-span-2 flex items-center justify-between gap-3 pb-1">
            <span className="text-white/40 flex items-center gap-1 shrink-0"><Mail className="h-3 w-3" /> Email</span>
            <span className="font-semibold text-white/80 truncate">{apt.patient.email || "-"}</span>
          </div>
        </div>
      </div>

      {/* Patient Notes */}
      {apt.patient.notes && (
        <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-4 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />
            Patient Clinical Notes
          </p>
          <p className="text-xs leading-relaxed text-white/70 bg-black/20 rounded-xl p-3 border border-white/[0.04]">
            {apt.patient.notes}
          </p>
        </div>
      )}

      {/* Medical History */}
      <div className="space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">
          Previous Visits ({history.length})
        </p>
        {history.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.01] p-5 text-center text-xs text-white/30">
            No previous records found.
          </div>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {history.map((h) => (
              <div
                key={h.appointment_id}
                className="flex items-center justify-between rounded-xl border border-white/[0.05] bg-white/[0.02] p-3 text-xs"
              >
                <div className="flex flex-col gap-1">
                  <span className="font-semibold text-white/85">
                    {format(parseISO(h.scheduled_at), "dd MMM yyyy")}
                  </span>
                  <span className="text-[10px] text-white/40 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {format(parseISO(h.scheduled_at), "hh:mm a")}
                  </span>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={cn(
                    "inline-block text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border shadow-inner",
                    h.status === "completed" 
                      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
                      : "bg-white/[0.04] border-white/[0.06] text-white/50"
                  )}>
                    {h.status}
                  </span>
                  {h.prescription_status === "final" && (
                    <span className="text-[9px] text-emerald-500 font-bold tracking-tight">Rx Saved</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────────────── Chat Tab ───────────────── */

function ChatTab() {
  const [messageText, setMessageText] = useState("");
  const { chatMessages, send, isSending } = useChat();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const handleSend = async () => {
    const text = messageText.trim();
    if (!text || isSending) return;
    hapticTap();
    await send(text);
    setMessageText("");
  };

  return (
    <div className="flex h-[calc(100vh-140px)] flex-col">
      {/* Messages Area */}
      <div 
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto px-1 py-2 pr-2"
      >
        {chatMessages.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/[0.06] p-6 text-center text-xs text-white/30 leading-relaxed">
            No messages yet. Messages stay in this secure session.
          </div>
        ) : (
          chatMessages.map((msg, index) => {
            const isLocal = msg.from?.isLocal;
            return (
              <div
                key={`${msg.timestamp}-${index}`}
                className={cn("flex", isLocal ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-sm",
                    isLocal
                      ? "bg-brand text-white shadow-brand/10"
                      : "bg-white/[0.07] border border-white/[0.03] text-white/90"
                  )}
                >
                  <p className={cn(
                    "mb-0.5 text-[9px] font-bold opacity-60",
                    isLocal ? "text-white/60" : "text-white/30"
                  )}>
                    {isLocal ? "You" : msg.from?.name || "Patient"}
                  </p>
                  <p className="break-words">{msg.message}</p>
                  <p className={cn(
                    "mt-1 text-[8px] text-right font-medium opacity-50",
                    isLocal ? "text-white/60" : "text-white/40"
                  )}>
                    {new Intl.DateTimeFormat("en-US", { timeStyle: "short" }).format(new Date(msg.timestamp))}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Input Area */}
      <div className="border-t border-white/[0.06] pt-3 bg-[#161618] shrink-0">
        <div className="flex gap-2">
          <Input
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder="Type a message..."
            className="h-10 rounded-xl border-white/[0.08] bg-white/[0.04] text-xs text-white placeholder:text-white/20 focus-visible:ring-brand/30"
          />
          <button
            onClick={handleSend}
            disabled={!messageText.trim() || isSending}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand hover:bg-brand/90 text-white transition-all active:scale-95 disabled:opacity-40 cursor-pointer"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────── Workspace Medicine Card ───────────────── */

const MedicineWorkspaceCard = React.memo(function MedicineWorkspaceCard({
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
        "rounded-xl border transition-all duration-150 overflow-hidden",
        expanded
          ? "border-brand/20 bg-white/[0.02]"
          : "border-call-border bg-white/[0.01] hover:border-white/[0.1]"
      )}
    >
      <div
        onClick={() => {
          hapticTap();
          setExpanded(!expanded);
        }}
        className="flex w-full cursor-pointer items-center gap-3 px-3 py-3 text-left"
      >
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-brand/10 text-[10px] font-bold text-brand shadow-inner">
          {index + 1}
        </div>
        <div className="min-w-0 flex-1">
          <p className={cn(
            "truncate text-xs font-semibold",
            hasName ? "text-white/90" : "text-white/30"
          )}>
            {hasName ? item.name : "New Medicine"}
          </p>
          {summary && !expanded && (
            <p className="mt-0.5 truncate text-[10px] text-white/40">{summary}</p>
          )}
        </div>
        
        {!disabled && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                hapticPulse();
                onDuplicate(index);
              }}
              className="flex h-7 w-7 items-center justify-center rounded bg-white/5 text-white/60 transition active:scale-90 hover:bg-white/10 hover:text-white"
              title="Duplicate"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                hapticWarning();
                onRemove(index);
              }}
              className="flex h-7 w-7 items-center justify-center rounded bg-red-500/10 text-red-400 transition active:scale-90 hover:bg-red-500/20 hover:text-red-300"
              title="Remove"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div className="shrink-0 text-white/20">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="overflow-hidden border-t border-white/[0.04] bg-black/10"
          >
            <div className="p-3 space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-white/30">
                    Medicine name
                  </label>
                  <input
                    value={item.name}
                    onChange={(e) => onUpdate(index, "name", e.target.value)}
                    disabled={disabled}
                    placeholder="e.g. Paracetamol"
                    className="w-full h-9 rounded-lg border border-call-border bg-white/[0.04] px-3 text-xs text-white placeholder:text-white/10 focus-ring transition-all"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-white/30">
                    Dosage
                  </label>
                  <input
                    value={item.dosage || ""}
                    onChange={(e) => onUpdate(index, "dosage", e.target.value)}
                    disabled={disabled}
                    placeholder="e.g. 500mg"
                    className="w-full h-9 rounded-lg border border-call-border bg-white/[0.04] px-3 text-xs text-white placeholder:text-white/10 focus-ring transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-white/30">
                    Frequency
                  </label>
                  <input
                    value={item.frequency || ""}
                    onChange={(e) => onUpdate(index, "frequency", e.target.value)}
                    disabled={disabled}
                    placeholder="e.g. 1-0-1"
                    className="w-full h-9 rounded-lg border border-call-border bg-white/[0.04] px-3 text-xs text-white placeholder:text-white/10 focus-ring transition-all"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-white/30">
                    Duration
                  </label>
                  <input
                    value={item.duration || ""}
                    onChange={(e) => onUpdate(index, "duration", e.target.value)}
                    disabled={disabled}
                    placeholder="e.g. 5 days"
                    className="w-full h-9 rounded-lg border border-call-border bg-white/[0.04] px-3 text-xs text-white placeholder:text-white/10 focus-ring transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-white/30">
                  Instructions
                </label>
                <input
                  value={item.instructions || ""}
                  onChange={(e) => onUpdate(index, "instructions", e.target.value)}
                  disabled={disabled}
                  placeholder="e.g. After food"
                  className="w-full h-9 rounded-lg border border-call-border bg-white/[0.04] px-3 text-xs text-white placeholder:text-white/10 focus-ring transition-all"
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
