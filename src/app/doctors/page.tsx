"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar,
  Clock,
  Search,
  Shield,
  Stethoscope,
  Sun,
  Sunset,
  Moon,
  User,
  X,
  Briefcase,
  Languages,
  GraduationCap,
  MapPin,
} from "lucide-react";

import api from "@/lib/api";
import { Navbar } from "@/components/layout/navbar";
import { Skeleton } from "@/components/loading";
import type { PublicDoctor } from "@/types/patient";

/* ─── Constants ─── */

/* ─── Helpers ─── */

function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatSlotTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function getInitials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

/** Returns dynamic month label like "November, 2026" or "November - December, 2026" */
function getMonthRangeLabel(dates: Date[]): string {
  if (dates.length === 0) return "";
  const first = dates[0];
  const last = dates[dates.length - 1];
  const firstMonth = first.toLocaleDateString("en-US", { month: "long" });
  const lastMonth = last.toLocaleDateString("en-US", { month: "long" });
  const firstYear = first.getFullYear();
  const lastYear = last.getFullYear();

  if (firstYear !== lastYear) {
    return `${firstMonth}, ${firstYear} - ${lastMonth}, ${lastYear}`;
  }
  if (firstMonth !== lastMonth) {
    return `${firstMonth} - ${lastMonth}, ${firstYear}`;
  }
  return `${firstMonth}, ${firstYear}`;
}

function formatBookingDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });
}

function groupSlotsByPeriod(slots: string[]) {
  const morning: string[] = [];
  const afternoon: string[] = [];
  const evening: string[] = [];

  for (const slot of slots) {
    const hour = new Date(slot).getHours();
    if (hour < 12) morning.push(slot);
    else if (hour < 17) afternoon.push(slot);
    else evening.push(slot);
  }

  return [
    { label: "Morning", icon: Sun, items: morning },
    { label: "Afternoon", icon: Sunset, items: afternoon },
    { label: "Evening", icon: Moon, items: evening },
  ];
}

