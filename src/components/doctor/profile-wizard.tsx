"use client";

import { useState, useRef, type ComponentType } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  FileSignature,
  ImagePlus,
  Loader2,
  Stethoscope,
  Upload,
  User,
  Settings,
  FileCheck,
  Sparkles,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import api from "@/lib/api";
import { notifyApiError, notifyError, notifySuccess } from "@/lib/notify";
import { validateImageFile } from "@/lib/validate-image";
import { useDoctorAuth } from "@/stores/doctor-auth";
import type { DoctorProfile, DoctorProfileUpdate } from "@/types/doctor";
import { cn } from "@/lib/utils";

// ============================================================================
// TYPES & DATA
// ============================================================================

const STEPS = [
  { id: 1, name: "Personal Info",   description: "Your identity & intro",        icon: User },
  { id: 2, name: "Professional",    description: "Specialization & experience",   icon: Stethoscope },
  { id: 3, name: "Consultation",    description: "Modes & pricing",               icon: Settings },
  { id: 4, name: "Profile Assets",  description: "Photo & signature upload",      icon: Camera },
  { id: 5, name: "Review",          description: "Confirm & complete",            icon: FileCheck },
] as const;

// ============================================================================
// ANIMATION VARIANTS
// ============================================================================

const containerVariants: Variants = {
  hidden: { opacity: 0, scale: 0.97 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
};

const contentVariants: Variants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 40 : -40,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] },
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -40 : 40,
    opacity: 0,
    transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] },
  }),
};

// ============================================================================
// SIDEBAR STEP
// ============================================================================

function SidebarStep({
  step,
  index,
  currentStep,
  total,
}: {
  step: (typeof STEPS)[number];
  index: number;
  currentStep: number;
  total: number;
}) {
  const Icon = step.icon;
  const isCompleted = currentStep > step.id;
  const isCurrent = currentStep === step.id;

  return (
    <div className="relative flex items-center gap-4 py-3.5">
      {/* Vertical connector line */}
      {index < total - 1 && (
        <div className="absolute left-[23px] top-[52px] h-[calc(100%-20px)] w-[2px] rounded-full bg-slate-200/80">
          <motion.div
            className="w-full rounded-full bg-brand"
            initial={{ height: "0%" }}
            animate={{ height: isCompleted ? "100%" : "0%" }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
      )}

      {/* Icon circle */}
      <motion.div
        className={cn(
          "relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300",
          isCompleted
            ? "border-brand bg-brand text-white"
            : isCurrent
              ? "border-brand bg-white text-brand shadow-[0_0_0_4px_rgba(88,155,255,0.12)]"
              : "border-slate-200 bg-slate-50 text-slate-400"
        )}
        whileHover={{ scale: 1.05 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
      >
        {isCompleted ? (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 15 }}
          >
            <Check className="h-5 w-5" strokeWidth={2.5} />
          </motion.div>
        ) : (
          <Icon className="h-5 w-5" />
        )}
      </motion.div>

      {/* Text */}
      <div className="flex flex-col">
        <span
          className={cn(
            "text-sm font-semibold transition-colors duration-300",
            isCurrent || isCompleted ? "text-slate-900" : "text-slate-400"
          )}
        >
          {step.name}
        </span>
        <span className="text-xs text-slate-400">{step.description}</span>
      </div>
    </div>
  );
}

// ============================================================================
// FORM FIELD
// ============================================================================

function WizardField({
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
      <label className="mb-2 block text-[13px] font-medium text-slate-700">
        {label}
        {required && <span className="ml-1 text-red-400">*</span>}
      </label>
      {children}
    </div>
  );
}

// ============================================================================
// REVIEW COMPONENTS
// ============================================================================

function ReviewRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="shrink-0 text-[13px] text-slate-500">{label}</span>
      <span className="text-right text-[13px] font-medium text-slate-900">{value || "—"}</span>
    </div>
  );
}

