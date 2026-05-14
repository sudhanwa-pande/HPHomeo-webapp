"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { Loader2, ShieldCheck } from "lucide-react";

import api, { getApiError } from "@/lib/api";
import { notifyApiError, notifyError, notifySuccess } from "@/lib/notify";
import { PageLoader } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const codeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Enter a 6-digit code"),
});

type CodeForm = z.infer<typeof codeSchema>;

interface TotpSetupResponse {
  totp_enabled: boolean;
  otpauth_url: string;
  qr_code_data_url: string;
  manual_entry_key: string;
}

export default function AdminLoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"verify" | "setup">("verify");
  const [loading, setLoading] = useState(false);
  const [setupLoading, setSetupLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [setupData, setSetupData] = useState<TotpSetupResponse | null>(null);
  const [totpEnabled, setTotpEnabled] = useState(true);

  const verifyForm = useForm<CodeForm>({
    resolver: zodResolver(codeSchema),
  });
  const setupEnableForm = useForm<CodeForm>({
    resolver: zodResolver(codeSchema),
  });

  useEffect(() => {
    async function verifyAdminAccess() {
      try {
        const { data } = await api.get("/auth/me");
        if (!data?.is_admin) {
          notifyError("Admin access required", "Sign in with an admin-enabled account to continue.");
          router.replace("/doctor/login");
          return;
        }
        const enabled = Boolean(data.totp_enabled);
        setTotpEnabled(enabled);
        if (!enabled) {
          setMode("setup");
        }
      } catch {
        router.replace("/doctor/login");
        return;
      } finally {
        setChecking(false);
      }
    }

    verifyAdminAccess();
  }, [router]);

  async function onVerify(values: CodeForm) {
    setLoading(true);
    try {
      await api.post("/admin/auth/verify", values);
      notifySuccess("Admin session verified", "You're cleared to access admin controls.");
      router.refresh();
      router.push("/admin/dashboard");
    } catch (error) {
      const message = getApiError(error);
      if (message === "Admin TOTP setup required") {
        setMode("setup");
        notifyError("TOTP setup required", "Complete admin two-factor setup before continuing.");
      } else {
        notifyError("Couldn't verify admin session", message);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateTotp() {
    setSetupLoading(true);
    try {
      const { data } = await api.post<TotpSetupResponse>("/auth/totp/setup");
      setSetupData(data);
      notifySuccess("Setup QR ready", "Scan it with your authenticator app to continue.");
    } catch (error) {
      notifyApiError(error, "Couldn't generate setup QR");
    } finally {
      setSetupLoading(false);
    }
  }

  async function onEnableTotp(values: CodeForm) {
    setLoading(true);
    try {
      await api.post("/auth/totp/enable", values);
      notifySuccess("TOTP enabled", "Enter a fresh code to finish admin verification.");
      setSetupData(null);
      setTotpEnabled(true);
      setMode("verify");
    } catch (error) {
      notifyApiError(error, "Couldn't enable TOTP");
    } finally {
      setLoading(false);
    }
  }

  if (checking) return <PageLoader />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="type-ui-section">Admin Re-Authentication</CardTitle>
          <CardDescription>
            {mode === "verify"
              ? "Enter your admin TOTP code to access admin controls"
              : "Setup TOTP first, then continue to admin controls"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mode === "verify" ? (
            <form onSubmit={verifyForm.handleSubmit(onVerify)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code">TOTP Code</Label>
                <Input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  placeholder="000000"
                  maxLength={6}
                  autoComplete="one-time-code"
                  className="text-center text-base tracking-[0.35em]"
                  {...verifyForm.register("code")}
                />
                {verifyForm.formState.errors.code && (
                  <p className="type-body-sm text-destructive">
                    {verifyForm.formState.errors.code.message}
                  </p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Verify Admin Session
              </Button>

              {!totpEnabled && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => setMode("setup")}
                >
                  Setup TOTP Instead
                </Button>
              )}
            </form>
          ) : (
            <div className="space-y-4">
              <Button
                type="button"
                className="w-full"
                onClick={handleGenerateTotp}
                disabled={setupLoading}
              >
                {setupLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                Generate TOTP QR
              </Button>

              {setupData && (
                <div className="space-y-4 rounded-lg border bg-background p-4">
                  <Image
                    src={setupData.qr_code_data_url}
                    alt="TOTP QR Code"
                    width={208}
                    height={208}
                    unoptimized
                    className="mx-auto h-52 w-52 rounded-md border"
                  />
                  <div>
                    <p className="type-caption text-muted-foreground">Manual setup key</p>
                    <p className="mt-1 break-all rounded-md bg-muted px-2 py-1 font-mono type-caption">
                      {setupData.manual_entry_key}
                    </p>
                  </div>

                  <form onSubmit={setupEnableForm.handleSubmit(onEnableTotp)} className="space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="enable-code">Enter TOTP Code</Label>
                      <Input
                        id="enable-code"
                        type="text"
                        inputMode="numeric"
                        placeholder="000000"
                        maxLength={6}
                        className="text-center text-base tracking-[0.35em]"
                        {...setupEnableForm.register("code")}
                      />
                      {setupEnableForm.formState.errors.code && (
                        <p className="type-body-sm text-destructive">
                          {setupEnableForm.formState.errors.code.message}
                        </p>
                      )}
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                      Enable TOTP and Continue
                    </Button>
                  </form>
                </div>
              )}

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => setMode("verify")}
              >
                Back to Admin Verify
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