function DoctorProfileCard({ doctor }: { doctor: PublicDoctor }) {
  return (
    <motion.div
      key={doctor.doctor_id}
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      className="rounded-3xl bg-white overflow-hidden shadow-sm border border-gray-100/80 p-5"
    >
      <div className="flex justify-center">
        <div className="h-44 w-44 rounded-2xl bg-gray-100 overflow-hidden">
          {doctor.profile_photo ? (
            <img
              src={doctor.profile_photo}
              alt={doctor.full_name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand to-blue-600 text-4xl font-bold text-white">
              {getInitials(doctor.full_name)}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 text-center">
        <h3 className="type-h3">{doctor.full_name}</h3>
        {doctor.specialization && (
          <p className="text-xs text-brand-subtext mt-0.5">{doctor.specialization}</p>
        )}
        {doctor.registration_no && (
          <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-brand-accent/30 border border-brand-accent/60 px-3 py-1">
            <Shield className="h-3 w-3 text-brand-dark" />
            <span className="text-[10px] font-semibold text-brand-dark">
              Reg. No: {doctor.registration_no}
            </span>
          </div>
        )}
      </div>

      {doctor.about && (
        <div className="mt-4 rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-semibold text-brand-dark mb-1.5">Biography</p>
          <p className="text-xs text-brand-subtext leading-relaxed">{doctor.about}</p>
        </div>
      )}

      <div className="mt-4 space-y-2.5">
        {doctor.experience_years && (
          <div className="flex items-center gap-2.5 text-xs">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand/8">
              <Briefcase className="h-3.5 w-3.5 text-brand" />
            </div>
            <span className="text-brand-subtext">
              <span className="font-semibold text-brand-dark">{doctor.experience_years}</span>{" "}
              years experience
            </span>
          </div>
        )}
        {doctor.qualifications && doctor.qualifications.length > 0 && (
          <div className="flex items-center gap-2.5 text-xs">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-50">
              <GraduationCap className="h-3.5 w-3.5 text-purple-500" />
            </div>
            <span className="text-brand-subtext">{doctor.qualifications.join(", ")}</span>
          </div>
        )}
        {doctor.languages && doctor.languages.length > 0 && (
          <div className="flex items-center gap-2.5 text-xs">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50">
              <Languages className="h-3.5 w-3.5 text-amber-500" />
            </div>
            <span className="text-brand-subtext">{doctor.languages.join(", ")}</span>
          </div>
        )}
        {doctor.clinic_name && (
          <div className="flex items-center gap-2.5 text-xs">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50">
              <MapPin className="h-3.5 w-3.5 text-emerald-500" />
            </div>
            <span className="text-brand-subtext">
              {doctor.clinic_name}
              {doctor.city ? `, ${doctor.city}` : ""}
            </span>
          </div>
        )}
      </div>

      {doctor.available_modes && doctor.available_modes.length > 0 && (
        <div className="mt-4 rounded-xl bg-gray-50 p-3 ring-1 ring-gray-100">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-subtext/60 mb-2">
            Consultation Fees
          </p>
          <div className="flex gap-3">
            {doctor.available_modes.includes("online") && doctor.online_fee != null && (
              <div className="flex-1 text-center rounded-lg bg-white p-2 ring-1 ring-gray-100">
                <p className="text-[10px] text-brand-subtext">Online</p>
                <p className="text-sm font-bold text-brand-dark">₹{doctor.online_fee}</p>
              </div>
            )}
            {doctor.available_modes.includes("walk_in") && doctor.walkin_fee != null && (
              <div className="flex-1 text-center rounded-lg bg-white p-2 ring-1 ring-gray-100">
                <p className="text-[10px] text-brand-subtext">Walk-in</p>
                <p className="text-sm font-bold text-brand-dark">₹{doctor.walkin_fee}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}

function getDoctorFee(doc: PublicDoctor): string {
  const modes = doc.available_modes || [];
  if (modes.includes("online") && doc.online_fee != null) {
    if (modes.includes("walk_in") && doc.walkin_fee != null) {
      const min = Math.min(doc.online_fee, doc.walkin_fee);
      return `₹${min}`;
    }
    return `₹${doc.online_fee}`;
  }
  if (modes.includes("walk_in") && doc.walkin_fee != null) {
    return `₹${doc.walkin_fee}`;
  }
  return "₹0";
}

/* ─── Types ─── */

interface DoctorsListResponse {
  count: number;
  doctors: PublicDoctor[];
}

interface SlotsResponse {
  doctor_id: string;
  day: string;
  slots: string[];
}

/* ═══════════════════════════════════════════════════════
   Main Page
   ═══════════════════════════════════════════════════════ */

export default function FindDoctorPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedDoctor, setSelectedDoctor] = useState<PublicDoctor | null>(null);
  const [mobileProfileOpen, setMobileProfileOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);


  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  /* ─── Queries ─── */

  const { data: doctorsData, isLoading: doctorsLoading } = useQuery({
    queryKey: ["public", "doctors", debouncedSearch],
    queryFn: async ({ signal }) => {
      const params: Record<string, string> = { limit: "50" };
      if (debouncedSearch.trim()) params.q = debouncedSearch.trim();
      const { data } = await api.get<DoctorsListResponse>("/public/doctors", { params, signal });
      return data;
    },
  });

  const doctors = doctorsData?.doctors || [];

  const dateString = toDateString(selectedDate);
  const { data: slotsData, isLoading: slotsLoading } = useQuery({
    queryKey: ["public", "doctor", selectedDoctor?.doctor_id, "slots", dateString],
    queryFn: async () => {
      const { data } = await api.get<SlotsResponse>(
        `/public/doctors/${selectedDoctor!.doctor_id}/slots`,
        { params: { day: dateString } }
      );
      return data;
    },
    enabled: !!selectedDoctor,
  });

  const slots = slotsData?.slots || [];

  const dateOptions = useMemo(() => {
    const dates: Date[] = [];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      dates.push(d);
    }
    return dates;
  }, []);

  const monthLabel = getMonthRangeLabel(dateOptions);

  /* ─── Event handlers ─── */

  const selectDoctor = useCallback(
    (doc: PublicDoctor) => {
      setSelectedDoctor(doc);
      setSelectedSlot(null);
      setSelectedDate(new Date());
    },
    []
  );

  // Auto-select the first doctor when data loads
  useEffect(() => {
    if (doctors.length > 0 && !selectedDoctor) {
      selectDoctor(doctors[0]);
    }
  }, [doctors, selectedDoctor, selectDoctor]);

  /* ═══════════════════════════════════════════════════════
     Render
     ═══════════════════════════════════════════════════════ */

  return (
    <div className="min-h-screen bg-brand-bg">
      <Navbar />

      <main className="container-main py-8">
        {/* ═══ Page layout: Left (main) + Right (doctor profile) ═══ */}
        <div className="flex gap-6 lg:flex-row flex-col">
          {/* ─── Left column ─── */}
          <div className="flex-1 min-w-0 space-y-5">
            {/* Heading + Search */}
            <div>
              <h1 className="type-h1 mb-1">Book a consultation</h1>
              <p className="text-sm text-brand-subtext">Choose a doctor, pick a slot, and book in minutes.</p>
            </div>

            <div className="relative">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-subtext/40" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, specialization, or city..."
                className="w-full rounded-2xl border border-gray-200/80 bg-white py-3 pl-11 pr-4 text-sm text-brand-dark placeholder:text-brand-subtext/40 shadow-sm focus:border-brand/40 focus:outline-none focus:ring-4 focus:ring-brand/8 transition-all"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-brand-subtext/40 hover:text-brand-dark"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* ═══ Card: Choose doctor (scrollable grid) ═══ */}
            <div className="rounded-2xl bg-white p-5 shadow-sm border border-gray-100/80">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-brand-subtext">Choose doctor</p>
                {doctors.length > 0 && (
                  <span className="text-xs text-brand-subtext/60">{doctors.length} available</span>
                )}
              </div>

              {doctorsLoading ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="flex gap-3 items-center rounded-xl border border-gray-200/60 p-3"
                    >
                      <Skeleton className="h-14 w-14 rounded-xl" />
                      <div className="space-y-2 flex-1">
                        <Skeleton className="h-3.5 w-28" />
                        <Skeleton className="h-3 w-20" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : doctors.length === 0 ? (
                <div className="rounded-xl bg-gray-50 py-10 text-center">
                  <Stethoscope className="mx-auto mb-2 h-8 w-8 text-brand-subtext/25" />
                  <p className="text-sm font-medium text-brand-subtext">No doctors found</p>
                  <p className="text-xs text-brand-subtext/60 mt-0.5">
                    Try a different search term
                  </p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 max-h-[360px] overflow-y-auto pr-1">
                  {doctors.map((doc) => {
                    const isSelected = selectedDoctor?.doctor_id === doc.doctor_id;
                    return (
                      <button
                        key={doc.doctor_id}
                        onClick={() => {
                          selectDoctor(doc);
                          setMobileProfileOpen(true);
                        }}
                        className={`flex gap-3 items-center rounded-xl border-2 p-3 text-left transition-all duration-200 ${
                          isSelected
                            ? "border-brand bg-brand/3 shadow-md shadow-brand/8"
                            : "border-gray-200/60 bg-white hover:border-brand/20 hover:shadow-sm"
                        }`}
                      >
                        {doc.profile_photo ? (
                          <img
                            src={doc.profile_photo}
                            alt={doc.full_name}
                            className="h-14 w-14 shrink-0 rounded-xl object-cover bg-gray-50"
                          />
                        ) : (
                          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-blue-600 text-sm font-bold text-white">
                            {getInitials(doc.full_name)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-brand-dark truncate">
                            {doc.full_name}
                          </p>
                          {doc.specialization && (
                            <p className="text-xs text-brand-subtext truncate mt-0.5">
                              {doc.specialization}
                            </p>
                          )}
                          <p className="mt-1 text-xs font-bold text-brand">
                            {getDoctorFee(doc)}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ═══ Card: Choose date and time ═══ */}
            <div className="rounded-2xl bg-white p-5 shadow-sm border border-gray-100/80">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-brand-subtext">Choose date and time</p>
                <div className="flex items-center gap-1.5 text-xs font-medium text-brand-dark">
                  <Calendar className="h-3.5 w-3.5 text-brand" />
                  {monthLabel}
                </div>
              </div>

              <div className="h-px bg-gray-200/80 mb-4" />

              {/* 7-day date picker with Today label */}
              <div className="flex gap-0 mb-5">
                {dateOptions.map((date, idx) => {
                  const isSelected = date.toDateString() === selectedDate.toDateString();
                  const dayLabel = idx === 0
                    ? "Today"
                    : date.toLocaleDateString("en-US", { weekday: "short" });
                  return (
                    <button
                      key={date.toISOString()}
                      onClick={() => {
                        setSelectedDate(date);
                        setSelectedSlot(null);
                      }}
                      className="flex flex-1 flex-col items-center py-2 transition-all duration-200"
                    >
                      <span className={`text-[11px] mb-1 ${idx === 0 ? "font-semibold text-brand" : "text-brand-subtext"}`}>
                        {dayLabel}
                      </span>
                      <span
                        className={`flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold transition-all ${
                          isSelected
                            ? "bg-brand text-white shadow-md shadow-brand/20"
                            : "text-brand-dark hover:bg-gray-100"
                        }`}
                      >
                        {date.getDate()}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Time slots grouped by period */}
              {selectedDoctor ? (
                slotsLoading ? (
                  <div className="flex flex-wrap gap-2">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                      <Skeleton key={i} className="h-9 w-16 rounded-full" />
                    ))}
                  </div>
                ) : slots.length === 0 ? (
                  <div className="rounded-xl bg-gray-50 py-8 text-center">
                    <Clock className="mx-auto mb-2 h-5 w-5 text-brand-subtext/30" />
                    <p className="text-xs text-brand-subtext">No slots available for this date</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {groupSlotsByPeriod(slots).map(({ label, icon: PeriodIcon, items }) =>
                      items.length > 0 ? (
                        <div key={label}>
                          <div className="flex items-center gap-1.5 mb-2">
                            <PeriodIcon className="h-3.5 w-3.5 text-brand-subtext/50" />
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-brand-subtext/60">
                              {label}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {items.map((slot) => {
                              const isSlotSelected = selectedSlot === slot;
                              return (
                                <button
                                  key={slot}
                                  onClick={() => setSelectedSlot(slot)}
                                  className={`rounded-full px-4 py-2 text-xs font-medium transition-all duration-200 ${
                                    isSlotSelected
                                      ? "bg-brand text-white shadow-md shadow-brand/20"
                                      : "bg-gray-100 text-brand-subtext hover:bg-gray-200/80"
                                  }`}
                                >
                                  {formatSlotTime(slot)}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : null
                    )}
                  </div>
                )
              ) : (
                <div className="rounded-xl bg-gray-50 py-8 text-center">
                  <Stethoscope className="mx-auto mb-2 h-5 w-5 text-brand-subtext/30" />
                  <p className="text-xs text-brand-subtext">
                    Select a doctor to view available slots
                  </p>
                </div>
              )}

              {/* Bottom bar */}
              {selectedSlot && selectedDoctor && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-5 flex items-center rounded-full bg-brand-accent/25 pl-5 pr-1.5 py-1.5"
                >
                  <p className="flex-1 text-xs font-medium text-brand-dark">
                    {formatBookingDate(selectedSlot)} | {formatSlotTime(selectedSlot)}
                  </p>
                  <button
                    onClick={() =>
                      router.push(
                        `/doctors/book/${selectedDoctor.doctor_id}?slot=${encodeURIComponent(selectedSlot)}`
                      )
                    }
                    className="rounded-full bg-brand-accent px-12 py-2.5 text-sm font-semibold text-brand-dark shadow-sm hover:brightness-95 transition-all"
                  >
                    Book
                  </button>
                </motion.div>
              )}
            </div>
          </div>

          {/* ─── Right column: Doctor Profile (desktop) ─── */}
          <div className="hidden lg:block w-[420px] shrink-0">
            <div className="lg:sticky lg:top-24">
              {selectedDoctor ? (
                <DoctorProfileCard doctor={selectedDoctor} />
              ) : (
                <div className="rounded-3xl border border-dashed border-gray-300 bg-white/60 p-8 text-center">
                  <User className="mx-auto mb-3 h-10 w-10 text-brand-subtext/25" />
                  <p className="text-sm font-medium text-brand-subtext/60">
                    Select a doctor to view their profile
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ─── Mobile: Doctor profile slide-up sheet ─── */}
        <AnimatePresence>
          {mobileProfileOpen && selectedDoctor && (
            <div className="lg:hidden">
              <motion.div
                key="mobile-doc-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
                onClick={() => setMobileProfileOpen(false)}
              />
              <motion.div
                key="mobile-doc-sheet"
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 30, stiffness: 350 }}
                className="fixed inset-x-0 bottom-0 z-40 max-h-[85vh] overflow-y-auto rounded-t-3xl bg-white shadow-2xl"
              >
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-5 py-3">
                  <p className="text-sm font-semibold text-brand-dark">Doctor Profile</p>
                  <button
                    onClick={() => setMobileProfileOpen(false)}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="p-5">
                  <DoctorProfileCard doctor={selectedDoctor} />
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
