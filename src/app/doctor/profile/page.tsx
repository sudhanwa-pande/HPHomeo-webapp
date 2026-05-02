"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { motion } from "framer-motion";
import {
  AlertCircle,
  BadgeCheck,
  Building2,
  Camera,
  CheckCircle2,
  Edit3,
  Eye,
  EyeOff,
  FileSignature,
  Globe,
  KeyRound,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Save,
  Shield,
  Stethoscope,
  Upload,
  User,
  Video,
  Wallet,
  X,
} from "lucide-react";

import { AuthGuard, broadcastLogout } from "@/components/auth-guard";
import { DoctorShell } from "@/components/doctor/doctor-shell";
import { ProfileWizard } from "@/components/doctor/profile-wizard";
import { EmptyState, SectionCard, StatusBadge as SharedStatusBadge } from "@/components/doctor/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import api from "@/lib/api";
import { notifyApiError, notifyError, notifySuccess } from "@/lib/notify";
import { validateImageFile } from "@/lib/validate-image";
import { useDoctorAuth } from "@/stores/doctor-auth";
import type { Doctor } from "@/types/auth";
import type { DoctorProfile, DoctorProfileUpdate } from "@/types/doctor";

const CLINIC_NAME = "Hahnemann's Homoeo Pharmacy";
const CLINIC_ADDRESS = "53 Boral Main Road, Garia";
const CLINIC_CITY = "Kolkata 700084 - India";

export default function ProfilePage() {
  return (
    <AuthGuard role="doctor">
      <ProfileContent />
    </AuthGuard>
  );
}

