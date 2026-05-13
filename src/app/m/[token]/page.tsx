"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";

import { publicApi } from "@/lib/public-api";
import { getApiError } from "@/lib/api";

/**
 * Magic-link redirect page used by WhatsApp template buttons.
 *
 * URL shape: https://<frontend>/m/<token>
 *
 * Why this exists: WhatsApp template buttons URL-encode the dynamic
 * substitution, which mangles "/" and "#" in the value. So we can't put a
 * full path-and-fragment URL like `/public/appointments/<id>#pat=<token>` in
 * the template. Instead, the template URL is `https://<frontend>/m/{{1}}`
 * with `{{1}}` set to the bare token (which only uses URL-safe characters).
 *
 * On mount we POST the token to /public/access-by-token. The backend looks
 * up the appointment by token hash, sets the access cookie, and returns the
 * appointment_id. We then router.replace into the regular appointment view —
 * no fragment needed, the cookie is already set.
 */
export default function MagicLinkRedirectPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Magic tokens are URL-safe (secrets.token_urlsafe → [A-Za-z0-9_-] only),
    // so Next.js's params object delivers them unchanged. No decode needed.
    const token = (params?.token ?? "").trim();
    if (!token) {
      setError("Missing access token in link.");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const { data } = await publicApi.post<{
          appointment_id: string;
          expires_at: string;
        }>("/public/access-by-token", { token });
        if (cancelled) return;
        router.replace(`/public/appointments/${data.appointment_id}#pat=${token}`);
      } catch (err) {
        if (cancelled) return;
        setError(getApiError(err));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [params?.token, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,rgba(88,155,255,0.08),transparent_60%),linear-gradient(180deg,#f8fafd,#f4f6fb)] px-6">
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
         <div className="h-[300px] w-[500px] rounded-full bg-brand/[0.04] blur-[100px]" />
      </div>
      <div className="relative w-full max-w-md rounded-[2rem] border border-white/70 bg-white/90 p-10 text-center shadow-[0_16px_60px_-28px_rgba(19,19,19,0.16)] backdrop-blur-md">
        {error ? (
          <>
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 ring-1 ring-red-100">
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-gray-900">Link not valid</h1>
            <p className="mt-2 text-sm leading-relaxed text-gray-500">{error}</p>
            <p className="mt-4 rounded-xl bg-gray-50 p-4 text-xs font-medium leading-relaxed text-gray-500 ring-1 ring-gray-100">
              If you booked an appointment, please use the latest link from your email or WhatsApp.
            </p>
          </>
        ) : (
          <div className="py-4">
            <div className="relative mx-auto h-16 w-16">
              <div className="absolute inset-0 animate-ping rounded-full bg-brand/20" />
              <div className="absolute inset-2 flex items-center justify-center rounded-full bg-brand shadow-lg shadow-brand/30">
                 <Loader2 className="h-6 w-6 animate-spin text-white" />
              </div>
            </div>
            <p className="mt-8 text-base font-semibold text-gray-900">Opening your appointment</p>
            <p className="mt-1.5 text-sm text-gray-500">Securely loading your details...</p>
          </div>
        )}
      </div>
    </div>
  );
}
