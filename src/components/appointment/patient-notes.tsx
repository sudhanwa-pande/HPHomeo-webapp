"use client";

import { useState, useRef, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  MessageSquareText,
  Check,
  Loader2,
  Send,
  Info,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import api, { getApiError } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { cn } from "@/lib/utils";

interface PatientNotesProps {
  appointmentId: string;
  initialNotes?: string | null;
  readOnly?: boolean;
  className?: string;
}

export function PatientNotes({
  appointmentId,
  initialNotes,
  readOnly = false,
  className,
}: PatientNotesProps) {
  const [notes, setNotes] = useState(initialNotes || "");
  const [savedNotes, setSavedNotes] = useState(initialNotes || "");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">(
    "idle",
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const maxLength = 500;

  const hasChanges = notes !== savedNotes;

  const saveMutation = useMutation({
    mutationFn: async (text: string) => {
      setSaveStatus("saving");
      await api.put(`/patient/appointments/${appointmentId}/notes`, {
        notes: text.trim(),
      });
    },
    onSuccess: () => {
      setSavedNotes(notes);
      setSaveStatus("saved");
      notifySuccess("Notes saved", "Your doctor will see these notes.");
      setTimeout(() => setSaveStatus("idle"), 3000);
    },
    onError: (error) => {
      setSaveStatus("idle");
      notifyError("Couldn't save notes", getApiError(error));
    },
  });

  const handleSave = useCallback(() => {
    if (!hasChanges || saveMutation.isPending) return;
    saveMutation.mutate(notes);
  }, [notes, hasChanges, saveMutation]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleSave();
      }
    },
    [handleSave],
  );

  // Read-only display
  if (readOnly) {
    if (!notes) return null;
    return (
      <div
        className={cn(
          "rounded-2xl border border-gray-200/60 bg-white p-5",
          className,
        )}
      >
        <div className="flex items-center gap-2 mb-3">
          <MessageSquareText className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">
            Your Notes
          </h3>
        </div>
        <div className="rounded-xl bg-gray-50 p-3.5 text-sm leading-relaxed text-gray-700 ring-1 ring-gray-100">
          {notes}
        </div>
      </div>
    );
  }

  // Editable
  return (
    <div
      className={cn(
        "rounded-2xl border border-gray-200/60 bg-white p-5",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <MessageSquareText className="h-4 w-4 text-brand" />
          <h3 className="text-sm font-semibold text-gray-900">
            Notes for Your Doctor
          </h3>
        </div>
        {saveStatus === "saved" && (
          <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
            <Check className="h-3 w-3" />
            Saved
          </span>
        )}
      </div>

      {/* Helper text */}
      <p className="mb-3 text-xs text-gray-400">
        Describe your symptoms, concerns, or anything you&apos;d like the doctor to know beforehand.
      </p>

      {/* Textarea */}
      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={maxLength}
          placeholder="e.g. Persistent headache for 3 days, mild fever in the evenings..."
          className="min-h-[110px] resize-none rounded-xl border-gray-200 bg-gray-50/50 pr-4 text-sm leading-relaxed placeholder:text-gray-300 focus:bg-white focus:ring-brand/20"
        />
      </div>

      {/* Footer: char count + save button */}
      <div className="mt-2.5 flex items-center justify-between">
        <span className="text-[11px] text-gray-400">
          {notes.length}/{maxLength}
        </span>

        <div className="flex items-center gap-2">
          {hasChanges && (
            <span className="text-[11px] text-amber-500">Unsaved changes</span>
          )}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges || saveMutation.isPending}
            className="h-8 gap-1.5 rounded-lg bg-brand px-3 text-xs font-medium hover:bg-brand/90 disabled:opacity-40"
          >
            {saveMutation.isPending ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Send className="h-3 w-3" />
                Save Notes
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Info note about doctor visibility */}
      <div className="mt-3 flex items-start gap-2 rounded-xl bg-blue-50/60 px-3.5 py-2.5 ring-1 ring-blue-100/50">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-400" />
        <p className="text-[11px] leading-relaxed text-blue-600/80">
          Your doctor will see these notes before the consultation.
          You can update them anytime until the appointment starts.
        </p>
      </div>
    </div>
  );
}