function ProfileContent() {
  const queryClient = useQueryClient();
  const authDoctor = useDoctorAuth((state) => state.doctor);
  const setDoctor = useDoctorAuth((state) => state.setDoctor);
  const [isEditing, setIsEditing] = useState(false);
  const [showTotpSetup, setShowTotpSetup] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["doctor-profile"],
    queryFn: async () => {
      const { data } = await api.get<DoctorProfile>("/doctor/profile");
      return data;
    },
  });

  useEffect(() => {
    if (!profile || !authDoctor) return;

    const nextDoctor = toDoctorSession(profile, authDoctor);
    if (
      authDoctor.full_name === nextDoctor.full_name &&
      authDoctor.phone === nextDoctor.phone &&
      authDoctor.profile_photo === nextDoctor.profile_photo &&
      authDoctor.profile_complete === nextDoctor.profile_complete &&
      authDoctor.verification_status === nextDoctor.verification_status
    ) {
      return;
    }

    setDoctor(nextDoctor);
  }, [authDoctor, profile, setDoctor]);

  const modeSummary = useMemo(() => formatModes(profile?.available_modes), [profile?.available_modes]);

  function handleProfileRefresh(updatedProfile?: DoctorProfile) {
    if (updatedProfile && authDoctor) {
      setDoctor(toDoctorSession(updatedProfile, authDoctor));
      // Instantly update the cached profile so the UI transitions without waiting for a refetch
      queryClient.setQueryData<DoctorProfile>(["doctor-profile"], updatedProfile);
    }
    queryClient.invalidateQueries({ queryKey: ["doctor-profile"] });
  }

  // Show a lightweight loader when we expect the wizard (avoids shell flash)
  if (isLoading) {
    if (!authDoctor?.profile_complete) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-brand-bg">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-brand" />
            <p className="text-sm text-slate-400">Loading your profile…</p>
          </div>
        </div>
      );
    }
    return (
      <DoctorShell title="Profile Settings" subtitle="Identity, prescription assets, and consultation pricing">
        <div className="space-y-5">
          <SectionCard padding="lg">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
              <Skeleton className="h-24 w-24 rounded-[28px]" />
              <div className="flex-1 space-y-3">
                <Skeleton className="h-7 w-56" />
                <Skeleton className="h-4 w-40" />
                <div className="flex flex-wrap gap-2">
                  <Skeleton className="h-8 w-28 rounded-full" />
                  <Skeleton className="h-8 w-36 rounded-full" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Skeleton className="h-20 rounded-2xl" />
                  <Skeleton className="h-20 rounded-2xl" />
                </div>
              </div>
            </div>
          </SectionCard>
          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <Skeleton className="h-[480px] rounded-[28px]" />
            <Skeleton className="h-[480px] rounded-[28px]" />
          </div>
        </div>
      </DoctorShell>
    );
  }

  if (!profile) {
    return (
      <DoctorShell title="Profile Settings" subtitle="Identity, prescription assets, and consultation pricing">
        <EmptyState
          icon={AlertCircle}
          title="Failed to load profile"
          description="Please try refreshing the page."
          size="lg"
        />
      </DoctorShell>
    );
  }

  // ── WIZARD: show only when doctor hasn't completed the core wizard fields.
  // profile_complete also requires photo + signature + availability (set separately),
  // so we gate on the fields the wizard actually collects — not the composite flag.
  if (needsWizard(profile)) {
    return (
      <ProfileWizard
        profile={profile}
        onComplete={(updated) => handleProfileRefresh(updated)}
      />
    );
  }

  // ── EDIT MODE ──
  if (isEditing) {
    return (
      <DoctorShell
        title="Edit Profile"
        subtitle="Update your details, consultation settings, and assets"
      >
        <ProfileEditForm
          profile={profile}
          onCancel={() => setIsEditing(false)}
          onSaved={(updatedProfile) => {
            handleProfileRefresh(updatedProfile);
            setIsEditing(false);
          }}
        />
      </DoctorShell>
    );
  }

  // ── PROFILE VIEW (modern SaaS) ──
  return (
    <DoctorShell
      title="Profile"
      subtitle="Your public-facing profile and consultation settings"
      headerRight={
        <Button size="sm" onClick={() => setIsEditing(true)} className="max-sm:w-full">
          <Edit3 className="h-3.5 w-3.5" />
          Edit Profile
        </Button>
      }
    >
      <div className="space-y-5">
        {/* ══════════════════ IDENTITY HEADER ══════════════════ */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-3xl border border-slate-200/60 bg-white p-6 shadow-[0_8px_28px_rgba(15,23,42,0.04)] sm:p-8"
        >
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            {/* Avatar */}
            <AvatarPanel
              profile={profile}
              onUploaded={(url) => {
                queryClient.setQueryData<DoctorProfile>(["doctor-profile"], (cur) =>
                  cur ? { ...cur, profile_photo: url } : cur,
                );
                if (authDoctor) setDoctor({ ...authDoctor, profile_photo: url });
                handleProfileRefresh();
              }}
            />

            {/* Name + badges + meta */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-bold tracking-[-0.03em] text-slate-900">
                  Dr. {profile.full_name}
                </h2>
                <SharedStatusBadge
                  variant={profile.verification_status as "approved" | "pending" | "rejected"}
                  label={profile.verification_status === "approved" ? "Verified" : undefined}
                />
                {profile.profile_complete && (
                  <span className="rounded-full border border-lime-200 bg-lime-50 px-2.5 py-0.5 text-[11px] font-semibold text-lime-700">
                    Profile complete
                  </span>
                )}
              </div>
              {profile.specialization && (
                <p className="mt-1 text-sm font-medium text-brand">{profile.specialization}</p>
              )}

              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] text-slate-500">
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-slate-400" />
                  {profile.email}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-slate-400" />
                  {profile.phone}
                </span>
                {profile.registration_no && (
                  <span className="inline-flex items-center gap-1.5">
                    <BadgeCheck className="h-3.5 w-3.5 text-slate-400" />
                    Reg. {profile.registration_no}
                  </span>
                )}
              </div>

              {/* Fee tiles — inline */}
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <MetricTile
                  icon={Globe}
                  label="Modes"
                  value={modeSummary || "Not set"}
                />
                <MetricTile
                  icon={Video}
                  label="Online Fee"
                  value={profile.available_modes?.includes("online") ? formatMoney(profile.online_fee) : "N/A"}
                  accent
                />
                <MetricTile
                  icon={Wallet}
                  label="Walk-in Fee"
                  value={profile.available_modes?.includes("walk_in") ? formatMoney(profile.walkin_fee) : "N/A"}
                />
              </div>
            </div>
          </div>
        </motion.div>

        {/* ══════════════════ MAIN GRID ══════════════════ */}
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Professional Details */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.06 }}
            className="rounded-3xl border border-slate-200/60 bg-white p-6 shadow-[0_8px_28px_rgba(15,23,42,0.04)] sm:p-7"
          >
            <SectionHeading icon={Stethoscope} title="Professional Details" />
            <div className="mt-5 space-y-2.5">
              <DetailRow label="Registration No" value={profile.registration_no} />
              <DetailRow label="Specialization" value={profile.specialization} />
              <DetailRow
                label="Experience"
                value={profile.experience_years != null ? `${profile.experience_years} years` : undefined}
              />
              <DetailRow label="Gender" value={profile.gender} />
              <DetailRow label="Qualifications" value={listToText(profile.qualifications)} tags={profile.qualifications} />
              <DetailRow label="Languages" value={listToText(profile.languages)} tags={profile.languages} />
            </div>
          </motion.div>

          {/* About */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="rounded-3xl border border-slate-200/60 bg-white p-6 shadow-[0_8px_28px_rgba(15,23,42,0.04)] sm:p-7"
          >
            <SectionHeading icon={User} title="About" />
            <p className="mt-4 text-sm leading-7 text-slate-600">
              {profile.about?.trim() || "No bio added yet."}
            </p>

            {/* Clinic info — nested */}
            <div className="mt-6 border-t border-slate-100 pt-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-brand/10 text-brand">
                  <Building2 className="h-3.5 w-3.5" />
                </div>
                <p className="text-sm font-semibold text-slate-900">Clinic</p>
              </div>
              <div className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                <div>
                  <p className="text-sm font-semibold text-slate-900">{CLINIC_NAME}</p>
                  <p className="mt-0.5 text-[13px] text-slate-500">{CLINIC_ADDRESS}, {CLINIC_CITY}</p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* ══════════════════ ASSETS + SECURITY ══════════════════ */}
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Signature */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.14 }}
            className="rounded-3xl border border-slate-200/60 bg-white p-6 shadow-[0_8px_28px_rgba(15,23,42,0.04)] sm:p-7"
          >
            <SectionHeading icon={FileSignature} title="Doctor Signature" />
            <div className="mt-4">
              <MediaUploadCard
                label="Signature"
                currentUrl={profile.signature_url}
                endpoint="/doctor/profile/signature"
                responseKey="signature_url"
                emptyIcon={FileSignature}
                shape="wide"
                onUploaded={() => handleProfileRefresh()}
              />
            </div>
          </motion.div>

          {/* Security */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.18 }}
            className="rounded-3xl border border-slate-200/60 bg-white p-6 shadow-[0_8px_28px_rgba(15,23,42,0.04)] sm:p-7"
          >
            <SectionHeading icon={Shield} title="Security" />
            <div className="mt-4 space-y-4">
              {/* TOTP status */}
              <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/60 px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${profile.totp_enabled ? "bg-emerald-50" : "bg-amber-50"}`}>
                    <Shield className={`h-4 w-4 ${profile.totp_enabled ? "text-emerald-600" : "text-amber-600"}`} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Two-Factor Authentication</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {profile.totp_enabled
                        ? "TOTP authenticator app is active"
                        : "Secure your account with an authenticator app"
                      }
                    </p>
                  </div>
                </div>
                {profile.totp_enabled ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Enabled
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowTotpSetup(true)}
                    className="border-brand/20 text-brand"
                  >
                    Setup TOTP
                  </Button>
                )}
              </div>
              {showTotpSetup && <TotpSetupFlow onClose={() => { setShowTotpSetup(false); handleProfileRefresh(); }} />}

              {/* Change Password */}
              <div className="border-t border-slate-100 pt-4">
                <p className="mb-3 text-sm font-semibold text-slate-900">Change Password</p>
                <ChangePasswordSection />
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </DoctorShell>
  );
}

// ============================================================================
// PROFILE EDIT FORM (kept intact with minor style refinements)
// ============================================================================

const profileEditSchema = z.object({
  full_name: z.string().min(2, "Name must be at least 2 characters").max(80, "Name too long"),
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/, "Format: +91XXXXXXXXXX"),
  gender: z.string().optional(),
  about: z.string().max(1000, "Max 1000 characters").optional(),
  specialization: z.string().min(2, "Required").max(100).optional(),
  experience_years: z.number().int().min(0).max(60).optional(),
  qualifications: z.array(z.string()).optional(),
  languages: z.array(z.string()).optional(),
  available_modes: z.array(z.enum(["online", "walk_in"])).optional(),
  online_fee: z.number().int().min(0, "Must be 0 or more").optional(),
  walkin_fee: z.number().int().min(0, "Must be 0 or more").optional(),
});

function ProfileEditForm({
  profile,
  onCancel,
  onSaved,
}: {
  profile: DoctorProfile;
  onCancel: () => void;
  onSaved: (profile: DoctorProfile) => void;
}) {
  const authDoctor = useDoctorAuth((state) => state.doctor);
  const setDoctor = useDoctorAuth((state) => state.setDoctor);
  const queryClient = useQueryClient();
  type ProfileEditValues = z.infer<typeof profileEditSchema>;
  const { register, handleSubmit, formState: { isSubmitting, errors } } = useForm<ProfileEditValues>({
    resolver: zodResolver(profileEditSchema),
    defaultValues: {
      full_name: profile.full_name,
      phone: profile.phone,
      gender: profile.gender || "",
      about: profile.about || "",
      specialization: profile.specialization || "",
      experience_years: profile.experience_years || undefined,
      qualifications: profile.qualifications || [],
      languages: profile.languages || [],
      available_modes: profile.available_modes || [],
      online_fee: profile.online_fee ?? undefined,
      walkin_fee: profile.walkin_fee ?? undefined,
    },
  });

  const [qualStr, setQualStr] = useState((profile.qualifications || []).join(", "));
  const [langStr, setLangStr] = useState((profile.languages || []).join(", "));
  const [modes, setModes] = useState<("online" | "walk_in")[]>(profile.available_modes || []);

  async function onSubmit(data: ProfileEditValues) {
    try {
      const payload: DoctorProfileUpdate = {
        ...data,
        about: data.about?.trim() || undefined,
        specialization: data.specialization?.trim() || undefined,
        qualifications: qualStr.split(",").map((value) => value.trim()).filter(Boolean),
        languages: langStr.split(",").map((value) => value.trim()).filter(Boolean),
        available_modes: modes,
        online_fee: modes.includes("online") ? data.online_fee : undefined,
        walkin_fee: modes.includes("walk_in") ? data.walkin_fee : undefined,
      };

      const { data: updatedProfile } = await api.put<DoctorProfile>("/doctor/profile", payload);
      if (authDoctor) {
        setDoctor(toDoctorSession(updatedProfile, authDoctor));
      }
      await queryClient.invalidateQueries({ queryKey: ["doctor-profile"] });
      notifySuccess("Profile saved", "Your latest profile details are now live.");
      onSaved(updatedProfile);
    } catch (error) {
      notifyApiError(error, "Couldn't save profile");
    }
  }

  function toggleMode(mode: "online" | "walk_in") {
    setModes((prev) => (prev.includes(mode) ? prev.filter((item) => item !== mode) : [...prev, mode]));
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <SectionCard padding="lg" elevated>
            <SectionHeading
              icon={User}
              title="Identity & Intro"
              subtitle="These details power the doctor card, account avatar, and prescription header."
            />
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <FormField label="Full Name" required>
                <Input {...register("full_name")} className="h-10" />
                {errors.full_name && <p className="mt-1 text-xs text-destructive">{errors.full_name.message}</p>}
              </FormField>
              <FormField label="Phone" required>
                <Input {...register("phone")} className="h-10" />
                {errors.phone && <p className="mt-1 text-xs text-destructive">{errors.phone.message}</p>}
              </FormField>
              <FormField label="Gender">
                <select
                  {...register("gender")}
                  className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <option value="">Select</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </FormField>
              <FormField label="Professional About" className="sm:col-span-2">
                <Textarea
                  {...register("about")}
                  rows={5}
                  placeholder="Describe your practice style, approach, and consultation focus."
                  className="min-h-[132px]"
                />
              </FormField>
            </div>
          </SectionCard>

          <SectionCard padding="lg" elevated>
            <SectionHeading
              icon={Stethoscope}
              title="Professional Details"
              subtitle="Keep the profile clean and patient-facing."
            />
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <FormField label="Specialization" required>
                <Input {...register("specialization")} placeholder="e.g. Classical Homeopathy" className="h-10" />
                {errors.specialization && <p className="mt-1 text-xs text-destructive">{errors.specialization.message}</p>}
              </FormField>
              <FormField label="Experience (years)">
                <Input type="number" {...register("experience_years", { valueAsNumber: true })} className="h-10" />
              </FormField>
              <FormField label="Qualifications" className="sm:col-span-2">
                <Input
                  value={qualStr}
                  onChange={(event) => setQualStr(event.target.value)}
                  placeholder="BHMS, MD (Hom) - separate with commas"
                  className="h-10"
                />
              </FormField>
              <FormField label="Languages" className="sm:col-span-2">
                <Input
                  value={langStr}
                  onChange={(event) => setLangStr(event.target.value)}
                  placeholder="English, Hindi, Bengali - separate with commas"
                  className="h-10"
                />
              </FormField>
            </div>
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard padding="lg" elevated>
            <SectionHeading
              icon={Building2}
              title="Clinic Identity"
              subtitle="Managed globally across the doctor network."
            />
            <div className="mt-4 rounded-[24px] border border-slate-200/80 bg-slate-50/90 p-5">
              <p className="text-sm font-semibold text-slate-900">{CLINIC_NAME}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">{CLINIC_ADDRESS}</p>
              <p className="text-sm leading-6 text-slate-600">{CLINIC_CITY}</p>
            </div>
          </SectionCard>

          <SectionCard padding="lg" elevated>
            <SectionHeading
              icon={Stethoscope}
              title="Consultation Settings"
              subtitle="Fees are now saved directly in rupees."
            />
            <div className="mt-5 space-y-5">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Available modes
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <ModeButton
                    active={modes.includes("online")}
                    title="Online"
                    description="Video consultations"
                    onClick={() => toggleMode("online")}
                  />
                  <ModeButton
                    active={modes.includes("walk_in")}
                    title="Walk-in"
                    description="In-clinic appointments"
                    onClick={() => toggleMode("walk_in")}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {modes.includes("online") ? (
                  <FormField label="Online Fee (Rs)">
                    <Input
                      type="number"
                      {...register("online_fee", { valueAsNumber: true })}
                      placeholder="e.g. 500"
                      className="h-10"
                    />
                    {errors.online_fee && <p className="mt-1 text-xs text-destructive">{errors.online_fee.message}</p>}
                  </FormField>
                ) : null}
                {modes.includes("walk_in") ? (
                  <FormField label="Walk-in Fee (Rs)">
                    <Input
                      type="number"
                      {...register("walkin_fee", { valueAsNumber: true })}
                      placeholder="e.g. 400"
                      className="h-10"
                    />
                    {errors.walkin_fee && <p className="mt-1 text-xs text-destructive">{errors.walkin_fee.message}</p>}
                  </FormField>
                ) : null}
              </div>
            </div>
          </SectionCard>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-200/80 pt-2 sm:flex-row">
        <Button type="submit" loading={isSubmitting} className="max-sm:w-full">
          <Save className="h-4 w-4" />
          Save Changes
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} className="max-sm:w-full">
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ============================================================================
// AVATAR PANEL (with crop modal)
// ============================================================================

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", (err) => reject(err));
    img.setAttribute("crossOrigin", "anonymous");
    img.src = url;
  });
}

async function getCroppedBlob(
  imageSrc: string,
  crop: { x: number; y: number; width: number; height: number },
): Promise<Blob> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = crop.width;
  canvas.height = crop.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Canvas toBlob failed"))),
      "image/webp",
      0.85,
    );
  });
}

function AvatarPanel({
  profile,
  onUploaded,
}: {
  profile: DoctorProfile;
  onUploaded?: (url: string) => void;
}) {
  const Cropper = require("react-easy-crop").default;
  const initials = getInitials(profile.full_name);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");

  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<{
    x: number; y: number; width: number; height: number;
  } | null>(null);

  async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const validation = await validateImageFile(file);
    if (!validation.valid) {
      notifyError("Invalid file", validation.error ?? "Please upload a JPEG, PNG, or WebP image.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setImageSrc(reader.result as string);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    };
    reader.readAsDataURL(file);
  }

  function onCropComplete(_: unknown, croppedPixels: { x: number; y: number; width: number; height: number }) {
    setCroppedAreaPixels(croppedPixels);
  }

  async function handleUploadCropped() {
    if (!imageSrc || !croppedAreaPixels) return;

    setUploading(true);
    try {
      setUploadStatus("Cropping & uploading...");
      const croppedBlob = await getCroppedBlob(imageSrc, croppedAreaPixels);
      const file = new File([croppedBlob], "profile-photo.webp", { type: "image/webp" });

      const formData = new FormData();
      formData.append("file", file);
      const { data } = await api.post<Record<string, string>>("/doctor/profile/photo", formData);
      const nextUrl = data?.profile_photo;
      if (nextUrl) {
        onUploaded?.(nextUrl);
      }
      notifySuccess("Profile picture updated", "Your profile photo has been updated.");
      setImageSrc(null);
    } catch (error) {
      notifyApiError(error, "Couldn't update profile picture");
    } finally {
      setUploading(false);
      setUploadStatus("");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      <div className="relative shrink-0">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="group relative block"
          disabled={uploading}
        >
          <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-3xl border-4 border-white bg-brand-bg shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
            {profile.profile_photo ? (
              <Image
                src={profile.profile_photo}
                alt={profile.full_name}
                width={112}
                height={112}
                unoptimized
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-3xl font-bold text-brand/60">{initials}</span>
            )}
          </div>
          <div className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-brand text-white shadow-sm transition group-hover:bg-brand/90">
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
          </div>
        </button>
        {profile.verification_status === "approved" && (
          <div className="absolute -top-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-lime-500 shadow-sm">
            <BadgeCheck className="h-3.5 w-3.5 text-white" />
          </div>
        )}
      </div>

      {/* Crop modal */}
      {imageSrc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200/80">
              <h3 className="text-base font-semibold text-slate-950">Crop Profile Photo</h3>
              <button
                onClick={() => { setImageSrc(null); if (inputRef.current) inputRef.current.value = ""; }}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="relative h-[360px] bg-slate-100">
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="rect"
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>
            <div className="px-6 py-2">
              <label className="flex items-center gap-3 text-xs text-slate-500">
                Zoom
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.05}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="flex-1 accent-brand"
                />
              </label>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-slate-200/80">
              <Button onClick={handleUploadCropped} loading={uploading} className="flex-1">
                <Upload className="h-4 w-4" />
                {uploading && uploadStatus ? uploadStatus : "Upload Photo"}
              </Button>
              <Button
                variant="outline"
                onClick={() => { setImageSrc(null); if (inputRef.current) inputRef.current.value = ""; }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ============================================================================
// SHARED SUB-COMPONENTS
// ============================================================================

function MetricTile({
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
    <div className={`rounded-2xl border px-5 py-4 ${accent ? "border-brand/15 bg-brand/[0.04]" : "border-slate-100 bg-slate-50/60"}`}>
      <div className="flex items-center gap-2 text-slate-400">
        <Icon className="h-3.5 w-3.5" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em]">{label}</p>
      </div>
      <p className={`mt-2 text-lg font-bold tracking-[-0.02em] ${accent ? "text-brand" : "text-slate-900"}`}>
        {value}
      </p>
    </div>
  );
}

function DetailRow({
  label,
  value,
  tags,
}: {
  label: string;
  value?: string | null;
  tags?: string[] | null;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm text-slate-500">{label}</span>
      {tags && tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span key={t} className="rounded-full bg-brand/8 px-2.5 py-0.5 text-xs font-medium text-brand">
              {t}
            </span>
          ))}
        </div>
      ) : (
        <span className="text-sm font-medium text-slate-900">{value || "-"}</span>
      )}
    </div>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: typeof User;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand/10 text-brand">
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div>
        <h3 className="text-lg font-semibold tracking-[-0.02em] text-slate-950">{title}</h3>
        {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
      </div>
    </div>
  );
}

function MediaUploadCard({
  label,
  currentUrl,
  endpoint,
  responseKey,
  emptyIcon: Icon,
  shape,
  onUploaded,
}: {
  label: string;
  currentUrl?: string | null;
  endpoint: string;
  responseKey: string;
  emptyIcon: typeof Camera;
  shape: "circle" | "wide";
  onUploaded?: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const validation = await validateImageFile(file);
    if (!validation.valid) {
      notifyError("Invalid file", validation.error ?? "Please upload a JPEG, PNG, or WebP image.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { data } = await api.post<Record<string, string>>(endpoint, formData);
      const nextUrl = data?.[responseKey];
      if (nextUrl) {
        onUploaded?.(nextUrl);
      }
      notifySuccess(`${label} updated`, "The latest file is now attached to your profile.");
    } catch (error) {
      notifyApiError(error, `Couldn't upload ${label.toLowerCase()}`);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
      <div className="flex items-center gap-4">
        <div
          className={[
            "flex shrink-0 items-center justify-center overflow-hidden border border-slate-200/80 bg-white shadow-sm",
            shape === "circle" ? "h-16 w-16 rounded-full" : "h-14 w-24 rounded-xl",
          ].join(" ")}
        >
          {currentUrl ? (
            <Image
              src={currentUrl}
              alt={label}
              width={shape === "circle" ? 64 : 96}
              height={64}
              unoptimized
              className="h-full w-full object-cover"
            />
          ) : (
            <Icon className="h-5 w-5 text-slate-400" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-700">{currentUrl ? "Uploaded" : "Not uploaded yet"}</p>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            onChange={handleUpload}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            loading={uploading}
            className="mt-2 border-brand/20 text-brand"
          >
            <Upload className="h-3.5 w-3.5" />
            {currentUrl ? "Replace" : "Upload"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ModeButton({
  active,
  title,
  description,
  onClick,
}: {
  active: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-[24px] border px-4 py-4 text-left transition-all",
        active
          ? "border-brand/25 bg-brand/[0.08] shadow-[0_12px_28px_rgba(59,130,246,0.10)]"
          : "border-slate-200/80 bg-slate-50/80 hover:border-brand/15 hover:bg-white",
      ].join(" ")}
    >
      <p className="text-sm font-semibold text-slate-950">{title}</p>
      <p className="mt-1 text-sm text-slate-600">{description}</p>
      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {active ? "Enabled" : "Disabled"}
      </p>
    </button>
  );
}

function FormField({
  label,
  required,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
        {required ? <span className="ml-1 text-red-400">*</span> : null}
      </label>
      {children}
    </div>
  );
}

// ============================================================================
// TOTP SETUP
// ============================================================================

function TotpSetupFlow({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<"loading" | "qr" | "verify">("loading");
  const [qrData, setQrData] = useState<{
    qr_uri: string;
    secret: string;
    qr_code_data_url?: string;
  } | null>(null);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    let active = true;

    async function startSetup() {
      try {
        const { data } = await api.post("/auth/totp/setup");
        if (!active) return;

        setQrData({
          qr_uri: data.otpauth_url,
          secret: data.manual_entry_key,
          qr_code_data_url: data.qr_code_data_url,
        });
        setStep("qr");
      } catch (error) {
        if (!active) return;
        notifyApiError(error, "Couldn't start TOTP setup");
      }
    }

    void startSetup();

    return () => {
      active = false;
    };
  }, []);

  async function handleVerify() {
    if (code.length !== 6) return;
    setVerifying(true);
    try {
      await api.post("/auth/totp/enable", { code });
      notifySuccess("TOTP enabled", "Two-factor authentication is now active.");
      onClose();
    } catch (error) {
      notifyApiError(error, "Couldn't enable TOTP");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-brand/15 bg-brand/5 p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-950">Setup TOTP</p>
        <button onClick={onClose} type="button" className="rounded-lg p-1 text-slate-500 hover:bg-brand-bg">
          <X className="h-4 w-4" />
        </button>
      </div>

      {step === "loading" && (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-brand" />
        </div>
      )}

      {step === "qr" && qrData && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.).
          </p>
          <div className="flex justify-center rounded-2xl bg-white p-4">
            <Image
              src={
                qrData.qr_code_data_url ??
                `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrData.qr_uri)}`
              }
              alt="TOTP QR Code"
              width={192}
              height={192}
              unoptimized
              className="h-40 w-40 sm:h-48 sm:w-48"
            />
          </div>
          <div className="rounded-2xl bg-white px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Manual entry key</p>
            <p className="mt-1 break-all font-mono text-sm text-slate-900">{qrData.secret}</p>
          </div>
          <Button size="sm" type="button" onClick={() => setStep("verify")}>
            Next - Enter Code
          </Button>
        </div>
      )}

      {step === "verify" && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Enter the 6-digit code from your authenticator app to verify.
          </p>
          <Input
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            className="h-11 text-center font-mono text-lg tracking-[0.45em]"
            maxLength={6}
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button size="sm" type="button" onClick={handleVerify} disabled={code.length !== 6} loading={verifying}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              Verify & Enable
            </Button>
            <Button size="sm" type="button" variant="outline" onClick={() => setStep("qr")}>
              Back
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// CHANGE PASSWORD SECTION
// ============================================================================

const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, "Current password is required"),
    new_password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Must contain an uppercase letter")
      .regex(/\d/, "Must contain a number")
      .regex(/[^A-Za-z0-9]/, "Must contain a special character"),
    confirm_password: z.string().min(1, "Please confirm your new password"),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"],
  });

