import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PatientUser } from "@/types/auth";

interface PatientAuthState {
  patient: PatientUser | null;
  isAuthenticated: boolean;

  setAuth: (patient: PatientUser) => void;
  setPatient: (patient: PatientUser) => void;
  logout: () => void;
}

export const usePatientAuth = create<PatientAuthState>()(
  persist(
    (set) => ({
      patient: null,
      isAuthenticated: false,

      setAuth: (patient) => {
        set({ patient, isAuthenticated: true });
      },

      setPatient: (patient) => set({ patient }),

      logout: () => {
        set({ patient: null, isAuthenticated: false });
      },
    }),
    {
      name: "patient-auth",
      // Only persist the minimum needed to render the UI shell while the
      // real /patient/auth/me check runs. Email is excluded from localStorage.
      partialize: (state) => ({
        patient: state.patient
          ? {
              patient_user_id: state.patient.patient_user_id,
              full_name: state.patient.full_name,
            }
          : null,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
