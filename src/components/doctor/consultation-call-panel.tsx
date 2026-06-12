"use client";

import { useEffect, useState } from "react";
import { motion, useDragControls } from "framer-motion";
import { LiveKitRoom } from "@livekit/components-react";
import {
  Camera,
  CameraOff,
  GripHorizontal,
  Maximize2,
  Mic,
  MicOff,
  Phone,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { useQueryState, parseAsStringLiteral } from "nuqs";

import { hapticTap } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import {
  LIVEKIT_ROOM_OPTIONS,
  buildPreferredAudioConstraints,
  buildPreferredVideoConstraints,
  type CameraFacingMode,
} from "@/lib/media";
import { useWakeLock } from "@/hooks/use-wake-lock";
import { usePiPEngine } from "@/hooks/use-pip-engine";
import { useCallSession } from "@/hooks/use-call-session";

import { LiveCallRoom } from "@/components/call/live-call-room";
import { ConnectionObserver } from "@/components/call/connection-observer";
import { DoctorConsultationWorkspace } from "./consultation-workspace";
import type { DoctorAppointmentDetail } from "@/types/doctor";

export function ConsultationCallPanel({
  appointmentId,
  appointment,
  minimized = false,
  onMaximize,
  onMinimize,
}: {
  appointmentId: string;
  appointment: DoctorAppointmentDetail;
  minimized?: boolean;
  onMaximize?: () => void;
  onMinimize?: () => void;
}) {
  const session = useCallSession(appointmentId, appointment);
  const pip = usePiPEngine(minimized);

  const [isFullScreen, setIsFullScreen] = useState(false);
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useQueryState(
    "tab",
    parseAsStringLiteral(["notes", "info", "chat"] as const).withDefault(
      "notes",
    ),
  );
  const [preferredFacingMode, setPreferredFacingMode] =
    useState<CameraFacingMode>("user");

  useWakeLock(!!session.tokenData);

  // Intercept back button for Full Screen mode
  useEffect(() => {
    if (typeof window === "undefined" || !isFullScreen) return;

    // Push a dummy state so the back button can be trapped
    window.history.pushState({ fullscreen: true }, "", window.location.href);

    const handlePopState = () => setIsFullScreen(false);

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [isFullScreen]);

  // View Routing Layer
  if (!session.canStartConsultation) {
    if (minimized) return null;
    return <ConsultationUnavailable />;
  }

  if (minimized && !session.tokenData) {
    if (session.callEnded) return null;
    return <ConsultationFloatingFAB session={session} />;
  }

  if (!session.tokenData) {
    return <ConsultationPreJoin appointment={appointment} session={session} />;
  }

  return (
    <ActiveCallView
      appointmentId={appointmentId}
      appointment={appointment}
      minimized={minimized}
      onMaximize={onMaximize}
      onMinimize={onMinimize}
      session={session}
      pip={pip}
      isFullScreen={isFullScreen}
      setIsFullScreen={setIsFullScreen}
      activeWorkspaceTab={activeWorkspaceTab}
      setActiveWorkspaceTab={setActiveWorkspaceTab}
      preferredFacingMode={preferredFacingMode}
      setPreferredFacingMode={setPreferredFacingMode}
    />
  );
}

// ─── UI Layers ────────────────────────────────────────────────────────

function ConsultationUnavailable() {
  return (
    <section className="rounded-2xl border border-gray-200/60 bg-white p-5">
      <p className="text-sm font-semibold text-gray-900">
        Consultation workspace
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-gray-500">
        Video consultation is available only for confirmed online appointments.
      </p>
    </section>
  );
}

function ConsultationFloatingFAB({
  session,
}: {
  session: ReturnType<typeof useCallSession>;
}) {
  return (
    <div className="fixed bottom-24 right-4 z-[999] sm:bottom-6 sm:right-6">
      <button
        type="button"
        onClick={() => {
          hapticTap();
          void session.joinCall();
        }}
        disabled={session.joining}
        className="flex h-14 items-center gap-2 rounded-full bg-brand px-5 text-sm font-bold text-white shadow-[0_8px_32px_rgba(88,155,255,0.3)] transition-transform hover:-translate-y-0.5 hover:shadow-[0_12px_40px_rgba(88,155,255,0.4)] active:scale-95 disabled:opacity-70 disabled:hover:translate-y-0"
      >
        {session.joining ? (
          <span className="flex items-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            Joining...
          </span>
        ) : (
          <>
            <Phone className="h-5 w-5" />
            Join Call
          </>
        )}
      </button>
    </div>
  );
}

function ConsultationPreJoin({
  appointment,
  session,
}: {
  appointment: DoctorAppointmentDetail;
  session: ReturnType<typeof useCallSession>;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200/60 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
        <div>
          <p className="text-sm font-semibold text-gray-900">
            Consultation workspace
          </p>
          <p className="mt-0.5 text-[11px] text-gray-400">
            Video and chat in one place
          </p>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[10px] font-semibold",
            session.callEnded
              ? "bg-gray-100 text-gray-500"
              : "bg-brand/[0.06] text-brand",
          )}
        >
          {session.callEnded ? "Ended" : "Ready"}
        </span>
      </div>

      <div className="bg-[#050505] p-5 text-white">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-lg font-bold">{appointment.patient.full_name}</p>
            <p className="mt-1 text-xs text-white/50">
              {format(
                parseISO(appointment.scheduled_at),
                "EEE, dd MMM yyyy - hh:mm a",
              )}
            </p>
          </div>
          <div className="rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white/80 backdrop-blur-md shadow-sm">
            {appointment.call_status === "waiting" ||
            appointment.call_status === "connected" ||
            appointment.call_status === "disconnected"
              ? "Resume ready"
              : "Ready to join"}
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() =>
              session.setMediaPreferences((c) => ({ ...c, video: !c.video }))
            }
            className={cn(
              "flex flex-1 items-center gap-3 rounded-[1.2rem] border px-4 py-3.5 transition-all duration-200",
              session.mediaPreferences.video
                ? "border-brand/30 bg-brand/10 shadow-[0_4px_16px_rgba(88,155,255,0.1)]"
                : "border-white/10 bg-white/5 hover:bg-white/10",
            )}
          >
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full transition-colors",
                session.mediaPreferences.video
                  ? "bg-brand text-white"
                  : "bg-white/10 text-white/50",
              )}
            >
              {session.mediaPreferences.video ? (
                <Camera className="h-4 w-4" />
              ) : (
                <CameraOff className="h-4 w-4" />
              )}
            </div>
            <div className="flex-1 text-left">
              <span className="block text-sm font-semibold text-white">
                Camera
              </span>
              <span className="block text-[11px] font-medium text-white/50">
                {session.mediaPreferences.video ? "Enabled" : "Disabled"}
              </span>
            </div>
          </button>
          <button
            type="button"
            onClick={() =>
              session.setMediaPreferences((c) => ({ ...c, audio: !c.audio }))
            }
            className={cn(
              "flex flex-1 items-center gap-3 rounded-[1.2rem] border px-4 py-3.5 transition-all duration-200",
              session.mediaPreferences.audio
                ? "border-brand/30 bg-brand/10 shadow-[0_4px_16px_rgba(88,155,255,0.1)]"
                : "border-white/10 bg-white/5 hover:bg-white/10",
            )}
          >
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full transition-colors",
                session.mediaPreferences.audio
                  ? "bg-brand text-white"
                  : "bg-white/10 text-white/50",
              )}
            >
              {session.mediaPreferences.audio ? (
                <Mic className="h-4 w-4" />
              ) : (
                <MicOff className="h-4 w-4" />
              )}
            </div>
            <div className="flex-1 text-left">
              <span className="block text-sm font-semibold text-white">
                Microphone
              </span>
              <span className="block text-[11px] font-medium text-white/50">
                {session.mediaPreferences.audio ? "Enabled" : "Disabled"}
              </span>
            </div>
          </button>
        </div>

        {session.joinError && (
          <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {session.joinError}
          </div>
        )}

        <button
          type="button"
          onClick={() => void session.joinCall()}
          disabled={session.joining}
          className="mt-4 flex w-full h-12 items-center justify-center gap-2 rounded-xl bg-brand font-bold text-white transition-all hover:bg-brand/90 active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100"
        >
          {session.joining ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Starting connection...
            </span>
          ) : (
            <>
              <Phone className="h-5 w-5" />
              {session.consultationLabel}
            </>
          )}
        </button>
      </div>
    </section>
  );
}

