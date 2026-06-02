import React from "react";
import { format, parseISO } from "date-fns";
import { SectionShell, InfoLabel } from "./shared";
import { formatDateOnly } from "./utils";
import { AppointmentTimeline } from "@/components/appointment/appointment-timeline";
import { StarRating } from "@/components/appointment/star-rating";
import { StatusBadge } from "@/components/doctor/ui";
import type { DoctorAppointmentDetail, DoctorAppointment } from "@/types/doctor";

export function OverviewSection({
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
