"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { ArrowLeft, Eye, EyeOff, Loader2, Mail, ShieldCheck } from "lucide-react";

import api, { getApiError } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { useDoctorAuth } from "@/stores/doctor-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { DoctorLoginResponse, TOTPRequiredResponse } from "@/types/auth";

const loginSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

const verifySchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Enter a 6-digit code"),
});

type LoginForm = z.infer<typeof loginSchema>;
type VerifyForm = z.infer<typeof verifySchema>;

export default function DoctorLoginPage() {
  const { setAuth, isAuthenticated } = useDoctorAuth();
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      window.location.href = "/doctor/dashboard";
    }
  }, [isAuthenticated]);

  const [loginLoading, setLoginLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [authStep, setAuthStep] = useState<TOTPRequiredResponse["step"] | null>(null);
  const [tempToken, setTempToken] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  const {
    register: registerVerify,
    handleSubmit: handleVerifySubmit,
    reset: resetVerifyForm,
    formState: { errors: verifyErrors },
  } = useForm<VerifyForm>({
    resolver: zodResolver(verifySchema),
    defaultValues: { code: "" },
  });

  async function onSubmit(values: LoginForm) {
    setLoginLoading(true);
    try {
      const { data } = await api.post("/auth/login", values);
      if (data.step === "otp_required" || data.step === "totp_required") {
        const twoStep = data as TOTPRequiredResponse;
        setTempToken(twoStep.temp_token);
        setAuthStep(twoStep.step);
        setPendingEmail(values.email);
        resetVerifyForm({ code: "" });
        return;
      }
      const loginData = data as DoctorLoginResponse;
      setAuth(loginData.doctor);
      notifySuccess("Welcome back", "Your dashboard is ready.");
      window.location.href = !loginData.doctor.profile_complete ? "/doctor/profile" : "/doctor/dashboard";
    } catch (error) {
      notifyError("Couldn't sign you in", getApiError(error));
    } finally {
      setLoginLoading(false);
    }
  }

  async function onVerify(values: VerifyForm) {
    if (!tempToken || !authStep) return;
    setVerifyLoading(true);
    try {
      const endpoint =
        authStep === "totp_required" ? "/auth/totp/validate" : "/auth/otp/verify";
      const { data } = await api.post<DoctorLoginResponse>(endpoint, {
        temp_token: tempToken,
        code: values.code,
      });
      setTempToken(null);
      setAuthStep(null);
      setPendingEmail("");
      resetVerifyForm({ code: "" });
      setAuth(data.doctor);
      notifySuccess("Verification complete", "You're signed in and ready to continue.");
      window.location.href = !data.doctor.profile_complete ? "/doctor/profile" : "/doctor/dashboard";
    } catch (error) {
      notifyError("Couldn't verify code", getApiError(error));
    } finally {
      setVerifyLoading(false);
    }
  }

  function resetVerification() {
    setTempToken(null);
    setAuthStep(null);
    setPendingEmail("");
    resetVerifyForm({ code: "" });
  }

  const isVerifyStep = authStep !== null;
  const isTotp = authStep === "totp_required";

  const inputClass =
    "h-12 rounded-xl border-slate-200 bg-[#FAFAFA] px-4 shadow-none outline-none transition-colors focus-visible:border-[#166534] focus-visible:ring-[3px] focus-visible:ring-[#166534]/15 focus-visible:outline-none";

  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#f5f5f0,#eef0eb_40%,#f5f5f0)] p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-[960px] overflow-hidden rounded-[2rem] border border-slate-200/60 bg-white shadow-[0_25px_80px_-20px_rgba(15,23,42,0.18)] lg:grid lg:grid-cols-[1fr_1fr]">

        {/* ── Left panel — image ── */}
        <div className="relative hidden min-h-[600px] lg:block">
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
                priority
              />
            </Link>

            <div className="mt-auto">
              <h1 className="max-w-[20rem] text-[1.8rem] font-bold leading-[1.12] tracking-[-0.03em] text-white xl:text-[2.1rem]">
                Manage your entire{" "}
                <br />
                clinic day — in one place.
              </h1>
              <p className="mt-3 max-w-[18rem] text-[0.85rem] leading-relaxed text-white/50">
                Appointments, live calls, patient history, and digital prescriptions.
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
                priority
              />
            </Link>
          </div>

          {/* Form */}
          <div className="flex flex-1 flex-col justify-center">
            <div className="mx-auto w-full max-w-[420px]">

              {isVerifyStep ? (
                <>
                  <div className="mb-8">
                    <button
                      type="button"
                      className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-[#9CA3AF] transition-colors hover:text-brand-dark"
                      onClick={resetVerification}
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      Back to sign in
                    </button>
                    <h2 className="text-[2rem] font-extrabold tracking-[-0.03em] text-brand-dark leading-tight">
                      Verify your identity
                    </h2>
                    <p className="mt-2 text-[14px] leading-relaxed text-[#9CA3AF]">
                      {isTotp
                        ? "Enter the 6-digit code from your authenticator app."
                        : "Enter the 6-digit code sent to your email."}
                    </p>
                    {pendingEmail && (
                      <p className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-[#9CA3AF]">
                        {isTotp
                          ? <ShieldCheck className="h-3.5 w-3.5 text-[#166534]" />
                          : <Mail className="h-3.5 w-3.5 text-[#166534]" />}
                        {pendingEmail}
                      </p>
                    )}
                  </div>

                  <form onSubmit={handleVerifySubmit(onVerify)} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="code" className="text-[13px] font-medium text-brand-dark">
                        Verification code
                      </Label>
                      <Input
                        id="code"
                        type="text"
                        inputMode="numeric"
                        placeholder="000000"
                        maxLength={6}
                        autoComplete="one-time-code"
                        autoFocus
                        className={`${inputClass} text-center text-lg tracking-[0.38em]`}
                        {...registerVerify("code")}
                      />
                      {verifyErrors.code && (
                        <p className="text-[12px] text-[#C45454]">{verifyErrors.code.message}</p>
                      )}
                    </div>

                    <Button
                      type="submit"
                      disabled={verifyLoading}
                      className="h-12 w-full rounded-xl bg-[#166534] text-[14px] font-semibold text-white shadow-[0_8px_24px_-8px_rgba(22,101,52,0.35)] transition-all hover:bg-[#14532d] hover:shadow-[0_10px_28px_-8px_rgba(22,101,52,0.45)] disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                      {verifyLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Verifying…
                        </>
                      ) : "Verify and continue"}
                    </Button>
                  </form>
                </>
              ) : (
                <>
                  <div className="mb-8">
                    <h2 className="text-[2rem] font-extrabold tracking-[-0.03em] text-brand-dark leading-tight">
                      Welcome back
                    </h2>
                    <p className="mt-2 text-[14px] leading-relaxed text-[#9CA3AF]">
                      Sign in to your doctor workspace.
                    </p>
                  </div>

                  <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="email" className="text-[13px] font-medium text-brand-dark">
                        Email address
                      </Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="doctor@example.com"
                        autoComplete="email"
                        autoFocus
                        className={`${inputClass} ${errors.email ? "border-[#C45454]/60 bg-rose-50/40" : ""}`}
                        {...register("email")}
                      />
                      {errors.email && (
                        <p className="text-[12px] text-[#C45454]">{errors.email.message}</p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="password" className="text-[13px] font-medium text-brand-dark">
                          Password
                        </Label>
                        <Link
                          href="/doctor/forgot-password"
                          className="text-[13px] font-medium text-[#9CA3AF] transition-colors hover:text-[#166534]"
                        >
                          Forgot password?
                        </Link>
                      </div>
                      <div className="relative">
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          placeholder="Enter your password"
                          autoComplete="current-password"
                          className={`${inputClass} pr-11 ${errors.password ? "border-[#C45454]/60 bg-rose-50/40" : ""}`}
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

                    <div className="pt-1">
                      <Button
                        type="submit"
                        disabled={loginLoading}
                        className="h-12 w-full rounded-xl bg-[#166534] text-[14px] font-semibold text-white shadow-[0_8px_24px_-8px_rgba(22,101,52,0.35)] transition-all hover:bg-[#14532d] hover:shadow-[0_10px_28px_-8px_rgba(22,101,52,0.45)] disabled:opacity-70 disabled:cursor-not-allowed"
                      >
                        {loginLoading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Signing in…
                          </>
                        ) : "Sign in"}
                      </Button>
                    </div>
                  </form>

                  <p className="mt-6 text-[13px] text-[#9CA3AF]">
                    Don&apos;t have an account?{" "}
                    <Link
                      href="/doctor/register"
                      className="font-semibold text-[#166534] transition-colors hover:text-[#14532d]"
                    >
                      Join as a doctor
                    </Link>
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Legal */}
          <div className="mt-8">
            <p className="text-[11.5px] text-brand-subtext/45">
              By signing in, you agree to our{" "}
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
