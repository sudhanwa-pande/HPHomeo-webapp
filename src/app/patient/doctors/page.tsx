"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  Briefcase,
  Building2,
  Languages,
  MapPin,
  MonitorPlay,
  Phone,
  Search,
  Stethoscope,
  User,
  X,
} from "lucide-react";

import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { AuthGuard } from "@/components/auth-guard";
import { PatientShell } from "@/components/patient/patient-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/loading";
import type { PublicDoctor } from "@/types/patient";

function DoctorsContent() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedDoctor, setSelectedDoctor] = useState<PublicDoctor | null>(null);

  const debounceRef = useState<ReturnType<typeof setTimeout> | null>(null);
  function handleSearch(value: string) {
    setSearch(value);
    if (debounceRef[0]) clearTimeout(debounceRef[0]);
    debounceRef[0] = setTimeout(() => setDebouncedSearch(value), 350);
  }

  const { data, isLoading } = useQuery({
    queryKey: ["public", "doctors", debouncedSearch],
    queryFn: async ({ signal }) => {
      const params: Record<string, string | number> = { limit: 50 };
      if (debouncedSearch.trim()) params.q = debouncedSearch.trim();
      const { data } = await api.get<{ doctors: PublicDoctor[]; count: number }>(
        "/public/doctors",
        { params, signal },
      );
      return data;
    },
  });

  const doctors = data?.doctors || [];

  return (
    <PatientShell title="Find a Doctor" subtitle="Browse and book appointments">
      <div className="space-y-5">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search by name, specialization, or city..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="h-11 rounded-xl border-gray-200/60 bg-white pl-10 text-sm shadow-none focus-visible:border-brand/30 focus-visible:ring-1 focus-visible:ring-brand/20"
          />
        </div>

        {/* Results */}
        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-4 rounded-xl border border-gray-200/60 bg-white p-4">
                <Skeleton className="h-14 w-14 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-40" />
                </div>
              </div>
            ))}
          </div>
        ) : doctors.length === 0 ? (
          <div className="flex flex-col items-center rounded-xl border border-gray-200/60 bg-white py-16 text-center">
            <Stethoscope className="mb-3 h-10 w-10 text-gray-300" />
            <p className="text-sm font-medium text-gray-500">No doctors found</p>
            <p className="mt-1 text-xs text-gray-400">
              {search ? "Try a different search term" : "No approved doctors available right now"}
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {doctors.map((doc) => (
              <DoctorCard
                key={doc.doctor_id}
                doctor={doc}
                onClick={() => setSelectedDoctor(doc)}
                onBook={() => router.push(`/patient/book/${doc.doctor_id}`)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Expanded doctor detail sheet */}
      <DoctorDetailSheet
        doctor={selectedDoctor}
        onClose={() => setSelectedDoctor(null)}
        onBook={(id) => {
          setSelectedDoctor(null);
          router.push(`/patient/book/${id}`);
        }}
      />
    </PatientShell>
  );
}

/* ── Compact doctor card (2 per row) ── */

function DoctorCard({
  doctor,
  onClick,
  onBook,
}: {
  doctor: PublicDoctor;
  onClick: () => void;
  onBook: () => void;
}) {
  const initials = doctor.full_name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  const specialization = doctor.specialization || "General Physician";
  const lowestFee = Math.min(
    ...[doctor.online_fee, doctor.walkin_fee].filter((f): f is number => f != null),
  );

  return (
    <div
      onClick={onClick}
      className="group flex cursor-pointer items-start gap-4 rounded-xl border border-gray-200/60 bg-white p-4 transition-all hover:border-gray-300/80 hover:shadow-sm"
    >
      {/* Avatar */}
      {doctor.profile_photo ? (
        <img
          src={doctor.profile_photo}
          alt={doctor.full_name}
          className="h-14 w-14 shrink-0 rounded-full object-cover ring-2 ring-gray-100"
        />
      ) : (
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand to-indigo-600 text-sm font-bold text-white ring-2 ring-gray-100">
          {initials}
        </div>
      )}

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-900">{doctor.full_name}</p>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
              <Stethoscope className="h-3 w-3 shrink-0 text-brand/60" />
              {specialization}
            </p>
          </div>
          {lowestFee > 0 && Number.isFinite(lowestFee) && (
            <span className="shrink-0 text-sm font-semibold text-gray-900">
              ₹{lowestFee}
            </span>
          )}
        </div>

        {/* Mode badges + city */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {doctor.available_modes?.includes("online") && (
            <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
              <MonitorPlay className="h-2.5 w-2.5" /> Online
            </span>
          )}
          {doctor.available_modes?.includes("walk_in") && (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
              <User className="h-2.5 w-2.5" /> Walk-in
            </span>
          )}
          {doctor.city && (
            <span className="inline-flex items-center gap-1 text-[10px] text-gray-400">
              <MapPin className="h-2.5 w-2.5" /> {doctor.city}
            </span>
          )}
        </div>

        {/* Quick book */}
        <div className="mt-3 flex items-center gap-2">
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onBook();
            }}
            className="h-7 gap-1 bg-brand px-3 text-[11px] font-medium hover:bg-brand/90"
          >
            Book <ArrowRight className="h-3 w-3" />
          </Button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              // triggers the parent onClick for detail view
            }}
            className="text-[11px] font-medium text-gray-400 transition-colors group-hover:text-brand"
          >
            View profile
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Doctor detail overlay (slide-up sheet) ── */

function DoctorDetailSheet({
  doctor,
  onClose,
  onBook,
}: {
  doctor: PublicDoctor | null;
  onClose: () => void;
  onBook: (doctorId: string) => void;
}) {
  const cardRef = useState<HTMLDivElement | null>(null);

  if (!doctor) return null;

  const initials = doctor.full_name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  const specialization = doctor.specialization || "General Physician";

  return (
    <AnimatePresence>
      {doctor && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            key="sheet"
            initial={{ opacity: 0, y: 60, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.97 }}
            transition={{ type: "spring", damping: 30, stiffness: 350 }}
            className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[90vh] w-full max-w-lg overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
          >
            <div className="max-h-[90vh] overflow-y-auto">
              {/* Header with photo */}
              <div className="relative border-b border-gray-100 p-6">
                <button
                  onClick={onClose}
                  className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700"
                >
                  <X className="h-4 w-4" />
                </button>

                <div className="flex items-center gap-4">
                  {doctor.profile_photo ? (
                    <img
                      src={doctor.profile_photo}
                      alt={doctor.full_name}
                      className="h-20 w-20 rounded-2xl object-cover ring-2 ring-gray-100"
                    />
                  ) : (
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-indigo-600 text-2xl font-bold text-white ring-2 ring-gray-100">
                      {initials}
                    </div>
                  )}
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold text-gray-900">{doctor.full_name}</h2>
                    <p className="flex items-center gap-1.5 text-sm text-gray-500">
                      <Stethoscope className="h-3.5 w-3.5 text-brand/60" />
                      {specialization}
                    </p>
                    {doctor.city && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-gray-400">
                        <MapPin className="h-3 w-3" />
                        {doctor.city}
                        {doctor.clinic_name ? ` · ${doctor.clinic_name}` : ""}
                      </p>
                    )}
                    {/* Mode badges */}
                    <div className="mt-2 flex gap-1.5">
                      {doctor.available_modes?.includes("online") && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                          <MonitorPlay className="h-3 w-3" /> Online
                        </span>
                      )}
                      {doctor.available_modes?.includes("walk_in") && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                          <User className="h-3 w-3" /> Walk-in
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Bio */}
              {doctor.about && (
                <div className="border-b border-gray-100 px-6 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">About</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{doctor.about}</p>
                </div>
              )}

              {/* Details grid */}
              <div className="border-b border-gray-100 px-6 py-4">
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  {doctor.experience_years != null && (
                    <DetailRow icon={<Briefcase className="h-4 w-4" />} label="Experience" value={`${doctor.experience_years} years`} />
                  )}
                  {doctor.qualifications && doctor.qualifications.length > 0 && (
                    <DetailRow icon={<Stethoscope className="h-4 w-4" />} label="Qualifications" value={doctor.qualifications.join(", ")} />
                  )}
                  {doctor.languages && doctor.languages.length > 0 && (
                    <DetailRow icon={<Languages className="h-4 w-4" />} label="Languages" value={doctor.languages.join(", ")} />
                  )}
                  {doctor.clinic_name && (
                    <DetailRow icon={<Building2 className="h-4 w-4" />} label="Clinic" value={doctor.clinic_name} />
                  )}
                  {doctor.clinic_address && (
                    <DetailRow icon={<MapPin className="h-4 w-4" />} label="Address" value={doctor.clinic_address} />
                  )}
                  {doctor.clinic_phone && (
                    <DetailRow icon={<Phone className="h-4 w-4" />} label="Phone" value={doctor.clinic_phone} />
                  )}
                </div>
              </div>

              {/* Fees */}
              {(doctor.online_fee != null || doctor.walkin_fee != null) && (
                <div className="border-b border-gray-100 px-6 py-4">
                  <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Consultation Fees</p>
                  <div className="flex gap-3">
                    {doctor.available_modes?.includes("online") && doctor.online_fee != null && (
                      <div className="flex-1 rounded-xl border border-blue-100 bg-blue-50/50 p-3.5 text-center">
                        <MonitorPlay className="mx-auto mb-1 h-5 w-5 text-blue-600" />
                        <p className="text-[11px] text-gray-500">Online</p>
                        <p className="mt-0.5 text-lg font-bold text-gray-900">₹{doctor.online_fee}</p>
                      </div>
                    )}
                    {doctor.available_modes?.includes("walk_in") && doctor.walkin_fee != null && (
                      <div className="flex-1 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3.5 text-center">
                        <User className="mx-auto mb-1 h-5 w-5 text-emerald-600" />
                        <p className="text-[11px] text-gray-500">Walk-in</p>
                        <p className="mt-0.5 text-lg font-bold text-gray-900">₹{doctor.walkin_fee}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Book CTA */}
              <div className="p-6">
                <Button
                  onClick={() => onBook(doctor.doctor_id)}
                  className="w-full gap-2 bg-brand hover:bg-brand/90"
                  size="lg"
                >
                  Book Appointment
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-gray-400">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">{label}</p>
        <p className="text-sm text-gray-700">{value}</p>
      </div>
    </div>
  );
}

export default function PatientDoctorsPage() {
  return (
    <AuthGuard role="patient">
      <DoctorsContent />
    </AuthGuard>
  );
}
