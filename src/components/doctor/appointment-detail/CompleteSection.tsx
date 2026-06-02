import React from "react";
import { CheckCircle2, Sparkles, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionShell } from "./shared";
import { formatDateTime } from "./utils";
import { Button } from "@/components/ui/button";
import type { DoctorAppointmentDetail } from "@/types/doctor";

export function CompleteSection({
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
          <div className="mt-6 rounded-2xl border border-border/60 bg-gradient-to-br from-emerald-50/50 to-white p-4 sm:p-6">
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
                  className="mt-4 w-full rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 sm:w-auto"
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
    <div className="flex items-start gap-2.5">
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
