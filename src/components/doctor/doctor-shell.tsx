"use client";

import { type CSSProperties, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { Calendar, ChevronsUpDown, ClipboardList, Clock, LayoutDashboard, LogOut, Settings, Shield, Users, Wifi, WifiOff } from "lucide-react";

import { useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { notifyError, notifyInfo } from "@/lib/notify";
import { useEventStream } from "@/hooks/use-event-stream";
import { playPatientWaitingSound } from "@/lib/sound";
import { useDoctorAuth } from "@/stores/doctor-auth";
import { broadcastLogout } from "@/components/auth-guard";
import { DoctorNotifications } from "@/components/doctor/doctor-notifications";
import { WaitingRoomBadge } from "@/components/doctor/waiting-room-badge";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useIsMobile } from "@/hooks/use-mobile";

const NAV_ITEMS = [
  { href: "/doctor/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/doctor/appointments", label: "Appointments", icon: Calendar },
  { href: "/doctor/patients", label: "Patients", icon: Users },
  { href: "/doctor/availability", label: "Availability", icon: Clock },
  { href: "/doctor/prescriptions", label: "Prescriptions", icon: ClipboardList },
];

interface DoctorShellProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  headerRight?: ReactNode;
}

export function DoctorShell({ children, title, subtitle, headerRight }: DoctorShellProps) {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();

  // Global SSE stream — pushes real-time events to all doctor pages
  const { connectionState: sseState } = useEventStream({
    path: "/doctor/events/stream",
    onEvent: {
      patient_waiting: (event) => {
        queryClient.invalidateQueries({ queryKey: ["doctor-calls-dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["doctor-waiting"] });
        queryClient.invalidateQueries({ queryKey: ["doctor-appointment-detail"] });
        void playPatientWaitingSound();
        const patientName =
          (event.data as { patient_name?: string }).patient_name || "A patient";
        notifyInfo("Patient waiting", `${patientName} has joined the waiting room.`);
      },
      appointment_booked: () => {
        queryClient.invalidateQueries({ queryKey: ["doctor-notifications"] });
        queryClient.invalidateQueries({ queryKey: ["doctor-appointments"] });
        queryClient.invalidateQueries({ queryKey: ["doctor-appointments-range"] });
        queryClient.invalidateQueries({ queryKey: ["doctor-calls-dashboard"] });
      },
      appointment_cancelled: () => {
        queryClient.invalidateQueries({ queryKey: ["doctor-notifications"] });
        queryClient.invalidateQueries({ queryKey: ["doctor-appointments"] });
        queryClient.invalidateQueries({ queryKey: ["doctor-appointments-range"] });
        queryClient.invalidateQueries({ queryKey: ["doctor-calls-dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["doctor-waiting"] });
      },
      appointment_rescheduled: () => {
        queryClient.invalidateQueries({ queryKey: ["doctor-notifications"] });
        queryClient.invalidateQueries({ queryKey: ["doctor-appointments"] });
        queryClient.invalidateQueries({ queryKey: ["doctor-appointments-range"] });
        queryClient.invalidateQueries({ queryKey: ["doctor-calls-dashboard"] });
      },
      payment_confirmed: () => {
        queryClient.invalidateQueries({ queryKey: ["doctor-notifications"] });
        queryClient.invalidateQueries({ queryKey: ["doctor-appointments"] });
        queryClient.invalidateQueries({ queryKey: ["doctor-appointments-range"] });
        queryClient.invalidateQueries({ queryKey: ["doctor-calls-dashboard"] });
      },
      // Unified call state change event — replaces old call_status_changed and call_ended
      call_state_changed: () => {
        queryClient.invalidateQueries({ queryKey: ["doctor-calls-dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["doctor-waiting"] });
        queryClient.invalidateQueries({ queryKey: ["doctor-appointments"] });
        queryClient.invalidateQueries({ queryKey: ["doctor-appointments-range"] });
        queryClient.invalidateQueries({ queryKey: ["doctor-appointment-detail"] });
      },
      appointment_completed: () => {
        queryClient.invalidateQueries({ queryKey: ["doctor-appointments"] });
        queryClient.invalidateQueries({ queryKey: ["doctor-appointments-range"] });
        queryClient.invalidateQueries({ queryKey: ["doctor-calls-dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["doctor-waiting"] });
      },
      appointment_no_show: () => {
        queryClient.invalidateQueries({ queryKey: ["doctor-appointments"] });
        queryClient.invalidateQueries({ queryKey: ["doctor-appointments-range"] });
        queryClient.invalidateQueries({ queryKey: ["doctor-calls-dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["doctor-waiting"] });
      },
    },
    onReconnect: () => {
      // After a disconnection, refetch everything to pick up events missed
      // while the connection was down.
      queryClient.invalidateQueries({ queryKey: ["doctor-calls-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["doctor-waiting"] });
      queryClient.invalidateQueries({ queryKey: ["doctor-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["doctor-appointments"] });
      queryClient.invalidateQueries({ queryKey: ["doctor-appointments-range"] });
      queryClient.invalidateQueries({ queryKey: ["doctor-appointment-detail"] });
    },
  });

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width-icon": "5.5rem",
          "--sidebar-width": "15.25rem",
        } as CSSProperties
      }
    >
      <DoctorSidebar />
      <SidebarInset className="bg-brand-bg">
        <header className="sticky top-0 z-30 flex min-h-[64px] flex-col gap-2 border-b border-border/30 bg-white/88 px-4 py-2.5 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between sm:px-5 lg:px-6">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <SidebarTrigger className="-ml-1 text-brand-subtext hover:text-brand-dark" />
            <div className="h-5 w-px bg-border/40" />
            <div className="min-w-0">
              <h1 className={isMobile ? "type-ui-section truncate" : "type-ui-title"}>{title}</h1>
              {subtitle ? <p className="type-caption mt-0.5 text-brand-subtext">{subtitle}</p> : null}
            </div>
          </div>
          <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto sm:gap-3">
            <SSEIndicator state={sseState} />
            <DoctorNotifications />
            <WaitingRoomBadge />
            {headerRight}
          </div>
        </header>

        <div className="page-enter flex-1 px-4 py-4 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
          <div className="mx-auto max-w-[1440px]">{children}</div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function DoctorSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { doctor, logout } = useDoctorAuth();
  const queryClient = useQueryClient();

  async function handleLogout() {
    try {
      await api.post("/auth/logout", undefined, {
        _skipAuthRefresh: true,
      } as never);
    } catch {
      notifyError(
        "Signed out with a sync issue",
        "This device has been signed out, but the server session could not be closed cleanly.",
      );
    } finally {
      queryClient.clear();
      logout();
      broadcastLogout("doctor");
      router.replace("/doctor/login");
    }
  }

  const initials =
    doctor?.full_name
      ?.split(" ")
      .slice(0, 2)
      .map((name) => name[0])
      .join("")
      .toUpperCase() || "D";

  const profilePhotoUrl = doctor?.profile_photo || undefined;

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="px-2.5 pb-2 pt-3">
        <div className="flex items-center justify-center px-2 py-2 group-data-[collapsible=icon]:px-1">
          <button
            onClick={() => router.push("/doctor/dashboard")}
            className="cursor-pointer group-data-[collapsible=icon]:hidden"
          >
            <Image
              src="/images/logo.png"
              alt="hpHomeo"
              width={130}
              height={44}
              className="h-7 w-auto object-contain sm:h-8"
            />
          </button>
          <button
            onClick={() => router.push("/doctor/dashboard")}
            className="hidden cursor-pointer group-data-[collapsible=icon]:block"
          >
            <Image
              src="/images/logo_wthout_text.png"
              alt="hpHomeo"
              width={40}
              height={40}
              className="size-9 object-contain"
            />
          </button>
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-4 px-2.5 pt-3 group-data-[collapsible=icon]:px-2">
        <SidebarGroup className="p-1.5">
          <SidebarGroupLabel className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-subtext/55">
            Workspace
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={isActive}
                      tooltip={item.label}
                      onClick={() => router.push(item.href)}
                      className="h-10 rounded-xl border border-transparent px-2.5 text-brand-ink-soft hover:border-brand/10 hover:bg-brand-bg/80 hover:text-brand-dark data-active:border-brand/15 data-active:bg-gradient-to-r data-active:from-brand/12 data-active:to-white data-active:text-brand-dark group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:h-12 group-data-[collapsible=icon]:w-12 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 [&_svg]:size-4"
                    >
                      <div
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-bg text-brand-subtext transition-colors group-data-[collapsible=icon]:h-9 group-data-[collapsible=icon]:w-9",
                          isActive && "bg-brand text-white"
                        )}
                      >
                        <Icon />
                      </div>
                      <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                        <span className="block truncate text-[12px] font-medium">{item.label}</span>
                      </div>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {doctor?.is_admin ? (
          <SidebarGroup className="p-1.5">
            <SidebarGroupLabel className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-subtext/55">
              Admin
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip="Admin Panel"
                    onClick={() => router.push("/admin/login")}
                    className="h-10 rounded-xl border border-transparent px-2.5 text-brand-ink-soft hover:border-brand/10 hover:bg-brand-bg/80 hover:text-brand-dark group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:h-12 group-data-[collapsible=icon]:w-12 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 [&_svg]:size-4"
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-bg text-brand-subtext group-data-[collapsible=icon]:h-9 group-data-[collapsible=icon]:w-9">
                      <Shield />
                    </div>
                    <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                      <span className="block text-[12px] font-medium">Admin Panel</span>
                    </div>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
      </SidebarContent>

      <SidebarFooter className="border-t border-border/20 p-2">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex w-full items-center gap-2.5 rounded-xl border border-transparent p-2 text-left outline-none transition-colors hover:bg-brand-bg/70 data-[state=open]:bg-brand-bg/70 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-2.5">
              <Avatar className="size-8 shrink-0 rounded-lg">
                {profilePhotoUrl ? <AvatarImage src={profilePhotoUrl} alt={doctor?.full_name || "Doctor"} /> : null}
                <AvatarFallback className="rounded-lg bg-brand/10 text-xs font-bold text-brand">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                <p className="truncate text-[12px] font-semibold text-brand-dark">{doctor?.full_name || "Doctor"}</p>
                <p className="truncate text-[10px] text-brand-subtext">{doctor?.registration_no || ""}</p>
              </div>
              <ChevronsUpDown className="size-3.5 shrink-0 text-brand-subtext/50 group-data-[collapsible=icon]:hidden" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-56 rounded-xl" side="top" align="start" sideOffset={8}>
            <div className="flex items-center gap-3 px-3 py-2.5">
              <Avatar className="size-9 rounded-full">
                {profilePhotoUrl ? <AvatarImage src={profilePhotoUrl} alt={doctor?.full_name || "Doctor"} /> : null}
                <AvatarFallback className="rounded-full bg-brand/10 text-xs font-bold text-brand">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{doctor?.full_name || "Doctor"}</p>
                <p className="truncate text-xs text-muted-foreground">{doctor?.registration_no || ""}</p>
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/doctor/profile")}>
              <Settings className="mr-2 size-4" />
              Settings & Profile
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleLogout}
              className="text-red-500 focus:bg-red-50 focus:text-red-600"
            >
              <LogOut className="mr-2 size-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

function SSEIndicator({ state }: { state: "connecting" | "connected" | "disconnected" }) {
  if (state === "connected") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        Live
      </span>
    );
  }

  if (state === "connecting") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
        <Wifi className="h-3 w-3 animate-pulse" />
        Connecting
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-600">
      <WifiOff className="h-3 w-3" />
      Offline
    </span>
  );
}

function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
