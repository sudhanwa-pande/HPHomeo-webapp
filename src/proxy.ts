import { NextResponse, type NextRequest } from "next/server";

/**
 * Lightweight server-side guard: if the user has no auth cookie at all,
 * redirect immediately instead of loading the full page bundle and letting
 * the client-side AuthGuard handle it after a flash of content.
 *
 * This does NOT validate the token — it only checks for its presence.
 * Full verification still happens client-side via /auth/me.
 */

const DOCTOR_PROTECTED = [
  "/doctor/dashboard", "/doctor/profile", "/doctor/appointments",
  "/doctor/patients", "/doctor/availability", "/doctor/prescriptions",
  "/doctor/call",
];
const ADMIN_PROTECTED = ["/admin"];
const PATIENT_PROTECTED = [
  "/patient/dashboard", "/patient/appointments", "/patient/profile",
  "/patient/prescriptions", "/patient/receipts", "/patient/book",
  "/patient/doctors",
];

function matchesAny(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// Routes that should never be redirected (login / register / public)
const PUBLIC_ROUTES = ["/doctor/login", "/doctor/register", "/doctor/verify", "/patient/login"];

// Bare path → dashboard redirects (previously in proxy.ts)
const BARE_REDIRECTS: Record<string, string> = {
  "/doctor": "/doctor/dashboard",
  "/patient": "/patient/dashboard",
  "/admin": "/admin/dashboard",
};

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Bare path redirects (e.g. /doctor → /doctor/dashboard)
  const redirect = BARE_REDIRECTS[pathname];
  if (redirect) {
    return NextResponse.redirect(new URL(redirect, request.url));
  }

  // Never redirect login/register pages
  if (matchesAny(pathname, PUBLIC_ROUTES)) {
    return NextResponse.next();
  }

  // Doctor / admin routes — expect an access_token cookie
  if (matchesAny(pathname, [...DOCTOR_PROTECTED, ...ADMIN_PROTECTED])) {
    const hasToken = request.cookies.has("doctor_access_token");
    if (!hasToken) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/doctor/login";
      loginUrl.search = "";
      return NextResponse.redirect(loginUrl);
    }
  }

  // Patient routes — expect a patient_access_token cookie
  if (matchesAny(pathname, PATIENT_PROTECTED)) {
    const hasToken = request.cookies.has("patient_access_token");
    if (!hasToken) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/patient/login";
      loginUrl.search = "";
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/doctor",
    "/doctor/:path*",
    "/doctors/:path*",
    "/admin",
    "/admin/:path*",
    "/patient",
    "/patient/:path*",
    "/public/:path*",
  ],
};
