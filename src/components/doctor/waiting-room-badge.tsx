"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Phone, PhoneCall, User, X, Clock } from "lucide-react";
import { format } from "date-fns";

import api from "@/lib/api";
import type { CallsDashboardResponse, CallsDashboardItem } from "@/types/doctor";

export function WaitingRoomBadge() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);
  const today = format(new Date(), "yyyy-MM-dd");

  const { data: waiting } = useQuery({
    queryKey: ["doctor-calls-dashboard", today],
    queryFn: async () => {
      const { data } = await api.get<CallsDashboardResponse>(
        "/doctor/calls/dashboard",
        { params: { day: today } },
      );
      return data.waiting;
    },
    refetchInterval: false, // SSE handles updates
  });

  const count = waiting?.length ?? 0;

  // Play a sound / vibrate when a new patient starts waiting
  useEffect(() => {
    let timeoutId: number | undefined;

    if (count > prevCountRef.current && prevCountRef.current >= 0) {
      // Browser notification (if permission granted)
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification("Patient Waiting", {
          body: `${waiting?.[0]?.patient_name ?? "A patient"} is waiting for your call.`,
          icon: "/images/logo.png",
        });
      }
      timeoutId = window.setTimeout(() => setOpen(true), 0);
    }
    prevCountRef.current = count;
    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [count, waiting]);

  // Request notification permission on mount
  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Close popover when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (count === 0) {
    return (
      <button
        className="relative p-2 rounded-xl text-brand-subtext hover:bg-brand-bg hover:text-brand-dark transition-colors"
        title="No patients waiting"
      >
        <PhoneCall className="h-5 w-5" />
      </button>
    );
  }

  return (
    <div className="relative" ref={popoverRef}>
      {/* Bell button with count badge */}
      <button
        onClick={() => setOpen(!open)}
        className="relative rounded-xl p-1.5 text-brand-dark transition-colors hover:bg-brand-bg"
        title="Patients waiting for call"
      >
        <PhoneCall className="h-4.5 w-4.5 animate-[ring_0.5s_ease-in-out_infinite_alternate]" />
        <span className="absolute -top-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white">
          {count}
        </span>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-xl border border-border/30 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-border/20 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-brand" />
              <span className="text-[13px] font-semibold text-brand-dark">
                Patients Waiting
              </span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-1 rounded-lg hover:bg-brand-bg text-brand-subtext"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="max-h-64 overflow-y-auto divide-y divide-border/10">
            {waiting?.map((patient) => (
              <div
                key={patient.appointment_id}
                className="px-3 py-2.5 transition-colors hover:bg-brand-bg/50"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                    <User className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-[13px] font-medium text-brand-dark">
                      {patient.patient_name || "Patient"}
                    </p>
                    <div className="flex items-center gap-2 text-[10px] text-brand-subtext">
                      <span className="flex items-center gap-0.5">
                        <Clock className="h-2.5 w-2.5" />
                        {patient.scheduled_at
                          ? new Date(patient.scheduled_at).toLocaleTimeString("en-IN", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "â€”"}
                      </span>
                      <span className="flex h-1 w-1 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-emerald-600 font-medium">Waiting</span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setOpen(false);
                      router.push(
                        `/doctor/call/${patient.appointment_id}`
                      );
                    }}
                    className="flex shrink-0 items-center gap-1 rounded-lg bg-emerald-500 px-2.5 py-1.5 text-[10px] font-semibold text-white transition-colors hover:bg-emerald-600"
                  >
                    <Phone className="h-3 w-3" />
                    Join
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* View appointments link */}
          <div className="border-t border-border/20 px-3 py-2">
            <button
              onClick={() => {
                setOpen(false);
                router.push("/doctor/appointments");
              }}
              className="w-full text-center text-xs font-medium text-brand hover:underline"
            >
              View appointments →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

