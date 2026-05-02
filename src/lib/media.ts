"use client";

import type {
  AudioCaptureOptions,
  RoomOptions,
  VideoCaptureOptions,
} from "livekit-client";
import { AudioPresets, VideoPresets } from "livekit-client";

export type CameraFacingMode = "user" | "environment";

const CONSULTATION_VIDEO_PRESET = VideoPresets.h720;

export const LIVEKIT_AUDIO_CAPTURE_OPTIONS: AudioCaptureOptions = {
  autoGainControl: true,
  channelCount: 1,
  echoCancellation: true,
  noiseSuppression: true,
  sampleRate: 48000,
};

export const LIVEKIT_ROOM_OPTIONS: RoomOptions = {
  adaptiveStream: true,
  audioCaptureDefaults: LIVEKIT_AUDIO_CAPTURE_OPTIONS,
  disconnectOnPageLeave: true,
  dynacast: true,
  publishDefaults: {
    audioPreset: AudioPresets.speech,
    degradationPreference: "balanced",
    dtx: true,
    red: true,
    simulcast: true,
    videoCodec: "vp8",
    videoEncoding: CONSULTATION_VIDEO_PRESET.encoding,
    videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360],
  },
  videoCaptureDefaults: {
    frameRate: CONSULTATION_VIDEO_PRESET.encoding.maxFramerate ?? 24,
    resolution: CONSULTATION_VIDEO_PRESET.resolution,
  },
};

const FRONT_CAMERA_TOKENS = ["front", "user", "facetime", "selfie"];
const BACK_CAMERA_TOKENS = ["back", "rear", "environment", "world", "traseira"];

function isLocalhost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

export function getFacingModeLabel(facingMode: CameraFacingMode) {
  return facingMode === "environment" ? "Back camera" : "Front camera";
}

export function buildPreferredVideoConstraints(
  enabled: boolean,
  preferredFacingMode?: CameraFacingMode,
): VideoCaptureOptions | boolean {
  if (!enabled) {
    return false;
  }

  if (!preferredFacingMode) {
    return {
      frameRate: CONSULTATION_VIDEO_PRESET.encoding.maxFramerate ?? 24,
      resolution: CONSULTATION_VIDEO_PRESET.resolution,
    };
  }

  return {
    facingMode: preferredFacingMode,
    frameRate: CONSULTATION_VIDEO_PRESET.encoding.maxFramerate ?? 24,
    resolution: CONSULTATION_VIDEO_PRESET.resolution,
  };
}

export function buildPreferredAudioConstraints(
  enabled: boolean,
): AudioCaptureOptions | boolean {
  return enabled ? LIVEKIT_AUDIO_CAPTURE_OPTIONS : false;
}

function matchesFacingModeLabel(
  label: string,
  preferredFacingMode: CameraFacingMode,
) {
  const normalizedLabel = label.toLowerCase();
  const tokens =
    preferredFacingMode === "environment"
      ? BACK_CAMERA_TOKENS
      : FRONT_CAMERA_TOKENS;

  return tokens.some((token) => normalizedLabel.includes(token));
}

export function getPreferredCameraDevice(
  devices: MediaDeviceInfo[],
  preferredFacingMode: CameraFacingMode,
  currentDeviceId?: string,
) {
  const matchingDevice = devices.find((device) =>
    matchesFacingModeLabel(device.label, preferredFacingMode),
  );

  if (matchingDevice) {
    return matchingDevice;
  }

  const alternativeDevice = devices.find(
    (device) => device.deviceId && device.deviceId !== currentDeviceId,
  );

  return alternativeDevice || devices[0];
}

export function getMediaEnvironmentIssue(): string | null {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return null;
  }

  if (!window.isSecureContext && !isLocalhost(window.location.hostname)) {
    return "Camera and microphone need HTTPS on phones and other non-localhost devices. Open this app through HTTPS or a secure tunnel to use media.";
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    return "This browser cannot access camera or microphone on the current page.";
  }

  return null;
}

export function getMediaDeviceErrorMessage(error: unknown): string {
  const environmentIssue = getMediaEnvironmentIssue();
  if (environmentIssue) {
    return environmentIssue;
  }

  if (error instanceof Error) {
    if (error.name === "NotAllowedError") {
      return "Camera or microphone access was blocked by the browser. Allow access to use media, or continue without it.";
    }
    if (error.name === "NotFoundError") {
      return "Requested device not found on this device.";
    }
    if (error.name === "NotReadableError") {
      return "Your camera or microphone is being used by another application.";
    }
    if (error.name === "AbortError") {
      return "Media setup was interrupted. Try again.";
    }
    if (
      error.name === "TypeError" &&
      error.message.includes("getUserMedia")
    ) {
      return "Camera and microphone are unavailable on this page. On mobile, use HTTPS or a secure tunnel instead of plain LAN HTTP.";
    }
    return error.message;
  }

  return "Unable to access your camera or microphone right now.";
}

function isMissingDeviceError(error: unknown): boolean {
  return error instanceof Error && error.name === "NotFoundError";
}

async function probeMedia(constraints: MediaStreamConstraints) {
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  stream.getTracks().forEach((track) => track.stop());
}

export async function prepareMediaChoices({
  audio,
  video,
  preferredFacingMode,
}: {
  audio: boolean;
  video: boolean;
  preferredFacingMode?: CameraFacingMode;
}) {
  const environmentIssue = getMediaEnvironmentIssue();
  if (environmentIssue && (audio || video)) {
    return {
      audio: false,
      video: false,
      warning: environmentIssue,
    };
  }

  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices?.getUserMedia ||
    (!audio && !video)
  ) {
    return { audio, video, warning: null as string | null };
  }

  const videoConstraints = buildPreferredVideoConstraints(
    video,
    preferredFacingMode,
  );
  const audioConstraints = buildPreferredAudioConstraints(audio);

  try {
    await probeMedia({ audio: audioConstraints, video: videoConstraints });
    return { audio, video, warning: null as string | null };
  } catch (error) {
    if (!isMissingDeviceError(error)) {
      throw error;
    }

    if (audio && video) {
      try {
        await probeMedia({
          audio: buildPreferredAudioConstraints(true),
          video: false,
        });
        return {
          audio: true,
          video: false,
          warning: "No camera detected. Joined with microphone only.",
        };
      } catch {
        try {
          await probeMedia({ audio: false, video: videoConstraints });
          return {
            audio: false,
            video: true,
            warning: "No microphone detected. Joined with camera only.",
          };
        } catch {
          throw error;
        }
      }
    }

    throw error;
  }
}
