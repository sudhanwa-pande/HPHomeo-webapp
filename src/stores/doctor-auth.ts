import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Doctor } from "@/types/auth";

interface DoctorAuthState {
  doctor: Doctor | null;
  isAuthenticated: boolean;

  setAuth: (doctor: Doctor) => void;
  setDoctor: (doctor: Doctor) => void;
  logout: () => void;
}

export const useDoctorAuth = create<DoctorAuthState>()(
  persist(
    (set) => ({
      doctor: null,
      isAuthenticated: false,

      setAuth: (doctor) => {
        set((state) => ({
          doctor: state.doctor
            ? {
                ...state.doctor,
                ...doctor,
                // Use cached photo only when the API omits the field (undefined),
                // not when it explicitly clears it (null = photo was deleted).
                profile_photo: doctor.profile_photo !== undefined
                  ? doctor.profile_photo
                  : state.doctor.profile_photo ?? null,
                profile_complete: doctor.profile_complete ?? state.doctor.profile_complete,
              }
            : doctor,
          isAuthenticated: true,
        }));
      },

      setDoctor: (doctor) => set({ doctor }),

      logout: () => {
        set({ doctor: null, isAuthenticated: false });
      },
    }),
    {
      name: "doctor-auth",
      // Only persist the minimum needed to render the UI shell while the
      // real /auth/me check runs. Sensitive fields (email, phone,
      // registration_no, is_admin) are excluded from localStorage.
      partialize: (state) => ({
        doctor: state.doctor
          ? {
              id: state.doctor.id,
              full_name: state.doctor.full_name,
              profile_complete: state.doctor.profile_complete,
              profile_photo: state.doctor.profile_photo,
              verification_status: state.doctor.verification_status,
            }
          : null,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
