"use client";

import { type CSSProperties, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import {
  Calendar,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Receipt,
  Search,
  Settings,
  User,
} from "lucide-react";

import { useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { notifyError } from "@/lib/notify";
import { usePatientAuth } from "@/stores/patient-auth";
import { broadcastLogout } from "@/components/auth-guard";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const NAV_ITEMS = [
  { href: "/patient/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/patient/appointments", label: "Appointments", icon: Calendar },
  { href: "/patient/prescriptions", label: "Prescriptions", icon: ClipboardList },
  { href: "/patient/receipts", label: "Receipts", icon: Receipt },
  { href: "/patient/doctors", label: "Find Doctors", icon: Search },
  { href: "/patient/profile", label: "My Profile", icon: User },
];

interface PatientShellProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  headerRight?: ReactNode;
}

export function PatientShell({ children, title, headerRight }: PatientShellProps) {
  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width-icon": "5rem",
          "--sidebar-width": "14.5rem",
        } as CSSProperties
      }
    >
      <PatientSidebar />
      <SidebarInset className="min-h-screen bg-brand-bg">
        <header className="sticky top-0 z-30 flex min-h-[52px] items-center justify-between border-b border-border/20 bg-white/90 px-4 backdrop-blur-md sm:px-5 lg:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <SidebarTrigger className="-ml-1 text-brand-subtext hover:text-brand-dark" />
            <h1 className="truncate text-[14px] font-semibold text-brand-dark">{title}</h1>
          </div>
          {headerRight ? (
            <div className="flex items-center gap-2">{headerRight}</div>
          ) : null}
        </header>

        <main className="flex-1 px-4 py-4 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
          <div className="mx-auto max-w-[1440px]">{children}</div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

function PatientSidebar() {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="gap-2 px-3 pb-0 pt-3">
        <div className="flex items-center justify-center px-2 py-2 group-data-[collapsible=icon]:px-0">
          <button
            onClick={() => router.push("/patient/dashboard")}
            className="cursor-pointer group-data-[collapsible=icon]:hidden"
          >
            <Image
              src="/images/logo.png"
              alt="eHomeo"
              width={130}
              height={44}
              className="h-7 w-auto object-contain"
            />
          </button>
          <button
            onClick={() => router.push("/patient/dashboard")}
            className="hidden cursor-pointer group-data-[collapsible=icon]:block"
          >
            <Image
              src="/images/logo_wthout_text.png"
              alt="eHomeo"
              width={36}
              height={36}
              className="size-9 object-contain"
            />
          </button>
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-0 px-3 pt-4 group-data-[collapsible=icon]:px-2">
        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive =
                  pathname === item.href || pathname.startsWith(item.href + "/");

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      onClick={() => router.push(item.href)}
                      isActive={isActive}
                      tooltip={item.label}
                      className={cn(
                        "relative h-9 rounded-lg px-2.5 text-brand-subtext transition-colors hover:bg-brand-bg/80 hover:text-brand-dark group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:h-10 group-data-[collapsible=icon]:w-10 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 [&_svg]:size-[16px]",
                        isActive &&
                          "bg-brand-bg text-brand-dark before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[2px] before:rounded-full before:bg-brand",
                      )}
                    >
                      <Icon
                        className={cn(
                          "shrink-0 transition-colors",
                          isActive ? "text-brand" : "text-brand-subtext",
                        )}
                      />
                      <span className="block truncate text-[13px] font-medium group-data-[collapsible=icon]:hidden">
                        {item.label}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3 pt-4 group-data-[collapsible=icon]:p-2">
        <SidebarUserFooter />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function SidebarUserFooter() {
  const router = useRouter();
  const { patient, logout } = usePatientAuth();
  const queryClient = useQueryClient();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  async function handleLogout() {
    try {
      await api.post("/patient/auth/logout", undefined, {
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
      broadcastLogout("patient");
      router.replace("/patient/login");
    }
  }

  const initials =
    patient?.full_name
      ?.split(" ")
      .slice(0, 2)
      .map((n) => n[0])
      .join("")
      .toUpperCase() || "P";

  const displayName = patient?.full_name || "Patient";
  const displaySub = patient?.phone || "";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg p-2 text-left outline-none transition-colors hover:bg-brand-bg/70 data-[popup-open]:bg-brand-bg/70",
          collapsed && "justify-center p-1.5",
        )}
      >
        <Avatar className={cn("shrink-0", collapsed ? "size-8" : "size-8")}>
          <AvatarFallback className="rounded-full bg-brand/10 text-[11px] font-bold text-brand">
            {initials}
          </AvatarFallback>
        </Avatar>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-brand-dark">
              {displayName}
            </p>
            <p className="truncate text-[11px] text-brand-subtext">{displaySub}</p>
          </div>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="min-w-52 rounded-xl"
        side={collapsed ? "right" : "top"}
        align={collapsed ? "start" : "end"}
        sideOffset={8}
      >
        <div className="flex items-center gap-3 px-3 py-2.5">
          <Avatar className="size-8">
            <AvatarFallback className="rounded-full bg-brand/10 text-[11px] font-bold text-brand">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold">{displayName}</p>
            <p className="truncate text-[11px] text-brand-subtext">{displaySub}</p>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/patient/profile")}>
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
  );
}
