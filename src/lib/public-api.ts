import axios from "axios";
import { attachCommonErrorInterceptor } from "@/lib/api";

export const publicApi = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  timeout: 30_000,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

attachCommonErrorInterceptor(publicApi);

export function readPublicMagicTokenFromHash() {
  if (typeof window === "undefined") return "";
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return hash.get("pat") || "";
}

export function scrubPublicMagicTokenFromUrl() {
  if (typeof window === "undefined") return;
  const nextUrl = `${window.location.pathname}${window.location.search}`;
  window.history.replaceState(null, "", nextUrl);
}

export async function createPublicAccessSession(
  appointmentId: string,
  token: string,
) {
  const { data } = await publicApi.post<{
    message: string;
    appointment_id: string;
    expires_at: string;
  }>(`/public/appointments/${appointmentId}/access-session`, { token });

  return data;
}
