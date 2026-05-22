import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import * as Sentry from "@sentry/nextjs";

// Bare path → dashboard redirects
const BARE_REDIRECTS: Record<string, string> = {
  "/doctor": "/doctor/dashboard",
  "/patient": "/patient/dashboard",
  "/admin": "/admin/dashboard",
};

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  return new TextEncoder().encode(secret);
};

// Helper to verify token (strict enforcement)
async function verifyToken(token: string) {
  const secret = getJwtSecret();
  if (!secret) {
    console.error("CRITICAL: JWT_SECRET is missing in environment. Denying access.");
    return null;
  }
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
      issuer: "hphomeo-backend",
      audience: "hphomeo-frontend",
    });
    return payload;
  } catch (e) {
    return null;
  }
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const redirect = BARE_REDIRECTS[pathname];
  if (redirect) {
    return NextResponse.redirect(new URL(redirect, request.url));
  }

  const isDoctorRoute = pathname === "/doctor" || pathname.startsWith("/doctor/");
  const isPatientRoute = pathname === "/patient" || pathname.startsWith("/patient/");
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");

  const isAuthPage =
    pathname.startsWith("/doctor/login") ||
    pathname.startsWith("/doctor/register") ||
    pathname.startsWith("/doctor/forgot-password") ||
    pathname.startsWith("/doctor/verify") ||
    pathname.startsWith("/patient/login") ||
    pathname.startsWith("/patient/register");

  const isProtectedOrAuth = isAuthPage || isDoctorRoute || isPatientRoute || isAdminRoute;

  if (!isProtectedOrAuth) {
    return NextResponse.next();
  }

  const doctorToken = request.cookies.get("doctor_access_token")?.value;
  const adminToken = request.cookies.get("admin_session_token")?.value;
  const patientToken = request.cookies.get("patient_access_token")?.value;

  // Pre-verify tokens to avoid multiple expensive checks
  const doctorClaims = doctorToken ? await verifyToken(doctorToken) : null;
  const adminClaims = adminToken ? await verifyToken(adminToken) : null;
  const patientClaims = patientToken ? await verifyToken(patientToken) : null;

  // --- ADMIN ROUTE ENFORCEMENT (Strict, Verified) ---
  if (isAdminRoute) {
    if (!doctorClaims || doctorClaims.role !== "doctor") {
      const res = NextResponse.redirect(new URL("/doctor/login", request.url));
      if (doctorToken) res.cookies.delete("doctor_access_token");
      if (adminToken) res.cookies.delete("admin_session_token");
      return res;
    }

    let isStepUpValid = false;

    if (adminClaims && adminClaims.session_type === "admin_reauth") {
      const amr = adminClaims.amr;
      const hasTotp = Array.isArray(amr) ? amr.includes("totp") : amr === "totp";

      if (hasTotp) {
        if (adminClaims.sub === doctorClaims.sub) {
          isStepUpValid = true;
        } else {
          // Token Binding Failed! Log to Sentry
          Sentry.captureMessage("Admin Step-Up Security Event: Token Binding Failed", {
            level: "warning",
            tags: { security: "step-up-auth" },
            extra: { path: pathname, adminSub: adminClaims.sub, doctorSub: doctorClaims.sub }
          });
          console.warn("Admin step-up failed", {
            reason: "sub_mismatch",
            path: pathname,
          });
        }
      }
    }

    if (isStepUpValid) {
      if (pathname === "/admin/login") {
        return NextResponse.redirect(new URL("/admin/dashboard", request.url));
      }
      return NextResponse.next();
    }

    // Not step-up verified or expired/invalid
    // If they have an adminToken but it failed validation, clear it to prevent stale cookie issues
    const needsCookieCleanup = adminToken && !isStepUpValid;

    if (pathname === "/admin/login") {
      const res = NextResponse.next();
      if (needsCookieCleanup) res.cookies.delete("admin_session_token");
      return res;
    }

    // Expiry drift handling: pass reauth=true
    const url = new URL("/admin/login", request.url);
    if (adminToken) {
      url.searchParams.set("reauth", "true");
    }
    const res = NextResponse.redirect(url);
    if (needsCookieCleanup) res.cookies.delete("admin_session_token");
    return res;
  }

  // --- DOCTOR ROUTE ENFORCEMENT ---
  if (isDoctorRoute && !isAuthPage) {
    if (!doctorClaims || doctorClaims.role !== "doctor") {
      const res = NextResponse.redirect(new URL("/doctor/login", request.url));
      if (doctorToken) res.cookies.delete("doctor_access_token");
      if (adminToken) res.cookies.delete("admin_session_token"); // Ensure step-up is killed too
      return res;
    }
    return NextResponse.next();
  }

  // --- PATIENT ROUTE ENFORCEMENT ---
  if (isPatientRoute && !isAuthPage) {
    if (!patientClaims || patientClaims.role !== "patient") {
      const res = NextResponse.redirect(new URL("/patient/login", request.url));
      if (patientToken) res.cookies.delete("patient_access_token");
      return res;
    }
    return NextResponse.next();
  }

  // --- AUTH PAGES LOGIC ---
  if (isAuthPage) {
    // Check patient token
    if (patientClaims && patientClaims.role === "patient" && (pathname.startsWith("/patient/login") || pathname.startsWith("/patient/register"))) {
      return NextResponse.redirect(new URL("/patient/dashboard", request.url));
    }
    // Check doctor token
    if (doctorClaims && doctorClaims.role === "doctor" && (pathname.startsWith("/doctor/login") || pathname.startsWith("/doctor/register") || pathname.startsWith("/doctor/verify"))) {
      return NextResponse.redirect(new URL("/doctor/dashboard", request.url));
    }
    return NextResponse.next();
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
