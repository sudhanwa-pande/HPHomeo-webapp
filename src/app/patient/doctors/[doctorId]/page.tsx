"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  Calendar,
  GraduationCap,
  Globe,
  Languages,
  MapPin,
  Phone,
  Stethoscope,
  User,
  Video,
  Wallet,
} from "lucide-react";

import api from "@/lib/api";
import { AuthGuard } from "@/components/auth-guard";
import { PatientShell } from "@/components/patient/patient-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { PublicDoctor } from "@/types/patient";

export default function DoctorProfilePage() {
  return (
    <AuthGuard role="patient">
      <DoctorProfileContent />
    </AuthGuard>
  );
}

function DoctorProfileContent() {
  const router = useRouter();
  const params = useParams();
  const doctorId = params.doctorId as string;

  const { data: doctor, isLoading } = useQuery({
    queryKey: ["public", "doctor", doctorId],
    queryFn: async () => {
      const { data } = await api.get<PublicDoctor>(`/public/doctors/${doctorId}`);
      return data;
    },
  });

  if (isLoading) {
    return (
      <PatientShell title="Doctor Profile">
        <div className="mx-auto max-w-3xl space-y-5">
          <Skeleton className="h-52 rounded-3xl" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-48 rounded-2xl" />
            <Skeleton className="h-48 rounded-2xl" />
          </div>
        </div>
      </PatientShell>
    );
  }

  if (!doctor) {
    return (
      <PatientShell title="Doctor Profile">
        <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-20 text-center">
          <User className="h-10 w-10 text-slate-300" />
          <h2 className="text-lg font-semibold text-slate-900">Doctor not found</h2>
          <p className="text-sm text-slate-500">
            This doctor profile may no longer be available.
          </p>
          <Button variant="outline" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-3.5 w-3.5" />
            Go Back
          </Button>
        </div>
      </PatientShell>
    );
  }

  const initials = doctor.full_name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  const modes = doctor.available_modes || [];

  return (
    <PatientShell
      title="Doctor Profile"
      headerRight={
        <Button size="sm" onClick={() => router.push(`/patient/book/${doctorId}`)}>
          <Calendar className="h-3.5 w-3.5" />
          Book Appointment
        </Button>
      }
    >
      <div className="mx-auto max-w-3xl space-y-5">
        {/* Back link */}
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>

        {/* ── Hero Card ── */}
        <div className="overflow-hidden rounded-3xl border border-slate-200/60 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.05)]">
          {/* Banner */}
          <div className="relative h-24 sm:h-28 bg-gradient-to-br from-brand/80 via-brand to-blue-600">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjA4KSIvPjwvc3ZnPg==')] opacity-60" />
          </div>

          <div className="relative px-6 pb-6 sm:px-8 sm:pb-8">
            {/* Avatar */}
            <div className="relative -mt-14 mb-4 flex items-end gap-4">
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl border-4 border-white bg-brand-bg shadow-lg">
                {doctor.profile_photo ? (
                  <img
                    src={doctor.profile_photo}
                    alt={doctor.full_name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-2xl font-bold text-brand/60">{initials}</span>
                )}
              </div>
              <div className="mb-1 flex flex-wrap gap-2">
                {doctor.verification_status === "approved" && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                    <BadgeCheck className="h-3 w-3" />
                    Verified
                  </span>
                )}
              </div>
            </div>

            {/* Name & meta */}
            <h2 className="text-xl font-bold tracking-[-0.02em] text-slate-900 sm:text-2xl">
              Dr. {doctor.full_name}
            </h2>
            {doctor.specialization && (
              <p className="mt-1 text-sm font-medium text-brand">{doctor.specialization}</p>
            )}

            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500">
              {doctor.registration_no && (
                <span className="inline-flex items-center gap-1.5">
                  <BadgeCheck className="h-3.5 w-3.5 text-slate-400" />
                  Reg. {doctor.registration_no}
                </span>
              )}
              {doctor.experience_years != null && (
                <span className="inline-flex items-center gap-1.5">
                  <Stethoscope className="h-3.5 w-3.5 text-slate-400" />
                  {doctor.experience_years} years exp.
                </span>
              )}
              {doctor.city && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-slate-400" />
                  {doctor.city}
                </span>
              )}
            </div>

            {/* Fee tiles */}
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <FeeTile
                icon={Globe}
                label="Modes"
                value={modes.map((m) => (m === "online" ? "Online" : "Walk-in")).join(" + ") || "Not set"}
              />
              <FeeTile
                icon={Video}
                label="Online Fee"
                value={modes.includes("online") && doctor.online_fee != null ? `₹${doctor.online_fee}` : "—"}
                accent
              />
              <FeeTile
                icon={Wallet}
                label="Walk-in Fee"
                value={modes.includes("walk_in") && doctor.walkin_fee != null ? `₹${doctor.walkin_fee}` : "—"}
              />
            </div>
          </div>
        </div>

        {/* ── Detail cards ── */}
        <div className="grid gap-4 sm:grid-cols-2">
          {/* About */}
          {doctor.about && (
            <div className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm sm:col-span-2">
              <div className="flex items-center gap-2 text-slate-400 mb-3">
                <User className="h-4 w-4" />
                <h3 className="text-xs font-semibold uppercase tracking-[0.14em]">About</h3>
              </div>
              <p className="text-sm leading-7 text-slate-600">{doctor.about}</p>
            </div>
          )}

          {/* Qualifications */}
          {doctor.qualifications && doctor.qualifications.length > 0 && (
            <div className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-slate-400 mb-3">
                <GraduationCap className="h-4 w-4" />
                <h3 className="text-xs font-semibold uppercase tracking-[0.14em]">Qualifications</h3>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {doctor.qualifications.map((q) => (
                  <span
                    key={q}
                    className="rounded-full bg-brand/8 px-3 py-1 text-xs font-medium text-brand"
                  >
                    {q}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Languages */}
          {doctor.languages && doctor.languages.length > 0 && (
            <div className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-slate-400 mb-3">
                <Languages className="h-4 w-4" />
                <h3 className="text-xs font-semibold uppercase tracking-[0.14em]">Languages</h3>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {doctor.languages.map((l) => (
                  <span
                    key={l}
                    className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600"
                  >
                    {l}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Clinic */}
          {(doctor.clinic_name || doctor.clinic_address) && (
            <div className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm sm:col-span-2">
              <div className="flex items-center gap-2 text-slate-400 mb-3">
                <Building2 className="h-4 w-4" />
                <h3 className="text-xs font-semibold uppercase tracking-[0.14em]">Clinic</h3>
              </div>
              <div className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                <div>
                  {doctor.clinic_name && (
                    <p className="text-sm font-semibold text-slate-900">{doctor.clinic_name}</p>
                  )}
                  {doctor.clinic_address && (
                    <p className="mt-0.5 text-sm text-slate-500">{doctor.clinic_address}</p>
                  )}
                  {doctor.city && (
                    <p className="text-sm text-slate-500">{doctor.city}</p>
                  )}
                  {doctor.clinic_phone && (
                    <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-slate-500">
                      <Phone className="h-3 w-3" />
                      {doctor.clinic_phone}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Book CTA */}
        <div className="flex justify-center pt-2 pb-4">
          <Button
            size="lg"
            onClick={() => router.push(`/patient/book/${doctorId}`)}
            className="rounded-2xl px-8"
          >
            <Calendar className="h-4 w-4" />
            Book an Appointment
          </Button>
        </div>
      </div>
    </PatientShell>
  );
}

function FeeTile({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Globe;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${accent ? "border-brand/15 bg-brand/[0.04]" : "border-slate-100 bg-slate-50/60"}`}>
      <div className="flex items-center gap-1.5 text-slate-400">
        <Icon className="h-3 w-3" />
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em]">{label}</p>
      </div>
      <p className={`mt-1.5 text-base font-bold tracking-[-0.02em] ${accent ? "text-brand" : "text-slate-900"}`}>
        {value}
      </p>
    </div>
  );
}
