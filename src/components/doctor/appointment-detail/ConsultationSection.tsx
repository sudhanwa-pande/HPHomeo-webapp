import React from "react";
import { useRouter } from "next/navigation";
import { MapPin, FileText, Video, MonitorPlay } from "lucide-react";
import { SectionShell } from "./shared";
import { Button } from "@/components/ui/button";
import { ConsultationCallPanel } from "@/components/doctor/consultation-call-panel";
import { hapticPulse } from "@/lib/haptics";
import type { DoctorAppointmentDetail } from "@/types/doctor";

export function ConsultationSection({
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
  // persistently outside AnimatePresence, so we just show quick actions here.
  if (callPanelRenderedOutside) {
    return (
      <div className="mt-4 space-y-4">
        {/* Quick action buttons */}
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

        {/* Mobile FAB: "Write Rx" floats at the bottom for quick mode-switch */}
        <div className="fixed bottom-6 right-4 z-40 sm:hidden">
          <button
            type="button"
            onClick={() => {
              hapticPulse();
              onOpenPrescription();
            }}
            className="flex h-14 items-center gap-2 rounded-2xl bg-brand px-5 text-sm font-semibold text-white shadow-[0_8px_28px_rgba(88,155,255,0.35)] transition-transform active:scale-95"
          >
            <FileText className="h-5 w-5" />
            Write Rx
          </button>
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
