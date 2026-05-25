import { createLocalTracks, LocalVideoTrack, LocalAudioTrack, Room } from "livekit-client";
import type { CreateLocalTracksOptions } from "livekit-client";
import { logEvent } from "@/lib/logger";

class MediaManager {
  private static instance: MediaManager;
  public videoTrack: LocalVideoTrack | null = null;
  public audioTrack: LocalAudioTrack | null = null;
  public videoDeviceId?: string;
  public audioDeviceId?: string;
  private acquiringPromise: Promise<{
    video: LocalVideoTrack | null;
    audio: LocalAudioTrack | null;
  }> | null = null;
  private trackRestartAttempts = 0;

  private constructor() {
    if (typeof document !== "undefined") {
      this.setupVisibilityRecovery();
    }
  }

  static getInstance() {
    if (!MediaManager.instance) MediaManager.instance = new MediaManager();
    return MediaManager.instance;
  }

  async acquireTracks(videoDeviceId?: string, audioDeviceId?: string) {
    if (this.acquiringPromise) return this.acquiringPromise;

    this.acquiringPromise = (async () => {
      const startTime = Date.now();
      try {
        const needNewVideo =
          !this.videoTrack || (videoDeviceId && this.videoDeviceId !== videoDeviceId);
        const needNewAudio =
          !this.audioTrack || (audioDeviceId && this.audioDeviceId !== audioDeviceId);

        if (needNewVideo && this.videoTrack) {
          this.videoTrack.stop();
          this.videoTrack = null;
        }
        if (needNewAudio && this.audioTrack) {
          this.audioTrack.stop();
          this.audioTrack = null;
        }

        const trackReqs: CreateLocalTracksOptions = {
          video: needNewVideo
            ? {
                deviceId: videoDeviceId ? { exact: videoDeviceId } : undefined,
                facingMode: videoDeviceId ? undefined : "user",
                resolution: { width: 1280, height: 720, frameRate: 30 },
              }
            : false,
          audio: needNewAudio
            ? {
                deviceId: audioDeviceId ? { exact: audioDeviceId } : undefined,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              }
            : false,
        };

        if (trackReqs.video || trackReqs.audio) {
          const tracks = await createLocalTracks(trackReqs);
          for (const t of tracks) {
            if (t instanceof LocalVideoTrack) {
              this.videoTrack = t;
              this.videoDeviceId = videoDeviceId;
              this.setupTrackListeners(t);
            }
            if (t instanceof LocalAudioTrack) {
              this.audioTrack = t;
              this.audioDeviceId = audioDeviceId;
            }
          }
        }

        logEvent("media_acquired", { ms: Date.now() - startTime });
        return { video: this.videoTrack, audio: this.audioTrack };
      } catch (err) {
        logEvent("media_acquisition_failed", { error: String(err) });
        throw err;
      } finally {
        this.acquiringPromise = null;
      }
    })();

    return this.acquiringPromise;
  }

  private setupTrackListeners(track: LocalVideoTrack) {
    // Recovers if OS revokes permission mid-call or device is physically unplugged
    track.mediaStreamTrack.addEventListener("ended", async () => {
      this.trackRestartAttempts++;
      logEvent("track_restart", {
        attempts: this.trackRestartAttempts,
        reason: "ended_event",
      });
      try {
        await track.restartTrack();
      } catch (err) {
        logEvent("track_restart_failed", { error: String(err) });
      }
    });
  }

  async setAudioOutput(deviceId: string) {
    // Ensures audio routing to earpiece vs speaker on mobile
    if (typeof document === "undefined") return;
    const elements = document.querySelectorAll<HTMLMediaElement>("audio, video");
    for (const el of Array.from(elements)) {
      if (typeof (el as any).setSinkId === "function") {
        try {
          await (el as any).setSinkId(deviceId);
        } catch (err) {
          logEvent("set_sink_id_failed", { error: String(err) });
        }
      }
    }
  }

  async flipCamera(room?: Room) {
    if (!this.videoTrack) return;
    const currentFacingMode = this.videoTrack.mediaStreamTrack.getSettings().facingMode;
    const nextMode = currentFacingMode === "environment" ? "user" : "environment";
    logEvent("camera_flipped", { to: nextMode });

    try {
      await this.videoTrack.restartTrack({ facingMode: nextMode });
    } catch (err) {
      logEvent("camera_flip_failed", { error: String(err) });
    }
  }

  private setupVisibilityRecovery() {
    document.addEventListener("visibilitychange", async () => {
      if (document.visibilityState === "visible") {
        const track = this.videoTrack?.mediaStreamTrack;
        // True iOS zombie track detection
        if (track && track.readyState !== "live") {
          this.trackRestartAttempts++;
          logEvent("track_restart", {
            attempts: this.trackRestartAttempts,
            reason: "ios_visibility_recovery",
          });
          try {
            await this.videoTrack?.restartTrack();
          } catch (err) {
            logEvent("track_restart_failed", { error: String(err) });
          }
        }
      }
    });
  }

  cleanup() {
    this.videoTrack?.stop();
    this.audioTrack?.stop();
    this.videoTrack = null;
    this.audioTrack = null;
    this.videoDeviceId = undefined;
    this.audioDeviceId = undefined;
    this.trackRestartAttempts = 0;
  }
}

export const mediaManager = MediaManager.getInstance();
