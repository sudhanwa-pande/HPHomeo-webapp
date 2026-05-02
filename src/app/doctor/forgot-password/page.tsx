"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Mail,
  ShieldCheck,
} from "lucide-react";

import api, { getApiError } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ── Schemas ────────────────────────────────────────────────────────────────────

const emailSchema = z.object({
  email: z.email("Enter a valid email address"),
});

const resetSchema = z
  .object({
    code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code from your email"),
    new_password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Must contain an uppercase letter")
      .regex(/\d/, "Must contain a number")
      .regex(/[^A-Za-z0-9]/, "Must contain a special character"),
    confirm_password: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"],
  });

type EmailForm = z.infer<typeof emailSchema>;
type ResetForm = z.infer<typeof resetSchema>;

// ── Password strength ──────────────────────────────────────────────────────────

function PasswordStrength({ password }: { password: string }) {
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

// ── Main component ─────────────────────────────────────────────────────────────

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "reset" | "done">("email");
  const [pendingEmail, setPendingEmail] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => { if (cooldownRef.current) clearInterval(cooldownRef.current); };
  }, []);

  const emailForm = useForm<EmailForm>({ resolver: zodResolver(emailSchema) });
  const resetForm = useForm<ResetForm>({ resolver: zodResolver(resetSchema) });

  const watchedPassword = resetForm.watch("new_password") ?? "";

  function startResendCooldown(seconds = 60) {
    setResendCooldown(seconds);
    const id = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) { clearInterval(id); return 0; }
        return prev - 1;
      });
    }, 1000);
  }

  async function onSendCode(values: EmailForm) {
    try {
      await api.post("/auth/forgot-password", { email: values.email }, {
        _skipAuthRefresh: true,
      } as never);
      setPendingEmail(values.email);
      setStep("reset");
      startResendCooldown(60);
    } catch (error) {
      // Even on error we go to reset step — prevents email enumeration on the frontend too
      const msg = getApiError(error);
      if (msg.toLowerCase().includes("too many") || msg.toLowerCase().includes("wait")) {
        notifyError("Too many requests", msg);
        return;
      }
      setPendingEmail(values.email);
      setStep("reset");
      startResendCooldown(60);
    }
  }

  async function onResend() {
    if (resendCooldown > 0) return;
    try {
      await api.post("/auth/forgot-password", { email: pendingEmail }, {
        _skipAuthRefresh: true,
      } as never);
      notifySuccess("Code resent", "Check your inbox for a fresh reset code.");
      startResendCooldown(60);
    } catch (error) {
      notifyError("Couldn't resend", getApiError(error));
    }
  }

  async function onReset(values: ResetForm) {
    try {
      await api.post(
        "/auth/reset-password",
        { email: pendingEmail, code: values.code, new_password: values.new_password },
        { _skipAuthRefresh: true } as never,
      );
      setStep("done");
    } catch (error) {
      notifyError("Reset failed", getApiError(error));
    }
  }

  const inputClass =
    "h-12 rounded-xl border-border px-4 shadow-none focus-visible:border-brand/50 focus-visible:ring-2 focus-visible:ring-brand/10";

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,rgba(88,155,255,0.08),transparent_50%),linear-gradient(180deg,#f0f4f8,#e8eef6_40%,#f0f4f8)] p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-[480px]">

        {/* Logo */}
        <div className="mb-8 flex justify-center">
          <Link href="/">
            <Image src="/images/logo.png" alt="HPHomeo" width={130} height={36} className="h-8 w-auto" priority />
          </Link>
        </div>

        <div className="overflow-hidden rounded-[2rem] border border-slate-200/60 bg-white shadow-[0_25px_80px_-20px_rgba(15,23,42,0.18)] px-8 py-10">

          {/* ── Step: email ── */}
          {step === "email" && (
            <>
              <div className="mb-8">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10">
                  <Mail className="h-5 w-5 text-brand" />
                </div>
                <h1 className="text-[1.7rem] font-bold tracking-[-0.03em] text-brand-dark leading-tight">
                  Forgot password?
                </h1>
                <p className="mt-2 text-[14px] leading-relaxed text-brand-subtext">
                  No worries — enter your email and we'll send you a reset code.
                </p>
              </div>

              <form onSubmit={emailForm.handleSubmit(onSendCode)} className="space-y-4">
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
                    className={inputClass}
                    {...emailForm.register("email")}
                  />
                  {emailForm.formState.errors.email && (
                    <p className="text-xs text-destructive">{emailForm.formState.errors.email.message}</p>
                  )}
                </div>

                <Button
                  type="submit"
                  disabled={emailForm.formState.isSubmitting}
                  className="h-12 w-full rounded-xl bg-brand text-[14px] font-semibold text-white shadow-[0_8px_24px_-8px_rgba(88,155,255,0.50)] transition-all hover:bg-brand/90"
                >
                  {emailForm.formState.isSubmitting
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending code...</>
                    : "Send reset code"}
                </Button>
              </form>

              <p className="mt-6 text-center text-[13px] text-brand-subtext">
                <Link href="/doctor/login" className="inline-flex items-center gap-1.5 font-semibold text-brand transition-colors hover:text-brand-dark">
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to sign in
                </Link>
              </p>
            </>
          )}

          {/* ── Step: reset ── */}
          {step === "reset" && (
            <>
              <div className="mb-8">
                <button
                  type="button"
                  onClick={() => setStep("email")}
                  className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-subtext transition-colors hover:text-brand-dark"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back
                </button>
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10">
                  <ShieldCheck className="h-5 w-5 text-brand" />
                </div>
                <h1 className="text-[1.7rem] font-bold tracking-[-0.03em] text-brand-dark leading-tight">
                  Check your email
                </h1>
                <p className="mt-2 text-[14px] leading-relaxed text-brand-subtext">
                  We sent a 6-digit code to{" "}
                  <span className="font-semibold text-brand-dark">{pendingEmail}</span>
                </p>
              </div>

              <form onSubmit={resetForm.handleSubmit(onReset)} className="space-y-4">
                {/* Code */}
                <div className="space-y-1.5">
                  <Label htmlFor="code" className="text-[13px] font-medium text-brand-dark">
                    Reset code
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
                    {...resetForm.register("code")}
                  />
                  {resetForm.formState.errors.code && (
                    <p className="text-xs text-destructive">{resetForm.formState.errors.code.message}</p>
                  )}
                </div>

                {/* New password */}
                <div className="space-y-1.5">
                  <Label htmlFor="new_password" className="text-[13px] font-medium text-brand-dark">
                    New password
                  </Label>
                  <div className="relative">
                    <Input
                      id="new_password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Create a strong password"
                      autoComplete="new-password"
                      className={`${inputClass} pr-11`}
                      {...resetForm.register("new_password")}
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
                  <PasswordStrength password={watchedPassword} />
                  {resetForm.formState.errors.new_password && (
                    <p className="text-xs text-destructive">{resetForm.formState.errors.new_password.message}</p>
                  )}
                </div>

                {/* Confirm password */}
                <div className="space-y-1.5">
                  <Label htmlFor="confirm_password" className="text-[13px] font-medium text-brand-dark">
                    Confirm new password
                  </Label>
                  <div className="relative">
                    <Input
                      id="confirm_password"
                      type={showConfirm ? "text" : "password"}
                      placeholder="Repeat your password"
                      autoComplete="new-password"
                      className={`${inputClass} pr-11`}
                      {...resetForm.register("confirm_password")}
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-brand-subtext transition-colors hover:text-brand-dark"
                      onClick={() => setShowConfirm((v) => !v)}
                    >
                      {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {resetForm.formState.errors.confirm_password && (
                    <p className="text-xs text-destructive">{resetForm.formState.errors.confirm_password.message}</p>
                  )}
                </div>

                <Button
                  type="submit"
                  disabled={resetForm.formState.isSubmitting}
                  className="h-12 w-full rounded-xl bg-brand text-[14px] font-semibold text-white shadow-[0_8px_24px_-8px_rgba(88,155,255,0.50)] transition-all hover:bg-brand/90"
                >
                  {resetForm.formState.isSubmitting
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Resetting password...</>
                    : "Reset password"}
                </Button>
              </form>

              {/* Resend */}
              <div className="mt-5 text-center">
                {resendCooldown > 0 ? (
                  <p className="text-[13px] text-brand-subtext">
                    Resend code in <span className="font-semibold tabular-nums text-brand-dark">{resendCooldown}s</span>
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={onResend}
                    className="text-[13px] font-semibold text-brand transition-colors hover:text-brand-dark"
                  >
                    Didn't receive it? Resend code
                  </button>
                )}
              </div>
            </>
          )}

          {/* ── Step: done ── */}
          {step === "done" && (
            <div className="py-4 text-center">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              </div>
              <h1 className="text-[1.7rem] font-bold tracking-[-0.03em] text-brand-dark">
                Password reset!
              </h1>
              <p className="mt-2 text-[14px] leading-relaxed text-brand-subtext">
                Your password has been updated. Sign in with your new credentials.
              </p>
              <Button
                className="mt-8 h-12 w-full rounded-xl bg-brand text-[14px] font-semibold text-white shadow-[0_8px_24px_-8px_rgba(88,155,255,0.50)] transition-all hover:bg-brand/90"
                onClick={() => router.push("/doctor/login")}
              >
                Back to sign in
              </Button>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-[11.5px] text-brand-subtext/45">
          © 2026 HPHomeo · All rights reserved
        </p>
      </div>
    </div>
  );
}
