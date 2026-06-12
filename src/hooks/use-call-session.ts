"use client";

import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { callSession } from "@/lib/call-session";
import { prepareMediaChoices, getMediaDeviceErrorMessage } from "@/lib/media";
import { hapticSuccess, hapticPulse } from "@/lib/haptics";
import {
  notifyInfo,
  notifyError,
  notifyApiError,
  notifySuccess,
} from "@/lib/notify";
import type {
  DoctorAppointmentDetail,
  VideoTokenResponse,
} from "@/types/doctor";

export type MediaPreferences = {
  audio: boolean;
  video: boolean;
};

export function useCallSession(
  appointmentId: string,
  appointment: DoctorAppointmentDetail,
) {
  const queryClient = useQueryClient();
  const [tokenData, setTokenData] = useState<VideoTokenResponse | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [callEnded, setCallEnded] = useState(false);
  const callEndedRef = useRef(false);

  const [mediaPreferences, setMediaPreferences] = useState<MediaPreferences>({
    audio: true,
    video: true,
  });

  const joinAbortRef = useRef<AbortController | null>(null);

  const joinCall = async (options?: Partial<MediaPreferences>) => {
    if (joinAbortRef.current) return;
    const controller = new AbortController();
    joinAbortRef.current = controller;

    const wantsAudio = options?.audio ?? mediaPreferences.audio;
    const wantsVideo = options?.video ?? mediaPreferences.video;
    setJoining(true);
    setJoinError(null);

    try {
      const prepared = await prepareMediaChoices({
        audio: wantsAudio,
        video: wantsVideo,
        preferredFacingMode: "user",
      });
      setMediaPreferences({ audio: prepared.audio, video: prepared.video });
      if (prepared.warning)
        notifyInfo("Joining with available devices", prepared.warning);

      const { data } = await api.post<VideoTokenResponse>(
        `/doctor/appointments/${appointmentId}/video-token`,
        { session_id: callSession.getSessionId() },
        { signal: controller.signal },
      );

      if (data.epoch !== undefined) {
        callSession.updateEpoch(data.epoch);
      }
      if (data.session_id && data.session_id !== callSession.getSessionId()) {
        await callSession.destroy();
        callSession.resetSessionId(data.session_id);
      }

      hapticSuccess();
      setCallEnded(false);
      callEndedRef.current = false;
      setTokenData(data);
    } catch (error: any) {
      if (
        controller.signal.aborted ||
        error.name === "AbortError" ||
        error.name === "CanceledError"
      )
        return;

      const message = getMediaDeviceErrorMessage(error);
      setJoinError(message);
      if (
        error instanceof Error &&
        [
          "NotAllowedError",
          "NotFoundError",
          "NotReadableError",
          "AbortError",
        ].includes(error.name)
      ) {
        notifyError("Couldn't start media", message);
      } else {
        notifyApiError(error, "Couldn't start call");
      }
    } finally {
      joinAbortRef.current = null;
      setJoining(false);
    }
  };

  useEffect(() => {
    return () => {
      joinAbortRef.current?.abort();
    };
  }, []);

  const endCallMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/doctor/appointments/${appointmentId}/call/end`);
    },
    onSuccess: async () => {
      hapticPulse();
      notifySuccess("Call ended", "The consultation session has been closed.");
      callEndedRef.current = true;
      setCallEnded(true);
      setTokenData(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["doctor-waiting"] }),
        queryClient.invalidateQueries({ queryKey: ["doctor-appointments"] }),
        queryClient.invalidateQueries({
          queryKey: ["doctor-appointment-detail", appointmentId],
        }),
      ]);
    },
    onError: (error) => notifyApiError(error, "Couldn't end call"),
  });

  const handleMediaDeviceFailure = (_failure?: unknown, kind?: string) => {
    const message =
      kind === "audioinput"
        ? "Microphone access failed. You can stay in the call muted."
        : "Camera access failed. You can stay in the call without video.";
    setJoinError(message);
    notifyError("Media access issue", message);
  };

  const handleDisconnected = () => {
    if (callEndedRef.current) return;
    setJoinError("Connection dropped. Rejoin the consultation to continue.");
  };

  const canStartConsultation =
    appointment.mode === "online" &&
    appointment.video_enabled &&
    appointment.status === "confirmed" &&
    appointment.call_status !== "ended";

  const consultationLabel =
    appointment.call_status === "waiting" ||
    appointment.call_status === "connected" ||
    appointment.call_status === "disconnected"
      ? "Continue consultation"
      : "Start consultation";

  return {
    tokenData,
    joining,
    joinError,
    callEnded,
    mediaPreferences,
    setMediaPreferences,
    joinCall,
    endCallMutation,
    handleMediaDeviceFailure,
    handleDisconnected,
    canStartConsultation,
    consultationLabel,
    setTokenData,
  };
}
