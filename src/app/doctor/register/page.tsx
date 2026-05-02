"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import api, { getApiError } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const registerSchema = z
  .object({
    full_name: z.string().min(2, "Name must be at least 2 characters").max(80),
    email: z.email("Enter a valid email"),
    phone: z
      .string()
      .regex(/^\+[1-9]\d{7,14}$/, "Phone must be in format +91XXXXXXXXXX"),
    registration_no: z
      .string()
      .min(3, "Registration number is required")
      .max(50)
      .regex(/^[A-Za-z0-9/-]+$/, "Only letters, numbers, / and - allowed"),
    password: z
      .string()
      .min(8, "Minimum 8 characters")
      .max(128)
      .regex(/[A-Z]/, "Must contain an uppercase letter")
      .regex(/[0-9]/, "Must contain a number")
      .regex(/[^A-Za-z0-9]/, "Must contain a special character"),
    confirm_password: z.string(),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"],
  });

type RegisterForm = z.infer<typeof registerSchema>;

export default function DoctorRegisterPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) });

  async function onSubmit(values: RegisterForm) {
    setLoading(true);
    try {
      const { confirm_password: _, ...body } = values;
      await api.post("/auth/register", body);
      notifySuccess(
        "Account created",
        "Your profile is pending approval. Sign in after your account is approved.",
      );
      router.push("/doctor/login");
    } catch (error) {
      notifyError("Couldn't create account", getApiError(error));
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "h-12 rounded-xl border-slate-200 bg-[#FAFAFA] px-4 shadow-none focus-visible:border-[#166534]/50 focus-visible:ring-2 focus-visible:ring-[#166534]/10";

  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#f5f5f0,#eef0eb_40%,#f5f5f0)] p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-[1060px] overflow-hidden rounded-[2rem] border border-slate-200/60 bg-white shadow-[0_25px_80px_-20px_rgba(15,23,42,0.18)] lg:grid lg:grid-cols-[0.9fr_1.1fr]">

        {/* ── Left panel — image ── */}
        <div className="relative hidden min-h-[640px] lg:block">
          <Image
            src="/images/patient_login_page.png"
            alt="Homeopathy herbs and flowers"
            fill
            sizes="50vw"
            className="object-cover object-center"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/35 to-black/75" />

          <div className="absolute inset-0 flex flex-col p-10 xl:p-14">
            <Link href="/" className="block w-fit">
              <Image
                src="/images/logo.png"
                alt="eHomeo"
                width={130}
                height={36}
                className="h-8 w-auto brightness-0 invert"
              />
            </Link>

            <div className="mt-auto">
              <h1 className="max-w-[20rem] text-[1.8rem] font-bold leading-[1.12] tracking-[-0.03em] text-white xl:text-[2.1rem]">
                Set up your{" "}
                <br />
                doctor workspace.
              </h1>
              <p className="mt-3 max-w-[18rem] text-[0.85rem] leading-relaxed text-white/50">
                Appointments, live calls, patient history, and digital prescriptions — all in one place.
              </p>
              <p className="mt-6 text-[11px] text-white/30 tracking-wide">
                Secure · HIPAA-aware · Built for India
              </p>
            </div>
          </div>
        </div>

        {/* ── Right panel — form ── */}
        <div className="flex flex-col justify-between px-6 py-8 sm:px-10 sm:py-10 lg:px-10 xl:px-12">

          {/* Mobile logo */}
          <div className="mb-8 lg:hidden">
            <Link href="/" className="block w-fit">
              <Image
                src="/images/logo.png"
                alt="eHomeo"
                width={120}
                height={32}
                className="h-8 w-auto"
              />
            </Link>
          </div>

          {/* Form */}
          <div className="flex flex-1 flex-col justify-center">
            <div className="w-full">
              <div className="mb-8">
                <h2 className="text-[2rem] font-extrabold tracking-[-0.03em] text-brand-dark leading-tight">
                  Join as a doctor
                </h2>
                <p className="mt-2 text-[14px] leading-relaxed text-[#9CA3AF]">
                  Your account will be reviewed before activation.
                </p>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                {/* Row 1: Name | Email */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="full_name" className="text-[11.5px] font-semibold uppercase tracking-[0.05em] text-[#6B7280]">
                      Full name
                    </Label>
                    <Input
                      id="full_name"
                      placeholder="Dr. John Doe"
                      autoComplete="name"
                      autoFocus
                      className={inputClass}
                      {...register("full_name")}
                    />
                    {errors.full_name && (
                      <p className="text-[12px] text-[#C45454]">{errors.full_name.message}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-[11.5px] font-semibold uppercase tracking-[0.05em] text-[#6B7280]">
                      Email address
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="doctor@example.com"
                      autoComplete="email"
                      className={inputClass}
                      {...register("email")}
                    />
                    {errors.email && (
                      <p className="text-[12px] text-[#C45454]">{errors.email.message}</p>
                    )}
                  </div>
                </div>

                {/* Row 2: Phone | Registration no. */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="phone" className="text-[11.5px] font-semibold uppercase tracking-[0.05em] text-[#6B7280]">
                      Phone number
                    </Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="+919876543210"
                      autoComplete="tel"
                      className={inputClass}
                      {...register("phone")}
                    />
                    {errors.phone && (
                      <p className="text-[12px] text-[#C45454]">{errors.phone.message}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="registration_no" className="text-[11.5px] font-semibold uppercase tracking-[0.05em] text-[#6B7280]">
                      Medical registration no.
                    </Label>
                    <Input
                      id="registration_no"
                      placeholder="e.g. MCI/2024/12345"
                      className={inputClass}
                      {...register("registration_no")}
                    />
                    {errors.registration_no && (
                      <p className="text-[12px] text-[#C45454]">{errors.registration_no.message}</p>
                    )}
                  </div>
                </div>

                {/* Row 3: Password | Confirm password */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="password" className="text-[11.5px] font-semibold uppercase tracking-[0.05em] text-[#6B7280]">
                      Password
                    </Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Min 8 characters"
                        autoComplete="new-password"
                        className={`${inputClass} pr-11`}
                        {...register("password")}
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-brand-subtext transition-colors hover:text-brand-dark"
                        onClick={() => setShowPassword((v) => !v)}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {errors.password && (
                      <p className="text-[12px] text-[#C45454]">{errors.password.message}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="confirm_password" className="text-[11.5px] font-semibold uppercase tracking-[0.05em] text-[#6B7280]">
                      Confirm password
                    </Label>
                    <Input
                      id="confirm_password"
                      type="password"
                      placeholder="Re-enter password"
                      autoComplete="new-password"
                      className={inputClass}
                      {...register("confirm_password")}
                    />
                    {errors.confirm_password && (
                      <p className="text-[12px] text-[#C45454]">{errors.confirm_password.message}</p>
                    )}
                  </div>
                </div>

                <div className="pt-1">
                  <Button
                    type="submit"
                    disabled={loading}
                    className="h-12 w-full rounded-xl bg-[#166534] text-[14px] font-semibold text-white shadow-[0_4px_14px_0_rgba(17,85,32,0.20)] transition-all hover:bg-[#14532d] hover:shadow-[0_6px_18px_0_rgba(17,85,32,0.25)] disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating account…
                      </>
                    ) : "Join as a doctor"}
                  </Button>
                </div>
              </form>

              <p className="mt-3 text-[13px] text-[#9CA3AF]">
                Already have an account?{" "}
                <Link
                  href="/doctor/login"
                  className="font-semibold text-[#166534] transition-colors hover:text-[#14532d]"
                >
                  Sign in
                </Link>
              </p>
            </div>
          </div>

          {/* Legal */}
          <div className="mt-6">
            <p className="text-[11px] text-[#9CA3AF]/60">
              By registering, you agree to our{" "}
              <Link href="/terms-and-conditions" className="underline underline-offset-2 transition-colors hover:text-brand-subtext">
                Terms
              </Link>{" "}
              and{" "}
              <Link href="/privacy-policy" className="underline underline-offset-2 transition-colors hover:text-brand-subtext">
                Privacy Policy
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
