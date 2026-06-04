import { create } from "zustand";
import type { Room } from "livekit-client";

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
export type UiPhase = 'prejoin' | 'connecting' | 'incall' | 'reconnecting' | 'ended';

export interface CallStore {
  room: Room | null;
  connectionState: ConnectionState;
  uiPhase: UiPhase;
  remoteJoined: boolean;
  error: string | null;
  callStartedAt: number | null;
  appointmentId: string | null;

  _setRoom: (room: Room | null) => void;
  _setConnectionState: (state: ConnectionState) => void;
  _setUiPhase: (phase: UiPhase) => void;
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
  _setRemoteJoined: (remoteJoined) => set({ remoteJoined }),
  _setError: (error) => set({ error }),
  _setCallStartedAt: (callStartedAt) => set({ callStartedAt }),
  _setAppointmentId: (appointmentId) => set({ appointmentId }),

  reset: () => set(initialState),
}));
