"use client";

import { useEffect, useState, useRef, useCallback, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useDoctorAuth } from "@/stores/doctor-auth";
import { usePatientAuth } from "@/stores/patient-auth";
import { PageLoader } from "@/components/loading";
import api, { getRetryAfterSeconds, isRecoverableApiError } from "@/lib/api";

const LOGOUT_CHANNEL = "ehomeo-logout";

interface AuthGuardProps {
  children: ReactNode;
  role: "doctor" | "patient" | "admin";
}

export function broadcastLogout(role: "doctor" | "patient" | "admin") {
  try {
    const bc = new BroadcastChannel(LOGOUT_CHANNEL);
    bc.postMessage({ role });
    bc.close();
  } catch {
    // BroadcastChannel not supported
  }
}

export function AuthGuard({ children, role }: AuthGuardProps) {
  const router = useRouter();

  // Granular selectors — each component re-renders only when its own slice changes.
  // Doctor and patient stores are subscribed independently so a patient-role guard
  // does not re-render when the doctor store updates (and vice versa).
  const doctorIsAuthenticated = useDoctorAuth((s) => s.isAuthenticated);
  const doctorDoctor = useDoctorAuth((s) => s.doctor);
  const doctorSetAuth = useDoctorAuth((s) => s.setAuth);
  const doctorLogout = useDoctorAuth((s) => s.logout);

  const patientIsAuthenticated = usePatientAuth((s) => s.isAuthenticated);
  const patientPatient = usePatientAuth((s) => s.patient);
  const patientSetAuth = usePatientAuth((s) => s.setAuth);
  const patientLogout = usePatientAuth((s) => s.logout);

  // Re-assemble the shape the rest of the function already uses
  const doctorAuth = { isAuthenticated: doctorIsAuthenticated, doctor: doctorDoctor, setAuth: doctorSetAuth, logout: doctorLogout };
  const patientAuth = { isAuthenticated: patientIsAuthenticated, patient: patientPatient, setAuth: patientSetAuth, logout: patientLogout };
  const [checking, setChecking] = useState(true);
  const verifyingRef = useRef(false);
  const retryTimeoutRef = useRef<number | null>(null);

  function clearRetryTimeout() {
    if (retryTimeoutRef.current && typeof window !== "undefined") {
      window.clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }

  const verify = useCallback(async (isInitial: boolean) => {
    if (verifyingRef.current) return;

    function scheduleRetry(error: unknown) {
      if (typeof window === "undefined") return;
      clearRetryTimeout();
      const retryAfterSeconds = getRetryAfterSeconds(error) ?? 5;
      const delayMs = Math.min(Math.max(retryAfterSeconds * 1000, 1000), 30_000);
      retryTimeoutRef.current = window.setTimeout(() => {
        retryTimeoutRef.current = null;
        void verify(false);
      }, delayMs);
    }

    // On initial load, if Zustand already has persisted auth data, show content immediately
    // and verify in background. Skip this for admin since we always need fresh is_admin check.
    if (isInitial && role !== "admin") {
      if (role === "doctor" && doctorAuth.isAuthenticated && doctorAuth.doctor) {
        setChecking(false);
        // Still verify in background, but don't block
        verifyingRef.current = true;
        api.get("/auth/me").then(({ data }) => {
          doctorAuth.setAuth(data);
        }).catch((error) => {
          if (isRecoverableApiError(error)) {
            scheduleRetry(error);
            return;
          }
          doctorAuth.logout();
          router.replace("/doctor/login");
        }).finally(() => { verifyingRef.current = false; });
        return;
      }
      if (role === "patient" && patientAuth.isAuthenticated && patientAuth.patient) {
        setChecking(false);
        verifyingRef.current = true;
        api.get("/patient/auth/me").then(({ data }) => {
          patientAuth.setAuth(data);
        }).catch((error) => {
          if (isRecoverableApiError(error)) {
            scheduleRetry(error);
            return;
          }
          patientAuth.logout();
          router.replace("/patient/login");
        }).finally(() => { verifyingRef.current = false; });
        return;
      }
    }

    verifyingRef.current = true;
    let keepChecking = false;
    try {
      if (role === "doctor" || role === "admin") {
        const { data } = await api.get("/auth/me");
        doctorAuth.setAuth(data);
        if (role === "admin" && !data.is_admin) {
          router.replace("/doctor/dashboard");
          return;
        }
      } else {
        const { data } = await api.get("/patient/auth/me");
        patientAuth.setAuth(data);
      }
    } catch (error) {
      if (isRecoverableApiError(error)) {
        keepChecking = true;
        scheduleRetry(error);
        return;
      }
      if (role === "patient") {
        patientAuth.logout();
        router.replace("/patient/login");
      } else {
        doctorAuth.logout();
        router.replace("/doctor/login");
      }
    } finally {
      verifyingRef.current = false;
      if (!keepChecking) {
        setChecking(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  // Verify on mount
  useEffect(() => {
    verify(true);
  }, [verify]);

  // Re-verify on window focus (but not the initial mount — debounce)
  useEffect(() => {
    function onFocus() {
      verify(false);
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [verify]);

  useEffect(() => {
    return () => clearRetryTimeout();
  }, []);

  // Cross-tab logout
  useEffect(() => {
    let bc: BroadcastChannel;
    try {
      bc = new BroadcastChannel(LOGOUT_CHANNEL);
      bc.onmessage = (event) => {
        const logoutRole = event.data?.role;
        if (
          (logoutRole === "doctor" || logoutRole === "admin") &&
          (role === "doctor" || role === "admin")
        ) {
          doctorAuth.logout();
          router.replace("/doctor/login");
        }
        if (logoutRole === "patient" && role === "patient") {
          patientAuth.logout();
          router.replace("/patient/login");
        }
      };
    } catch {}

    return () => {
      try { bc?.close(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  if (checking) return <PageLoader />;

  if (role === "doctor" || role === "admin") {
    if (!doctorAuth.isAuthenticated) return <PageLoader />;
    if (role === "admin" && !doctorAuth.doctor?.is_admin) return <PageLoader />;
  }

  if (role === "patient" && !patientAuth.isAuthenticated) {
    return <PageLoader />;
  }

  return <>{children}</>;
}
