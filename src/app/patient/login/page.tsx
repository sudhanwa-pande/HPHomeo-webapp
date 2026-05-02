"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import api, { getApiError } from "@/lib/api";
import { usePatientAuth } from "@/stores/patient-auth";
import { notifyError, notifySuccess } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { OtpRequestResponse } from "@/types/patient";

type Step = "phone" | "otp";

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

export default function PatientLoginPage() {
  const router = useRouter();
  const { isAuthenticated, setAuth } = usePatientAuth();
  const [sessionChecking, setSessionChecking] = useState(true);

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [resendCount, setResendCount] = useState(0);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace("/patient/dashboard");
    }
  }, [isAuthenticated, router]);

  useEffect(() => {
    if (isAuthenticated) {
      setSessionChecking(false);
      return;
    }
    let cancelled = false;
    api.get("/patient/auth/me").then(({ data }) => {
      if (cancelled) return;
      setAuth(data);
      router.replace("/patient/dashboard");
    }).catch(() => {
      if (!cancelled) setSessionChecking(false);
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, setAuth]);

  useEffect(() => {
    if (resendTimer <= 0) return;
    timerRef.current = window.setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          if (timerRef.current) window.clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [resendTimer]);

  const normalizePhone = useCallback((raw: string): string | null => {
    const digits = raw.replace(/\D/g, "");
    if (digits.startsWith("91") && digits.length === 12) return `+${digits}`;
    if (digits.length === 10) return `+91${digits}`;
    return null;
  }, []);

  async function handleRequestOtp() {
    const normalized = normalizePhone(phone);
    if (!normalized) {
      notifyError("Invalid phone number", "Please enter a valid 10-digit phone number.");
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post<OtpRequestResponse>(
        "/patient/auth/request-otp",
        { phone: normalized, purpose: "login" },
      );
      setResendTimer(data.retry_after_seconds || 60);
      setResendCount(data.resend_count || 1);
      setStep("otp");
      notifySuccess("OTP sent", "Check your WhatsApp for the verification code.");
      setTimeout(() => otpRefs.current[0]?.focus(), 350);
    } catch (error) {
      notifyError("Couldn't send OTP", getApiError(error));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    const code = otp.join("");
    if (code.length !== 6) {
      notifyError("Incomplete OTP", "Please enter the full 6-digit code.");
      return;
    }
    const normalized = normalizePhone(phone);
    if (!normalized) return;
    setLoading(true);
    try {
      const { data } = await api.post("/patient/auth/verify-otp", {
        phone: normalized,
        code,
        purpose: "login",
      });
      setAuth(data.patient);
      notifySuccess("Welcome!", "You've been signed in successfully.");
      router.replace("/patient/dashboard");
    } catch (error) {
      notifyError("Verification failed", getApiError(error));
      setOtp(["", "", "", "", "", ""]);
      otpRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  }

  async function handleResendOtp() {
    if (resendTimer > 0) return;
    const normalized = normalizePhone(phone);
    if (!normalized) return;
    setLoading(true);
    try {
      const { data } = await api.post<OtpRequestResponse>(
        "/patient/auth/request-otp",
        { phone: normalized, purpose: "login" },
      );
      setResendTimer(data.retry_after_seconds || 60);
      setResendCount(data.resend_count);
      setOtp(["", "", "", "", "", ""]);
      otpRefs.current[0]?.focus();
      notifySuccess("OTP resent", "A new code has been sent to your WhatsApp.");
    } catch (error) {
      notifyError("Couldn't resend OTP", getApiError(error));
    } finally {
      setLoading(false);
    }
  }

  function handleOtpChange(index: number, value: string) {
    if (!/^\d*$/.test(value)) return;
    const next = [...otp];
    if (value.length > 1) {
      const digits = value.replace(/\D/g, "").slice(0, 6).split("");
      for (let i = 0; i < 6; i++) next[i] = digits[i] || "";
      setOtp(next);
      const focusIdx = Math.min(digits.length, 5);
      otpRefs.current[focusIdx]?.focus();
      return;
    }
    next[index] = value;
    setOtp(next);
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  }

  function handleOtpKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
    if (e.key === "Enter" && otp.join("").length === 6) {
      handleVerifyOtp();
    }
  }

  function formatTimer(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function goBackToPhone() {
    setStep("phone");
    setOtp(["", "", "", "", "", ""]);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#f5f5f0,#eef0eb_40%,#f5f5f0)] p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-[960px] overflow-hidden rounded-[2rem] border border-slate-200/60 bg-white shadow-[0_25px_80px_-20px_rgba(15,23,42,0.18)] lg:grid lg:grid-cols-[1fr_1fr]">

        {/* ── Left panel — image ── */}
        <div className="relative hidden min-h-[600px] lg:block">
          <Image
            src="/images/doctor_login_page.png"
            alt="Homeopathy consultation"
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
                Heal with homeopathy,{" "}
                <br />
                from anywhere.
              </h1>
              <p className="mt-3 max-w-[18rem] text-[0.85rem] leading-relaxed text-white/50">
                Book consultations, receive digital prescriptions, and manage your health journey online.
              </p>
              <p className="mt-6 text-[11px] text-white/30 tracking-wide">
                Secure · Private · Built for India
              </p>
            </div>
          </div>
        </div>

        {/* ── Right panel — form ── */}
        <div className="flex flex-col justify-between px-6 py-10 sm:px-10 sm:py-12 lg:px-10 xl:px-12">

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
            <div className="mx-auto w-full max-w-[400px]">

              {sessionChecking ? (
                <div className="flex min-h-[260px] items-center justify-center">
                  <Spinner size="lg" />
                </div>
              ) : (
                <div className="relative min-h-[320px]">
                  {/* ── Step 1: Phone ── */}
                  <div
                    className={`w-full transition-all duration-300 ease-in-out ${
                      step === "otp"
                        ? "pointer-events-none absolute inset-x-0 top-0 -translate-y-3 opacity-0"
                        : "relative translate-y-0 opacity-100"
                    }`}
                  >
                    <div className="mb-8">
                      <h2 className="text-[2rem] font-extrabold tracking-[-0.03em] text-brand-dark leading-tight">
                        Welcome back
                      </h2>
                      <p className="mt-2 text-[14px] leading-relaxed text-[#9CA3AF]">
                        Enter your number to sign in via WhatsApp.
                      </p>
                    </div>

                    <div className="space-y-5">
                      <div className="space-y-2">
                        <label htmlFor="phone" className="block text-[12px] font-medium text-[#374151]">
                          Phone number
                        </label>
                        {/* Unified phone input */}
                        <div className="flex h-12 overflow-hidden rounded-xl border border-slate-200 bg-[#FAFAFA] transition-all focus-within:border-[#166534] focus-within:ring-[3px] focus-within:ring-[#166534]/15">
                          <div className="flex shrink-0 items-center border-r border-slate-200 bg-[#F9FAFB] px-4">
                            <span className="text-[13px] font-semibold text-[#374151]">+91</span>
                          </div>
                          <input
                            id="phone"
                            type="tel"
                            inputMode="numeric"
                            placeholder="10-digit mobile number"
                            value={phone}
                            onChange={(e) =>
                              setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && phone.length === 10) handleRequestOtp();
                            }}
                            className="flex-1 bg-transparent px-3.5 text-[15px] tracking-wide text-brand-dark placeholder:text-[#9CA3AF] focus:outline-none"
                            maxLength={10}
                            autoFocus
                          />
                        </div>
                      </div>

                      <Button
                        onClick={handleRequestOtp}
                        disabled={phone.length !== 10 || loading}
                        className="h-12 w-full rounded-xl bg-[#166534] text-[14px] font-semibold text-white shadow-[0_4px_14px_0_rgba(17,85,32,0.20)] transition-all hover:bg-[#14532d] hover:shadow-[0_6px_18px_0_rgba(17,85,32,0.25)] disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {loading ? (
                          <Spinner className="mr-2" size="sm" />
                        ) : (
                          <WhatsAppIcon className="mr-2 h-[1.05rem] w-[1.05rem]" />
                        )}
                        {loading ? "Sending…" : "Send OTP via WhatsApp"}
                      </Button>
                    </div>
                  </div>

                  {/* ── Step 2: OTP ── */}
                  <div
                    className={`w-full transition-all duration-300 ease-in-out ${
                      step === "phone"
                        ? "pointer-events-none absolute inset-x-0 top-0 translate-y-3 opacity-0"
                        : "relative translate-y-0 opacity-100"
                    }`}
                  >
                    <div className="mb-8">
                      <button
                        onClick={goBackToPhone}
                        className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-[#9CA3AF] transition-colors hover:text-brand-dark"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        Change number
                      </button>
                      <h2 className="text-[2rem] font-extrabold tracking-[-0.03em] text-brand-dark leading-tight">
                        Enter your code
                      </h2>
                      <p className="mt-2 text-[14px] leading-relaxed text-[#9CA3AF]">
                        Sent to your WhatsApp at{" "}
                        <span className="font-semibold text-brand-dark">+91 {phone}</span>
                      </p>
                    </div>

                    <div className="space-y-5">
                      {/* OTP boxes */}
                      <div className="flex gap-2.5">
                        {otp.map((digit, i) => (
                          <input
                            key={i}
                            ref={(el) => { otpRefs.current[i] = el; }}
                            type="text"
                            inputMode="numeric"
                            maxLength={6}
                            value={digit}
                            onChange={(e) => handleOtpChange(i, e.target.value)}
                            onKeyDown={(e) => handleOtpKeyDown(i, e)}
                            onPaste={(e) => {
                              e.preventDefault();
                              const pasted = e.clipboardData.getData("text");
                              handleOtpChange(0, pasted);
                            }}
                            className="h-12 w-11 rounded-xl border border-slate-200 bg-[#FAFAFA] text-center text-xl font-bold text-brand-dark outline-none transition-all focus:border-[#166534] focus:ring-[3px] focus:ring-[#166534]/15"
                            autoComplete="one-time-code"
                          />
                        ))}
                      </div>

                      <Button
                        onClick={handleVerifyOtp}
                        disabled={otp.join("").length !== 6 || loading}
                        className="h-12 w-full rounded-xl bg-[#166534] text-[14px] font-semibold text-white shadow-[0_4px_14px_0_rgba(17,85,32,0.20)] transition-all hover:bg-[#14532d] hover:shadow-[0_6px_18px_0_rgba(17,85,32,0.25)] disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {loading ? (
                          <>
                            <Spinner className="mr-2" size="sm" />
                            Verifying…
                          </>
                        ) : "Verify & Sign In"}
                      </Button>

                      {/* Resend */}
                      <div className="text-center">
                        {resendTimer > 0 ? (
                          <p className="text-[13px] text-[#9CA3AF]">
                            Resend in{" "}
                            <span className="font-semibold tabular-nums text-brand-dark">
                              {formatTimer(resendTimer)}
                            </span>
                          </p>
                        ) : (
                          <button
                            onClick={handleResendOtp}
                            disabled={loading}
                            className="text-[13px] font-semibold text-[#166534] transition-colors hover:text-[#14532d] disabled:opacity-50"
                          >
                            Resend OTP
                          </button>
                        )}
                        {resendCount > 1 ? (
                          <p className="mt-1 text-[11px] text-[#9CA3AF]/60">
                            Resent {resendCount - 1} time{resendCount > 2 ? "s" : ""}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Legal */}
          <div className="mt-8">
            <p className="text-[11px] text-[#9CA3AF]/60">
              By continuing, you agree to our{" "}
              <Link href="/terms-and-conditions" className="underline underline-offset-2 transition-colors hover:text-[#9CA3AF]">
                Terms
              </Link>{" "}
              and{" "}
              <Link href="/privacy-policy" className="underline underline-offset-2 transition-colors hover:text-[#9CA3AF]">
                Privacy Policy
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
