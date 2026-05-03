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
        router.replace(`/public/appointments/${data.appointment_id}`);
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
    <div className="min-h-screen bg-brand-bg flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200/60 bg-white p-8 text-center shadow-sm">
        {error ? (
          <>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
              <AlertCircle className="h-7 w-7 text-red-600" />
            </div>
            <h1 className="text-lg font-semibold text-gray-900">Link not valid</h1>
            <p className="mt-2 text-sm text-gray-500">{error}</p>
            <p className="mt-3 text-xs text-gray-400">
              If you booked an appointment, please use the latest link from your
              email or WhatsApp.
            </p>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-brand" />
            <p className="mt-4 text-sm text-gray-600">Opening your appointment…</p>
          </>
        )}
      </div>
    </div>
  );
}
