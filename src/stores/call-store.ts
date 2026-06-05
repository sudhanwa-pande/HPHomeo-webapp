import { create } from "zustand";
import type { Room } from "livekit-client";

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
export type UiPhase = 'prejoin' | 'connecting' | 'incall' | 'reconnecting' | 'ended';

export type CallState = 
  | 'idle'
  | 'preview_ready'
  | 'connecting'
  | 'connected'
  | 'publishing'
  | 'incall'
  | 'reconnecting'
  | 'ended';

export interface CallStore {
  room: Room | null;
  connectionState: ConnectionState;
  uiPhase: UiPhase;
  callState: CallState;
  remoteJoined: boolean;
  error: string | null;
  callStartedAt: number | null;
  appointmentId: string | null;

  _setRoom: (room: Room | null) => void;
  _setConnectionState: (state: ConnectionState) => void;
  _setUiPhase: (phase: UiPhase) => void;
  _setCallState: (state: CallState) => void;
  _setRemoteJoined: (joined: boolean) => void;
  _setError: (error: string | null) => void;
  _setCallStartedAt: (ts: number | null) => void;
  _setAppointmentId: (id: string | null) => void;

  reset: () => void;
}

const initialState = {
  room: null,
  connectionState: 'idle' as ConnectionState,
  uiPhase: 'prejoin' as UiPhase,
  callState: 'idle' as CallState,
  remoteJoined: false,
  error: null,
  callStartedAt: null,
  appointmentId: null,
};

export const useCallStore = create<CallStore>((set) => ({
  ...initialState,

  _setRoom: (room) => set({ room }),
  _setConnectionState: (connectionState) => set({ connectionState }),
  _setUiPhase: (uiPhase) => set({ uiPhase }),
  _setCallState: (callState) => set((state) => {
    // FSM transition validator table
    const transitions: Record<CallState, CallState[]> = {
      'idle': ['preview_ready', 'connecting', 'ended'],
      'preview_ready': ['connecting', 'ended'],
      'connecting': ['connected', 'ended'],
      'connected': ['publishing', 'incall', 'reconnecting', 'ended'],
      'publishing': ['incall', 'ended'],
      'incall': ['reconnecting', 'ended'],
      'reconnecting': ['connected', 'incall', 'ended'],
      'ended': ['idle', 'connecting', 'preview_ready'],
    };

    const prev = state.callState;

    // Reject regression transitions unless resetting to idle or transitioning to ended
    if (callState !== 'ended' && callState !== 'idle' && prev !== callState) {
      const allowed = transitions[prev];
      if (!allowed || !allowed.includes(callState)) {
        console.warn(`[CallStore] Invalid state transition rejected: ${prev} -> ${callState}`);
        return {};
      }
    }

    let uiPhase = state.uiPhase;
    let connectionState = state.connectionState;

    if (callState === 'idle' || callState === 'preview_ready') {
      uiPhase = 'prejoin';
      connectionState = 'idle';
    } else if (callState === 'connecting') {
      uiPhase = 'connecting';
      connectionState = 'connecting';
    } else if (callState === 'connected' || callState === 'publishing') {
      uiPhase = 'connecting';
      connectionState = 'connected';
    } else if (callState === 'incall') {
      uiPhase = 'incall';
      connectionState = 'connected';
    } else if (callState === 'reconnecting') {
      uiPhase = 'reconnecting';
      connectionState = 'reconnecting';
    } else if (callState === 'ended') {
      uiPhase = 'ended';
      connectionState = 'disconnected';
    }

    console.log(`[CallState Transition] ${prev} -> ${callState} (derived uiPhase: ${uiPhase}, connectionState: ${connectionState})`);

    return { callState, uiPhase, connectionState };
  }),
  _setRemoteJoined: (remoteJoined) => set({ remoteJoined }),
  _setError: (error) => set({ error }),
  _setCallStartedAt: (callStartedAt) => set({ callStartedAt }),
  _setAppointmentId: (appointmentId) => set({ appointmentId }),

  reset: () => set(initialState),
}));