type ChangePasswordForm = z.infer<typeof changePasswordSchema>;

function PasswordStrengthBar({ password }: { password: string }) {
  if (!password) return null;
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const score = checks.filter(Boolean).length;
  const colors = ["bg-red-400", "bg-orange-400", "bg-yellow-400", "bg-emerald-500"];
  const labels = ["Weak", "Fair", "Good", "Strong"];
  const textColors = ["text-red-500", "text-orange-500", "text-yellow-600", "text-emerald-600"];
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-all duration-300 ${
              i < score ? colors[score - 1] : "bg-slate-200"
            }`}
          />
        ))}
      </div>
      <p className={`text-xs font-medium ${textColors[score - 1] ?? "text-slate-400"}`}>
        {labels[score - 1] ?? "Too short"}
      </p>
    </div>
  );
}

function ChangePasswordSection() {
  const router = useRouter();
  const { logout } = useDoctorAuth();
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordForm>({ resolver: zodResolver(changePasswordSchema) });

  const watchedNew = watch("new_password") ?? "";

  async function onSubmit(values: ChangePasswordForm) {
    try {
      await api.post("/auth/change-password", {
        current_password: values.current_password,
        new_password: values.new_password,
      });
      notifySuccess("Password changed", "You'll be signed out now. Sign back in with your new password.");
      reset();
      broadcastLogout("doctor");
      logout();
      router.replace("/doctor/login");
    } catch (error) {
      notifyApiError(error, "Couldn't change password");
    }
  }

  const fieldClass =
    "flex h-10 w-full rounded-xl border border-border/70 bg-background px-3 pr-10 text-sm outline-none transition focus-visible:border-brand/50 focus-visible:ring-2 focus-visible:ring-brand/10";

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-md">
      {/* Current password */}
      <div className="space-y-1.5">
        <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          Current password
        </label>
        <div className="relative">
          <input
            type={showCurrent ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Your current password"
            className={fieldClass}
            {...register("current_password")}
          />
          <button
            type="button"
            tabIndex={-1}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            onClick={() => setShowCurrent((v) => !v)}
          >
            {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {errors.current_password && (
          <p className="text-xs text-destructive">{errors.current_password.message}</p>
        )}
      </div>

      {/* New password */}
      <div className="space-y-1.5">
        <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          New password
        </label>
        <div className="relative">
          <input
            type={showNew ? "text" : "password"}
            autoComplete="new-password"
            placeholder="Create a strong password"
            className={fieldClass}
            {...register("new_password")}
          />
          <button
            type="button"
            tabIndex={-1}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            onClick={() => setShowNew((v) => !v)}
          >
            {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <PasswordStrengthBar password={watchedNew} />
        {errors.new_password && (
          <p className="text-xs text-destructive">{errors.new_password.message}</p>
        )}
      </div>

      {/* Confirm password */}
      <div className="space-y-1.5">
        <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          Confirm new password
        </label>
        <div className="relative">
          <input
            type={showConfirm ? "text" : "password"}
            autoComplete="new-password"
            placeholder="Repeat your new password"
            className={fieldClass}
            {...register("confirm_password")}
          />
          <button
            type="button"
            tabIndex={-1}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            onClick={() => setShowConfirm((v) => !v)}
          >
            {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {errors.confirm_password && (
          <p className="text-xs text-destructive">{errors.confirm_password.message}</p>
        )}
      </div>

      <div className="flex items-center gap-3 pt-1">
        <Button type="submit" size="sm" loading={isSubmitting}>
          <KeyRound className="h-3.5 w-3.5" />
          Update password
        </Button>
        <p className="text-xs text-slate-400">You'll be signed out after changing your password.</p>
      </div>
    </form>
  );
}

// ============================================================================
// HELPERS
// ============================================================================

function toDoctorSession(profile: DoctorProfile, currentDoctor: Doctor): Doctor {
  return {
    ...currentDoctor,
    id: profile.id,
    full_name: profile.full_name,
    email: profile.email,
    phone: profile.phone,
    registration_no: profile.registration_no,
    verification_status: profile.verification_status,
    is_admin: profile.is_admin,
    is_suspended: profile.is_suspended,
    profile_complete: profile.profile_complete,
    profile_photo: profile.profile_photo ?? currentDoctor.profile_photo ?? null,
  };
}

// Wizard shows only when the doctor hasn't filled the core wizard fields.
// profile_complete is a stricter composite (also needs photo, signature, availability)
// so using it as the wizard gate would trap doctors in an infinite loop.
function needsWizard(profile: DoctorProfile): boolean {
  return (
    !profile.specialization?.trim() ||
    !profile.about?.trim() ||
    !profile.available_modes?.length
  );
}

function formatModes(modes?: ("online" | "walk_in")[]) {
  if (!modes?.length) return "";
  return modes.map((mode) => (mode === "online" ? "Online" : "Walk-in")).join(" + ");
}

function formatMoney(value?: number | null) {
  if (value == null) return "-";
  return `\u20B9 ${value}`;
}

function listToText(values?: string[] | null) {
  return values?.length ? values.join(", ") : undefined;
}

function getInitials(name?: string | null) {
  return (
    name
      ?.split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "D"
  );
}