function ReviewBio({ value }: { value?: string | null }) {
  if (!value?.trim()) return (
    <p className="mt-2 text-[13px] italic text-slate-400">No bio added.</p>
  );
  return (
    <p className="mt-2 rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3 text-[13px] leading-6 text-slate-700">
      {value.trim()}
    </p>
  );
}

function ReviewSection({
  icon: Icon,
  title,
  children,
  delay,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl border border-slate-100 bg-slate-50/40 p-5"
    >
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand/10">
          <Icon className="h-3.5 w-3.5 text-brand" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{title}</p>
      </div>
      {children}
    </motion.div>
  );
}

function ReviewChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-brand/8 px-2.5 py-1 text-xs font-medium text-brand">
      {label}
    </span>
  );
}

// ============================================================================
// MODE TOGGLE
// ============================================================================

function ModeToggle({
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
      className={cn(
        "rounded-2xl border-2 px-5 py-5 text-left transition-all duration-200",
        active
          ? "border-brand bg-brand/[0.06] shadow-[0_4px_20px_rgba(88,155,255,0.12)]"
          : "border-slate-200 bg-white hover:border-slate-300"
      )}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="mt-0.5 text-xs text-slate-500">{description}</p>
        </div>
        <div
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-full border-2 transition-all",
            active ? "border-brand bg-brand" : "border-slate-300 bg-white"
          )}
        >
          {active && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
        </div>
      </div>
    </button>
  );
}

// ============================================================================
// CROP UTILITIES
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

// ============================================================================
// MAIN WIZARD
// ============================================================================

