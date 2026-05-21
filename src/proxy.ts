import { NextResponse, type NextRequest } from "next/server";

// 0-dependency JWT decoder for Edge runtime
function jwtDecode(token: string) {
  try {
    const base64Url = token.split(".")[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

// Bare path → dashboard redirects
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

  const token = request.cookies.get("access_token");

  const isAuthPage =
    pathname.startsWith("/doctor/login") ||
    pathname.startsWith("/patient/login") ||
    pathname.startsWith("/admin/login");

  const isDoctorRoute = pathname.startsWith("/doctor");
  const isPatientRoute = pathname.startsWith("/patient");
  const isAdminRoute = pathname.startsWith("/admin");

  // If token exists, validate it and route intelligently
  const isProtectedOrAuth = isAuthPage || isDoctorRoute || isPatientRoute || isAdminRoute;

  if (token && isProtectedOrAuth) {
    const decoded = jwtDecode(token.value);
    
    // Check token expiration
    if (!decoded || (decoded.exp && decoded.exp * 1000 < Date.now())) {
      // Token expired -> clear cookie and treat as no token
      if (isAuthPage) {
        const res = NextResponse.next();
        res.cookies.delete("access_token");
        return res;
      }

      let res;
      if (isDoctorRoute) {
        res = NextResponse.redirect(new URL("/doctor/login", request.url));
      } else if (isPatientRoute) {
        res = NextResponse.redirect(new URL("/patient/login", request.url));
      } else if (isAdminRoute) {
        res = NextResponse.redirect(new URL("/admin/login", request.url));
      } else {
        res = NextResponse.next();
      }
      res.cookies.delete("access_token");
      return res;
    }

    const role = decoded.role;

    // Logged-in users hitting auth pages get role-aware redirect
    if (isAuthPage) {
      if (role === "patient") {
        return NextResponse.redirect(new URL("/patient/dashboard", request.url));
      }
      if (role === "doctor") {
        return NextResponse.redirect(new URL("/doctor/dashboard", request.url));
      }
      if (role === "admin") {
        return NextResponse.redirect(new URL("/admin/dashboard", request.url));
      }

      // Fallback for unknown role
      const res = NextResponse.redirect(new URL("/doctor/login", request.url));
      res.cookies.delete("access_token");
      return res;
    }

    if (isDoctorRoute && role !== "doctor") {
      return NextResponse.redirect(new URL("/doctor/login", request.url));
    }
    if (isPatientRoute && role !== "patient") {
      return NextResponse.redirect(new URL("/patient/login", request.url));
    }
    if (isAdminRoute && role !== "admin") {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
  }

  // Protect doctor routes
  if (!token && isDoctorRoute && !isAuthPage) {
    return NextResponse.redirect(new URL("/doctor/login", request.url));
  }

  // Protect patient routes
  if (!token && isPatientRoute && !isAuthPage) {
    return NextResponse.redirect(new URL("/patient/login", request.url));
  }

  // Protect admin routes
  if (!token && isAdminRoute && !isAuthPage) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
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