function ActiveCallView({
  appointmentId,
  appointment,
  minimized,
  onMaximize,
  onMinimize,
  session,
  pip,
  isFullScreen,
  setIsFullScreen,
  activeWorkspaceTab,
  setActiveWorkspaceTab,
  preferredFacingMode,
  setPreferredFacingMode,
}: {
  appointmentId: string;
  appointment: DoctorAppointmentDetail;
  minimized?: boolean;
  onMaximize?: () => void;
  onMinimize?: () => void;
  session: ReturnType<typeof useCallSession>;
  pip: ReturnType<typeof usePiPEngine>;
  isFullScreen: boolean;
  setIsFullScreen: (val: boolean) => void;
  activeWorkspaceTab: "notes" | "info" | "chat";
  setActiveWorkspaceTab: any;
  preferredFacingMode: CameraFacingMode;
  setPreferredFacingMode: (val: CameraFacingMode) => void;
}) {
  const dragControls = useDragControls();

  if (!session.tokenData) return null;

  return (
    <div style={{ display: "contents" }}>
      <LiveKitRoom
        key={appointmentId}
        serverUrl={session.tokenData.server_url}
        token={session.tokenData.token}
        connect
        audio={buildPreferredAudioConstraints(session.mediaPreferences.audio)}
        video={buildPreferredVideoConstraints(
          session.mediaPreferences.video,
          "user",
        )}
        options={LIVEKIT_ROOM_OPTIONS}
        onMediaDeviceFailure={session.handleMediaDeviceFailure}
        onDisconnected={session.handleDisconnected}
        style={{ display: "contents" }}
      >
        <ConnectionObserver />

        <motion.div
          role="dialog"
          aria-label="Video call window"
          drag={minimized}
          dragMomentum={false}
          dragElastic={0.05}
          dragConstraints={pip.dragConstraints}
          onDragStart={pip.onDragStart}
          onDragEnd={pip.onDragEnd}
          onClick={() => minimized && pip.peek()}
          initial={false}
          animate={
            minimized
              ? {
                  width: pip.pipWidth,
                  height: pip.pipHeight,
                  opacity: pip.mode === "keyboard" ? 0.9 : 1,
                  scale: pip.mode === "dragging" ? 1.04 : 1,
                  boxShadow:
                    pip.mode === "dragging"
                      ? "0 32px 64px rgba(0,0,0,0.7)"
                      : "0 8px 32px rgba(0,0,0,0.3)",
                }
              : {
                  width: "100%",
                  opacity: 1,
                  scale: 1,
                }
          }
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className={cn(
            minimized
              ? "fixed z-[1000] overflow-hidden rounded-2xl border touch-manipulation " +
                  (pip.mode === "dragging"
                    ? "cursor-grabbing border-brand/40 ring-2 ring-brand/20 shadow-[0_32px_64px_rgba(0,0,0,0.7)] bg-[#111113]/90 backdrop-blur-md"
                    : "border-white/10 " +
                      (pip.mode === "keyboard"
                        ? "bg-[#111113]/95 backdrop-blur-none shadow-lg"
                        : "bg-[#111113]/90 backdrop-blur-md shadow-2xl"))
              : isFullScreen
                ? "fixed inset-0 z-[100] bg-app-bg"
                : "relative overflow-hidden rounded-2xl border border-gray-200/60 bg-app-bg shadow-sm transition-all duration-300 h-[60vh] min-h-[400px] max-h-[700px] sm:aspect-[16/10] sm:h-auto flex flex-col",
          )}
          style={
            minimized
              ? {
                  top: pip.dragConstraints.top,
                  left: pip.dragConstraints.left,
                }
              : undefined
          }
        >
          {minimized && (
            <div
              role="slider"
              aria-label="Drag to reposition video"
              aria-valuenow={0}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                dragControls.start(e);
              }}
              className={cn(
                "absolute inset-x-0 top-0 z-[1001] flex h-10 touch-none select-none items-center justify-between bg-gradient-to-b from-black/60 to-transparent px-3 transition-opacity duration-300",
                pip.mode === "dragging" || pip.mode === "keyboard"
                  ? "opacity-100"
                  : "opacity-0 hover:opacity-100",
                pip.mode === "dragging" ? "cursor-grabbing" : "cursor-grab",
              )}
            >
              <GripHorizontal className="h-4 w-4 shrink-0 text-white/60 drop-shadow-md" />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  hapticTap();
                  if (onMaximize) onMaximize();
                }}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-md hover:bg-white/30 pointer-events-auto"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            </div>
          )}

          <LiveCallRoom
            title={appointment.patient?.full_name ?? "Video consultation"}
            subtitle={format(
              parseISO(appointment.scheduled_at),
              "EEE, dd MMM yyyy - hh:mm a",
            )}
            remoteLabel={appointment.patient?.full_name ?? "Patient"}
            remoteWaitingTitle={
              appointment.patient?.full_name
                ? `Waiting for ${appointment.patient.full_name}`
                : "Waiting for patient"
            }
            remoteWaitingDescription="The patient will appear here when they join the consultation room."
            onLeave={() => session.endCallMutation.mutate()}
            onBack={() => {
              setIsFullScreen(false);
              if (onMinimize) onMinimize();
            }}
            endLabel="Leave consultation"
            endLoading={session.endCallMutation.isPending}
            allowScreenShare
            allowCameraSwitch
            preferredFacingMode={preferredFacingMode}
            onFacingModeChange={setPreferredFacingMode}
            showWorkspaceLayout={!minimized}
            workspaceActiveTab={activeWorkspaceTab}
            onWorkspaceTabChange={setActiveWorkspaceTab}
            isFullScreenLayout={isFullScreen}
            isPiP={minimized}
            onToggleFullScreen={() => {
              if (!isFullScreen) setIsFullScreen(true);
              else {
                setIsFullScreen(false);
                if (onMinimize) onMinimize();
              }
            }}
            workspaceContent={
              <DoctorConsultationWorkspace
                appointmentId={appointmentId}
                appointment={appointment}
                activeTab={activeWorkspaceTab}
                onTabChange={setActiveWorkspaceTab}
              />
            }
          />
        </motion.div>
      </LiveKitRoom>
    </div>
  );
}