export function ProfileWizard({
  profile,
  onComplete,
}: {
  profile: DoctorProfile;
  onComplete: (updatedProfile: DoctorProfile) => void;
}) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Cropper = require("react-easy-crop").default;
  const router = useRouter();
  const authDoctor = useDoctorAuth((s) => s.doctor);
  const setDoctor = useDoctorAuth((s) => s.setDoctor);

  const [currentStep, setCurrentStep] = useState(1);
  const [direction, setDirection] = useState(1);
  const [saving, setSaving] = useState(false);
  const [completedData, setCompletedData] = useState<DoctorProfile | null>(null);

  // Asset upload state — persists across steps
  const [photoUrl, setPhotoUrl] = useState<string | null>(profile.profile_photo ?? null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(profile.signature_url ?? null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingSignature, setUploadingSignature] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const sigInputRef = useRef<HTMLInputElement>(null);

  // Photo crop state
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<{
    x: number; y: number; width: number; height: number;
  } | null>(null);

  const { register, handleSubmit, watch } = useForm<DoctorProfileUpdate>({
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

  function toggleMode(mode: "online" | "walk_in") {
    setModes((prev) => (prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode]));
  }

  // Opens the crop modal when a photo is selected
  async function handlePhotoFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const validation = await validateImageFile(file);
    if (!validation.valid) {
      notifyError("Invalid file", validation.error ?? "Please upload a JPEG, PNG, or WebP image.");
      if (photoInputRef.current) photoInputRef.current.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setCropImageSrc(reader.result as string);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
    };
    reader.readAsDataURL(file);
  }

  // Called when user confirms the crop and clicks "Upload Photo"
  async function handleUploadCropped() {
    if (!cropImageSrc || !croppedAreaPixels) return;
    setUploadingPhoto(true);
    try {
      const croppedBlob = await getCroppedBlob(cropImageSrc, croppedAreaPixels);
      const file = new File([croppedBlob], "profile-photo.webp", { type: "image/webp" });
      const formData = new FormData();
      formData.append("file", file);
      const { data } = await api.post<Record<string, string>>("/doctor/profile/photo", formData);
      const url = data?.profile_photo;
      if (url) setPhotoUrl(url);
      setCropImageSrc(null);
      if (photoInputRef.current) photoInputRef.current.value = "";
    } catch (err) {
      notifyApiError(err, "Upload failed. Please try again.");
    } finally {
      setUploadingPhoto(false);
    }
  }

  // Signature: direct upload (no crop), with magic byte validation
  async function handleSignatureFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const validation = await validateImageFile(file);
    if (!validation.valid) {
      notifyError("Invalid file", validation.error ?? "Please upload a JPEG, PNG, or WebP image.");
      if (sigInputRef.current) sigInputRef.current.value = "";
      return;
    }

    setUploadingSignature(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { data } = await api.post<Record<string, string>>("/doctor/profile/signature", formData);
      const url = data?.signature_url;
      if (url) setSignatureUrl(url);
    } catch (err) {
      notifyApiError(err, "Upload failed. Please try again.");
    } finally {
      setUploadingSignature(false);
      if (sigInputRef.current) sigInputRef.current.value = "";
    }
  }

  function goNext() {
    if (currentStep < STEPS.length) {
      setDirection(1);
      setCurrentStep((s) => s + 1);
    }
  }

  function goBack() {
    if (currentStep > 1) {
      setDirection(-1);
      setCurrentStep((s) => s - 1);
    }
  }

  async function onSubmit(data: DoctorProfileUpdate) {
    setSaving(true);
    try {
      const payload: DoctorProfileUpdate = {
        ...data,
        about: data.about?.trim() || undefined,
        specialization: data.specialization?.trim() || undefined,
        qualifications: qualStr.split(",").map((v) => v.trim()).filter(Boolean),
        languages: langStr.split(",").map((v) => v.trim()).filter(Boolean),
        available_modes: modes,
        online_fee: modes.includes("online") ? data.online_fee : undefined,
        walkin_fee: modes.includes("walk_in") ? data.walkin_fee : undefined,
      };

      const { data: updatedProfile } = await api.put<DoctorProfile>("/doctor/profile", payload);

      if (authDoctor) {
        setDoctor({
          ...authDoctor,
          full_name: updatedProfile.full_name,
          phone: updatedProfile.phone,
          profile_complete: updatedProfile.profile_complete,
          verification_status: updatedProfile.verification_status,
          profile_photo: updatedProfile.profile_photo ?? authDoctor.profile_photo ?? null,
        });
      }

      notifySuccess("Profile saved!", "Next: set your availability.");
      // Show celebration screen, then update cache + navigate to availability setup
      setCompletedData(updatedProfile);
      setTimeout(() => {
        onComplete(updatedProfile);
        router.push("/doctor/availability?onboarding=1");
      }, 2400);
    } catch (error) {
      notifyApiError(error, "Couldn't save profile");
    } finally {
      setSaving(false);
    }
  }

  const watched = watch();
  const progress = ((currentStep - 1) / (STEPS.length - 1)) * 100;

  // ── CELEBRATION / TRANSITION SCREEN ──
  if (completedData) {
    const firstName = completedData.full_name.split(" ")[0];
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-brand-bg px-4">
        {/* Animated ring */}
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 180, damping: 14 }}
          className="relative"
        >
          <div className="flex h-28 w-28 items-center justify-center rounded-full bg-brand/10">
            <CheckCircle2 className="h-14 w-14 text-brand" strokeWidth={1.5} />
          </div>
          {/* Orbiting sparkle */}
          <motion.div
            className="absolute -right-1 -top-1 flex h-8 w-8 items-center justify-center rounded-full bg-brand-accent shadow-md"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.4, type: "spring", stiffness: 300, damping: 12 }}
          >
            <Sparkles className="h-4 w-4 text-brand-dark" />
          </motion.div>
        </motion.div>

        {/* Text block */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="mt-8 text-center"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">
            Step 1 of 2 complete
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-[-0.03em] text-slate-900 sm:text-4xl">
            Great work, Dr. {firstName}!
          </h2>
          <p className="mt-2 text-base text-slate-500">
            Profile saved. Next up — set your availability.
          </p>
        </motion.div>

        {/* Two-step onboarding track */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="mt-10 flex items-center gap-3"
        >
          {/* Step 1 — done */}
          <div className="flex items-center gap-2 rounded-full border border-brand/20 bg-brand/8 px-4 py-2">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-brand">
              <Check className="h-3 w-3 text-white" strokeWidth={3} />
            </div>
            <span className="text-sm font-semibold text-brand">Profile Setup</span>
          </div>

          {/* Connector */}
          <div className="relative h-px w-8 bg-slate-200">
            <motion.div
              className="absolute inset-0 bg-brand"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.7, duration: 0.4, ease: "easeOut" }}
              style={{ originX: 0 }}
            />
          </div>

          {/* Step 2 — next */}
          <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 shadow-sm">
            <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-slate-300 bg-white">
              <Calendar className="h-2.5 w-2.5 text-slate-400" />
            </div>
            <span className="text-sm font-semibold text-slate-600">Availability</span>
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
              NEXT
            </span>
          </div>
        </motion.div>

        {/* Loading indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7, duration: 0.4 }}
          className="mt-8 flex flex-col items-center gap-2"
        >
          <p className="text-xs text-slate-400">Setting up your availability page…</p>
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="h-1.5 w-1.5 rounded-full bg-brand/50"
                animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
                transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
              />
            ))}
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen w-full bg-brand-bg">
      {/* Top bar with logo */}
      <div className="flex items-center px-6 py-4 sm:px-8">
        <Image
          src="/images/logo.png"
          alt="eHomeo"
          width={110}
          height={36}
          className="h-7 w-auto object-contain"
          priority
        />
      </div>

      <div className="mx-auto max-w-5xl px-2 pb-10 sm:px-4 lg:px-8">
        {/* Header */}
        <motion.div
          className="mb-8 text-center sm:mb-10"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-brand/15 bg-brand/[0.06] px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-brand">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
            Profile Setup
          </div>
          <h1 className="text-2xl font-bold tracking-[-0.03em] text-slate-900 sm:text-3xl">
            Complete Your Profile
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Fill in your details so patients can find and book appointments with you.
          </p>
        </motion.div>

        {/* Main card */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="overflow-hidden rounded-3xl border border-slate-200/60 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.06)]"
        >
          {/* Top progress bar */}
          <div className="h-1 w-full bg-slate-100">
            <motion.div
              className="h-full bg-brand"
              initial={{ width: "0%" }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>

          <div className="grid lg:grid-cols-[280px_1fr]">
            {/* Sidebar */}
            <div className="border-b border-slate-200/60 bg-slate-50/50 p-6 lg:border-b-0 lg:border-r lg:p-8">
              <div className="hidden lg:block">
                {STEPS.map((step, i) => (
                  <SidebarStep
                    key={step.id}
                    step={step}
                    index={i}
                    currentStep={currentStep}
                    total={STEPS.length}
                  />
                ))}
              </div>
              {/* Mobile step indicator */}
              <div className="flex items-center justify-between lg:hidden">
                <p className="text-sm font-semibold text-slate-900">
                  Step {currentStep} of {STEPS.length}
                </p>
                <p className="text-sm text-slate-500">{STEPS[currentStep - 1].name}</p>
              </div>
            </div>

            {/* Content */}
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col">
              <div className="flex-1 p-6 sm:p-8 lg:p-10">
                <AnimatePresence mode="wait" custom={direction}>
                  <motion.div
                    key={currentStep}
                    custom={direction}
                    variants={contentVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    className="space-y-7"
                  >
                    {/* Step header */}
                    <div>
                      <h2 className="text-xl font-semibold tracking-[-0.02em] text-slate-900">
                        {STEPS[currentStep - 1].name}
                      </h2>
                      <p className="mt-1 text-sm text-slate-500">
                        {STEPS[currentStep - 1].description}
                      </p>
                    </div>

                    {/* Step 1: Personal Info */}
                    {currentStep === 1 && (
                      <div className="space-y-5">
                        <div className="grid gap-5 sm:grid-cols-2">
                          <WizardField label="Full Name" required>
                            <Input
                              {...register("full_name")}
                              placeholder="Dr. John Doe"
                              className="h-11 rounded-xl"
                            />
                          </WizardField>
                          <WizardField label="Phone" required>
                            <Input
                              {...register("phone")}
                              placeholder="+91 98765 43210"
                              className="h-11 rounded-xl"
                            />
                          </WizardField>
                        </div>
                        <WizardField label="Gender">
                          <select
                            {...register("gender")}
                            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                          >
                            <option value="">Select gender</option>
                            <option value="male">Male</option>
                            <option value="female">Female</option>
                            <option value="other">Other</option>
                          </select>
                        </WizardField>
                        <WizardField label="Professional About">
                          <Textarea
                            {...register("about")}
                            rows={4}
                            placeholder="Describe your practice style, approach, and areas of focus..."
                            className="rounded-xl"
                          />
                        </WizardField>
                      </div>
                    )}

                    {/* Step 2: Professional */}
                    {currentStep === 2 && (
                      <div className="space-y-5">
                        <div className="grid gap-5 sm:grid-cols-2">
                          <WizardField label="Specialization" required>
                            <Input
                              {...register("specialization")}
                              placeholder="e.g. Classical Homeopathy"
                              className="h-11 rounded-xl"
                            />
                          </WizardField>
                          <WizardField label="Experience (years)">
                            <Input
                              type="number"
                              {...register("experience_years", { valueAsNumber: true })}
                              placeholder="e.g. 10"
                              className="h-11 rounded-xl"
                            />
                          </WizardField>
                        </div>
                        <WizardField label="Qualifications">
                          <Input
                            value={qualStr}
                            onChange={(e) => setQualStr(e.target.value)}
                            placeholder="BHMS, MD (Hom) — separate with commas"
                            className="h-11 rounded-xl"
                          />
                          {qualStr && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {qualStr.split(",").map((q) => q.trim()).filter(Boolean).map((q) => (
                                <span key={q} className="rounded-full bg-brand/8 px-2.5 py-1 text-xs font-medium text-brand">
                                  {q}
                                </span>
                              ))}
                            </div>
                          )}
                        </WizardField>
                        <WizardField label="Languages">
                          <Input
                            value={langStr}
                            onChange={(e) => setLangStr(e.target.value)}
                            placeholder="English, Hindi, Bengali — separate with commas"
                            className="h-11 rounded-xl"
                          />
                          {langStr && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {langStr.split(",").map((l) => l.trim()).filter(Boolean).map((l) => (
                                <span key={l} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                                  {l}
                                </span>
                              ))}
                            </div>
                          )}
                        </WizardField>
                      </div>
                    )}

                    {/* Step 3: Consultation */}
                    {currentStep === 3 && (
                      <div className="space-y-6">
                        <div>
                          <p className="mb-3 text-[13px] font-medium text-slate-700">
                            Available modes <span className="text-red-400">*</span>
                          </p>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <ModeToggle
                              active={modes.includes("online")}
                              title="Online"
                              description="Video consultations from anywhere"
                              onClick={() => toggleMode("online")}
                            />
                            <ModeToggle
                              active={modes.includes("walk_in")}
                              title="Walk-in"
                              description="In-clinic appointments"
                              onClick={() => toggleMode("walk_in")}
                            />
                          </div>
                        </div>

                        <div className="grid gap-5 sm:grid-cols-2">
                          {modes.includes("online") && (
                            <WizardField label="Online Fee (Rs)">
                              <Input
                                type="number"
                                {...register("online_fee", { valueAsNumber: true })}
                                placeholder="e.g. 500"
                                className="h-11 rounded-xl"
                              />
                            </WizardField>
                          )}
                          {modes.includes("walk_in") && (
                            <WizardField label="Walk-in Fee (Rs)">
                              <Input
                                type="number"
                                {...register("walkin_fee", { valueAsNumber: true })}
                                placeholder="e.g. 400"
                                className="h-11 rounded-xl"
                              />
                            </WizardField>
                          )}
                        </div>

                        {modes.length === 0 && (
                          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                            Select at least one consultation mode to continue.
                          </p>
                        )}
                      </div>
                    )}

                    {/* Step 4: Profile Assets */}
                    {currentStep === 4 && (
                      <div className="space-y-6">
                        <p className="text-[13px] text-slate-500 leading-relaxed">
                          Your photo and signature are required to appear in public listings and on digital prescriptions.
                          Both must be uploaded to complete your profile.
                        </p>

                        {/* Profile Photo */}
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/40 p-5">
                          <div className="mb-4 flex items-center gap-2">
                            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand/10">
                              <Camera className="h-3.5 w-3.5 text-brand" />
                            </div>
                            <p className="text-[13px] font-semibold text-slate-800">
                              Profile Photo <span className="text-red-400">*</span>
                            </p>
                            {photoUrl && (
                              <span className="ml-auto rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">
                                ✓ Uploaded
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-5">
                            {/* Preview */}
                            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-slate-200 bg-white">
                              {photoUrl ? (
                                <img src={photoUrl} alt="Photo preview" className="h-full w-full object-cover" />
                              ) : (
                                <ImagePlus className="h-7 w-7 text-slate-300" />
                              )}
                            </div>
                            <div className="flex-1">
                              <p className="mb-2 text-xs text-slate-500">
                                JPEG, PNG or WebP · Max 5 MB · Cropped to 1:1 square
                              </p>
                              <input
                                ref={photoInputRef}
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                className="hidden"
                                onChange={handlePhotoFileSelect}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={uploadingPhoto}
                                onClick={() => photoInputRef.current?.click()}
                                className="gap-2"
                              >
                                {uploadingPhoto ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                                {uploadingPhoto ? "Uploading…" : photoUrl ? "Change photo" : "Upload photo"}
                              </Button>
                            </div>
                          </div>
                        </div>

                        {/* Doctor Signature */}
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/40 p-5">
                          <div className="mb-4 flex items-center gap-2">
                            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand/10">
                              <FileSignature className="h-3.5 w-3.5 text-brand" />
                            </div>
                            <p className="text-[13px] font-semibold text-slate-800">
                              Doctor Signature <span className="text-red-400">*</span>
                            </p>
                            {signatureUrl && (
                              <span className="ml-auto rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">
                                ✓ Uploaded
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-5">
                            {/* Preview */}
                            <div className="flex h-14 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-slate-200 bg-white">
                              {signatureUrl ? (
                                <img src={signatureUrl} alt="Signature preview" className="h-full w-full object-contain p-1" />
                              ) : (
                                <FileSignature className="h-6 w-6 text-slate-300" />
                              )}
                            </div>
                            <div className="flex-1">
                              <p className="mb-2 text-xs text-slate-500">
                                Upload a clear image of your handwritten signature · PNG recommended
                              </p>
                              <input
                                ref={sigInputRef}
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                className="hidden"
                                onChange={handleSignatureFileSelect}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={uploadingSignature}
                                onClick={() => sigInputRef.current?.click()}
                                className="gap-2"
                              >
                                {uploadingSignature ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                                {uploadingSignature ? "Uploading…" : signatureUrl ? "Change signature" : "Upload signature"}
                              </Button>
                            </div>
                          </div>
                        </div>

                        {/* Warning if incomplete */}
                        {(!photoUrl || !signatureUrl) && (
                          <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-700"
                          >
                            Both uploads are required. They will be shown on your public profile and digital prescriptions.
                          </motion.p>
                        )}
                      </div>
                    )}

                    {/* Step 5: Review */}
                    {currentStep === 5 && (
                      <div className="space-y-4">
                        {/* Personal Info */}
                        <ReviewSection icon={User} title="Personal Info" delay={0}>
                          <div className="divide-y divide-slate-100">
                            <ReviewRow label="Full Name" value={watched.full_name} />
                            <ReviewRow label="Phone" value={watched.phone} />
                            <ReviewRow label="Gender" value={watched.gender} />
                          </div>
                          {watched.about?.trim() && (
                            <div className="mt-1 border-t border-slate-100 pt-2.5">
                              <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1.5">About / Bio</p>
                              <ReviewBio value={watched.about} />
                            </div>
                          )}
                        </ReviewSection>

                        {/* Professional Details */}
                        <ReviewSection icon={Stethoscope} title="Professional Details" delay={0.06}>
                          <div className="divide-y divide-slate-100">
                            <ReviewRow label="Specialization" value={watched.specialization} />
                            <ReviewRow
                              label="Experience"
                              value={watched.experience_years ? `${watched.experience_years} years` : undefined}
                            />
                          </div>
                          {qualStr.trim() && (
                            <div className="mt-3 border-t border-slate-100 pt-3">
                              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-slate-400">Qualifications</p>
                              <div className="flex flex-wrap gap-1.5">
                                {qualStr.split(",").map((q) => q.trim()).filter(Boolean).map((q) => (
                                  <ReviewChip key={q} label={q} />
                                ))}
                              </div>
                            </div>
                          )}
                          {langStr.trim() && (
                            <div className="mt-3 border-t border-slate-100 pt-3">
                              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-slate-400">Languages</p>
                              <div className="flex flex-wrap gap-1.5">
                                {langStr.split(",").map((l) => l.trim()).filter(Boolean).map((l) => (
                                  <span key={l} className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                                    {l}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </ReviewSection>

                        {/* Consultation */}
                        <ReviewSection icon={Settings} title="Consultation Setup" delay={0.12}>
                          {modes.length === 0 ? (
                            <p className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                              No consultation mode selected — go back to step 3.
                            </p>
                          ) : (
                            <div className="space-y-3">
                              <div className="flex flex-wrap gap-2">
                                {modes.map((m) => (
                                  <span key={m} className="inline-flex items-center gap-1.5 rounded-full border border-brand/20 bg-brand/8 px-3 py-1.5 text-xs font-semibold text-brand">
                                    <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                                    {m === "online" ? "Online (Video)" : "Walk-in (Clinic)"}
                                  </span>
                                ))}
                              </div>
                              <div className="divide-y divide-slate-100">
                                {modes.includes("online") && (
                                  <ReviewRow
                                    label="Online consultation fee"
                                    value={watched.online_fee ? `₹ ${watched.online_fee}` : "Not set"}
                                  />
                                )}
                                {modes.includes("walk_in") && (
                                  <ReviewRow
                                    label="Walk-in consultation fee"
                                    value={watched.walkin_fee ? `₹ ${watched.walkin_fee}` : "Not set"}
                                  />
                                )}
                              </div>
                            </div>
                          )}
                        </ReviewSection>

                        {/* Profile Assets Review */}
                        <ReviewSection icon={Camera} title="Profile Assets" delay={0.18}>
                          <div className="flex gap-5">
                            <div className="text-center">
                              <div className="mx-auto flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                                {photoUrl
                                  ? <img src={photoUrl} alt="Photo" className="h-full w-full object-cover" />
                                  : <Camera className="h-5 w-5 text-slate-400" />
                                }
                              </div>
                              <p className={cn("mt-1.5 text-[11px] font-medium", photoUrl ? "text-emerald-600" : "text-red-400")}>
                                {photoUrl ? "✓ Photo" : "✗ Missing"}
                              </p>
                            </div>
                            <div className="text-center">
                              <div className="mx-auto flex h-14 w-24 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                                {signatureUrl
                                  ? <img src={signatureUrl} alt="Signature" className="h-full w-full object-contain p-1" />
                                  : <FileSignature className="h-5 w-5 text-slate-400" />
                                }
                              </div>
                              <p className={cn("mt-1.5 text-[11px] font-medium", signatureUrl ? "text-emerald-600" : "text-red-400")}>
                                {signatureUrl ? "✓ Signature" : "✗ Missing"}
                              </p>
                            </div>
                          </div>
                          {(!photoUrl || !signatureUrl) && (
                            <p className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-[12px] text-red-600">
                              Go back to step 4 to upload missing assets before completing.
                            </p>
                          )}
                        </ReviewSection>

                        {/* Next step hint */}
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.25, duration: 0.4 }}
                          className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-3.5"
                        >
                          <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                          <div>
                            <p className="text-[13px] font-semibold text-blue-800">One more step: Set your availability</p>
                            <p className="mt-0.5 text-[12px] text-blue-600">
                              After saving, you'll set your weekly schedule. Once admin-verified, you'll appear in listings.
                            </p>
                          </div>
                        </motion.div>
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Footer navigation */}
              <div className="flex items-center justify-between border-t border-slate-200/60 px-6 py-5 sm:px-8 lg:px-10">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={goBack}
                  disabled={currentStep === 1}
                  className="gap-2 text-slate-500 hover:text-slate-900 disabled:opacity-40"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>

                {currentStep < STEPS.length ? (
                  <Button
                    type="button"
                    onClick={goNext}
                    disabled={currentStep === 4 && (!photoUrl || !signatureUrl)}
                    className="gap-2 rounded-full bg-brand px-7 hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next Step
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <motion.div
                    whileHover={{ scale: modes.length > 0 && !saving ? 1.03 : 1 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <Button
                      type="submit"
                      disabled={saving || modes.length === 0 || !photoUrl || !signatureUrl}
                      className="relative gap-2 overflow-hidden rounded-full bg-brand px-8 py-2.5 text-white shadow-[0_8px_24px_rgba(59,130,246,0.3)] transition-shadow hover:shadow-[0_12px_32px_rgba(59,130,246,0.4)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {/* Shimmer effect */}
                      {!saving && modes.length > 0 && (
                        <motion.div
                          className="absolute inset-0 -skew-x-12 bg-white/10"
                          initial={{ x: "-100%" }}
                          animate={{ x: "200%" }}
                          transition={{ duration: 2, repeat: Infinity, repeatDelay: 1, ease: "easeInOut" }}
                        />
                      )}
                      {saving ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          Complete Profile
                          <CheckCircle2 className="h-4 w-4" />
                        </>
                      )}
                    </Button>
                  </motion.div>
                )}
              </div>
            </form>
          </div>
        </motion.div>
      </div>

      {/* ── Photo Crop Modal ── */}
      {cropImageSrc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200/80 px-6 py-4">
              <div>
                <h3 className="text-base font-semibold text-slate-950">Crop Profile Photo</h3>
                <p className="mt-0.5 text-xs text-slate-500">Square crop ensures consistent display on public listings</p>
              </div>
              <button
                type="button"
                onClick={() => { setCropImageSrc(null); if (photoInputRef.current) photoInputRef.current.value = ""; }}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Crop area */}
            <div className="relative h-[340px] bg-slate-900">
              <Cropper
                image={cropImageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="rect"
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_: unknown, pixels: { x: number; y: number; width: number; height: number }) => setCroppedAreaPixels(pixels)}
              />
            </div>

            {/* Zoom slider */}
            <div className="px-6 py-3 border-b border-slate-100">
              <label className="flex items-center gap-3 text-xs text-slate-500">
                <span className="shrink-0 font-medium">Zoom</span>
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

            {/* Actions */}
            <div className="flex gap-3 px-6 py-4">
              <Button
                type="button"
                onClick={handleUploadCropped}
                loading={uploadingPhoto}
                className="flex-1 gap-2"
              >
                {!uploadingPhoto && <Upload className="h-4 w-4" />}
                {uploadingPhoto ? "Uploading…" : "Upload Photo"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => { setCropImageSrc(null); if (photoInputRef.current) photoInputRef.current.value = ""; }}
              >
                Cancel
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
