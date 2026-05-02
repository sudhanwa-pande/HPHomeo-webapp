"use client";

import { MapPin, Stethoscope } from "lucide-react";
import { cn } from "@/lib/utils";

interface DoctorInfo {
  name: string;
  photo?: string | null;
  specialization?: string | null;
  city?: string | null;
  clinic_name?: string | null;
  doctor_id?: string;
}

interface DoctorInfoCardProps {
  doctor: DoctorInfo;
  compact?: boolean;
  showViewProfile?: boolean;
  onViewProfile?: () => void;
  className?: string;
}

function DoctorAvatar({
  name,
  photo,
  size = "md",
}: {
  name: string;
  photo?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClass = {
    sm: "h-10 w-10 text-xs rounded-xl",
    md: "h-12 w-12 text-sm rounded-2xl",
    lg: "h-14 w-14 text-lg rounded-2xl",
  }[size];

  if (photo) {
    return (
      <img
        src={photo}
        alt={name}
        className={cn(sizeClass, "shrink-0 object-cover ring-2 ring-gray-200 shadow-lg")}
      />
    );
  }

  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  return (
    <div
      className={cn(
        sizeClass,
        "flex shrink-0 items-center justify-center bg-gradient-to-br from-brand to-blue-600 font-bold text-white shadow-lg shadow-brand/25 ring-2 ring-gray-200",
      )}
    >
      {initials}
    </div>
  );
}

export function DoctorInfoCard({
  doctor,
  compact = false,
  showViewProfile = false,
  onViewProfile,
  className,
}: DoctorInfoCardProps) {
  if (compact) {
    return (
      <div className={cn("flex items-center gap-2.5", className)}>
        <DoctorAvatar name={doctor.name} photo={doctor.photo} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900">
            {doctor.name}
          </p>
          {doctor.specialization && (
            <p className="truncate text-xs text-gray-500">
              {doctor.specialization}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-2xl border border-gray-200/60 bg-white p-4",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <DoctorAvatar name={doctor.name} photo={doctor.photo} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">{doctor.name}</p>
          {doctor.specialization && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
              <Stethoscope className="h-3 w-3 text-brand" />
              {doctor.specialization}
            </p>
          )}
          {doctor.city && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
              <MapPin className="h-3 w-3" />
              {doctor.city}
              {doctor.clinic_name ? ` · ${doctor.clinic_name}` : ""}
            </p>
          )}
          {showViewProfile && onViewProfile && (
            <button
              onClick={onViewProfile}
              className="mt-2 text-xs font-medium text-brand hover:text-brand/80 transition-colors"
            >
              View Profile →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export { DoctorAvatar };
