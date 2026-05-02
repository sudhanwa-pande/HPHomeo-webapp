"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef, ColumnFiltersState } from "@tanstack/react-table";
import {
  Check,
  ChevronLeft,
  Loader2,
  LogOut,
  Menu,
  RefreshCw,
  Search,
  Shield,
  ShieldOff,
  Stethoscope,
  UserCheck,
  UserX,
  Users,
  X,
} from "lucide-react";
import api, { getApiError } from "@/lib/api";
import { notifyApiError, notifyError, notifySuccess } from "@/lib/notify";
import { AuthGuard, broadcastLogout } from "@/components/auth-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDoctorAuth } from "@/stores/doctor-auth";
import { DataTable, StatusBadge } from "@/components/doctor/ui";
import type { AdminDoctor, AdminDoctorListResponse } from "@/types/admin";

type VerificationFilter = "all" | "pending" | "approved" | "rejected";

const FILTER_TABS: { value: VerificationFilter; label: string; icon: typeof Users }[] = [
  { value: "all", label: "All Doctors", icon: Users },
  { value: "pending", label: "Pending", icon: Stethoscope },
  { value: "approved", label: "Approved", icon: UserCheck },
  { value: "rejected", label: "Rejected", icon: UserX },
];

export default function AdminDashboardPage() {
  return (
    <AuthGuard role="admin">
      <AdminDoctorPanel />
    </AuthGuard>
  );
}

function AdminDoctorPanel() {
  const router = useRouter();
  const { doctor } = useDoctorAuth();
  const [status, setStatus] = useState<VerificationFilter>("pending");
  const [search, setSearch] = useState("");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectDrafts, setRejectDrafts] = useState<Record<string, string>>({});
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const queryParams = useMemo(
    () => ({
      limit: 30,
      ...(status !== "all" ? { verification_status: status } : {}),
      ...(search.trim() ? { search: search.trim() } : {}),
    }),
    [search, status]
  );

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-doctors", queryParams],
    queryFn: async ({ signal }) => {
      const { data } = await api.get<AdminDoctorListResponse>("/admin/doctors", {
        params: queryParams,
        signal,
      });
      return data;
    },
    retry: false,
  });

  const handleAuthAwareError = useCallback(
    (error: unknown) => {
      const message = getApiError(error);
      if (message.includes("Admin re-auth required") || message.includes("Admin TOTP setup required")) {
        notifyError("Admin verification required", message);
        router.push("/admin/login");
        return;
      }
      notifyApiError(error, "Couldn't complete admin action");
    },
    [router]
  );

  async function runDoctorAction(
    doctorId: string,
    action: "approve" | "reject" | "suspend" | "unsuspend"
  ) {
    setActionLoadingId(`${doctorId}:${action}`);
    try {
      if (action === "reject") {
        const reason = (rejectDrafts[doctorId] || "").trim();
        if (reason.length < 3) {
          notifyError("Reason too short", "Add at least 3 characters before rejecting this doctor.");
          return;
        }
        await api.post(`/admin/doctors/${doctorId}/reject`, {
          rejection_reason: reason,
        });
        setRejectingId(null);
        setRejectDrafts((prev) => {
          const next = { ...prev };
          delete next[doctorId];
          return next;
        });
      } else {
        await api.post(`/admin/doctors/${doctorId}/${action}`);
      }

      const actionLabel =
        action === "approve"
          ? "approved"
          : action === "reject"
            ? "rejected"
            : action === "suspend"
            ? "suspended"
              : "unsuspended";
      notifySuccess(`Doctor ${actionLabel}`, "The change is now reflected in the admin queue.");
      await refetch();
    } catch (error) {
      handleAuthAwareError(error);
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleAdminLogout() {
    try {
      await api.post("/admin/auth/logout");
      broadcastLogout("admin");
      notifySuccess("Admin session closed", "You've been signed out successfully.");
      router.push("/doctor/dashboard");
    } catch (error) {
      handleAuthAwareError(error);
    }
  }

  const doctors = data?.doctors || [];

  const columns: ColumnDef<AdminDoctor>[] = [
      {
        accessorKey: "full_name",
        header: "Doctor",
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[10px] font-bold text-brand">
              {row.original.full_name
                .split(" ")
                .slice(0, 2)
                .map((name) => name[0])
                .join("")
                .toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate type-body-sm font-medium text-brand-dark">{row.original.full_name}</p>
              <p className="truncate type-caption text-brand-subtext">{row.original.registration_no}</p>
            </div>
          </div>
        ),
      },
      {
        accessorKey: "email",
        header: "Contact",
        cell: ({ row }) => (
          <div className="type-body-sm text-brand-dark">
            <p>{row.original.email}</p>
            <p className="type-caption text-brand-subtext">{row.original.phone}</p>
          </div>
        ),
      },
      {
        accessorKey: "verification_status",
        header: "Status",
        cell: ({ row }) => <StatusBadge variant={row.original.verification_status} />,
      },
      {
        accessorKey: "is_suspended",
        header: "Access",
        cell: ({ row }) =>
          row.original.is_suspended ? (
            <StatusBadge variant="warning" label="Suspended" />
          ) : (
            <StatusBadge variant="success" label="Active" />
          ),
      },
      {
        accessorKey: "created_at",
        header: "Created",
        cell: ({ row }) => (
          <div className="type-body-sm text-brand-dark">
            <p>
              {row.original.created_at
                ? new Date(row.original.created_at).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })
                : "-"}
            </p>
            <p className="type-caption text-brand-subtext">
              {row.original.verified_at
                ? `Verified ${new Date(row.original.verified_at).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                  })}`
                : "Awaiting verification"}
            </p>
          </div>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const doc = row.original;
          const isApproved = doc.verification_status === "approved";
          const isRejected = doc.verification_status === "rejected";
          const isShowingReject = rejectingId === doc.doctor_id;
          const isAnyLoading = actionLoadingId !== null;

          return (
            <div className="min-w-[16rem] space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {!isApproved && (
                  <Button
                    size="xs"
                    onClick={() => runDoctorAction(doc.doctor_id, "approve")}
                    disabled={isAnyLoading}
                    className="bg-emerald-500 text-white hover:bg-emerald-600"
                  >
                    {actionLoadingId === `${doc.doctor_id}:approve` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    Approve
                  </Button>
                )}
                {!isRejected && (
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => setRejectingId((prev) => (prev === doc.doctor_id ? null : doc.doctor_id))}
                    disabled={isAnyLoading}
                    className="border-red-200 text-red-500"
                  >
                    Reject
                  </Button>
                )}
                {isApproved && (
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => runDoctorAction(doc.doctor_id, doc.is_suspended ? "unsuspend" : "suspend")}
                    disabled={isAnyLoading}
                    className={doc.is_suspended ? "border-emerald-200 text-emerald-600" : "border-amber-200 text-amber-600"}
                  >
                    {doc.is_suspended ? <Shield className="h-3 w-3" /> : <ShieldOff className="h-3 w-3" />}
                    {doc.is_suspended ? "Unsuspend" : "Suspend"}
                  </Button>
                )}
              </div>
              {isShowingReject ? (
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Reason"
                    value={rejectDrafts[doc.doctor_id] || ""}
                    onChange={(e) => setRejectDrafts((prev) => ({ ...prev, [doc.doctor_id]: e.target.value }))}
                    className="type-caption h-8"
                  />
                  <Button
                    size="xs"
                    variant="destructive"
                    onClick={() => runDoctorAction(doc.doctor_id, "reject")}
                    disabled={isAnyLoading}
                  >
                    {actionLoadingId === `${doc.doctor_id}:reject` ? <Loader2 className="h-3 w-3 animate-spin" /> : "Confirm"}
                  </Button>
                </div>
              ) : null}
            </div>
          );
        },
      },
    ];

  return (
    <div className="flex min-h-screen bg-brand-bg">
      {sidebarOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-screen w-64 flex-col border-r border-border/50 bg-white transition-transform duration-200 lg:sticky lg:top-0 lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-border/50 px-5">
          <Image src="/images/logo.png" alt="hpHomeo" width={120} height={40} className="h-8 w-auto" />
          <button className="p-1 text-brand-subtext hover:text-brand-dark lg:hidden" onClick={() => setSidebarOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mx-4 mt-4 flex items-center gap-3 rounded-xl bg-brand/5 p-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-bold text-brand">
            {doctor?.full_name
              ?.split(" ")
              .slice(0, 2)
              .map((name) => name[0])
              .join("")
              .toUpperCase() || "A"}
          </div>
          <div className="min-w-0">
            <p className="truncate type-body-sm font-semibold text-brand-dark">{doctor?.full_name || "Admin"}</p>
            <p className="type-caption text-brand-subtext">Administrator</p>
          </div>
        </div>

        <nav className="mt-6 flex-1 space-y-1 overflow-y-auto px-3">
          <p className="type-caption mb-2 px-3 font-semibold uppercase tracking-wider text-brand-subtext/60">
            Doctor Management
          </p>
          {FILTER_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = status === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => {
                  setStatus(tab.value);
                  setSidebarOpen(false);
                }}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                  isActive ? "bg-brand text-white shadow-sm" : "text-brand-subtext hover:bg-brand-bg hover:text-brand-dark"
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
                {isActive && doctors.length > 0 ? (
                  <span className="ml-auto rounded-full bg-white/20 px-2 py-0.5 text-[11px]">
                    {doctors.length}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="shrink-0 space-y-1 border-t border-border/50 p-3">
          <button
            onClick={() => router.push("/doctor/dashboard")}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-brand-subtext transition-all hover:bg-brand-bg hover:text-brand-dark"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to Dashboard
          </button>
          <button
            onClick={handleAdminLogout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-red-500 transition-all hover:bg-red-50 hover:text-red-600"
          >
            <LogOut className="h-4 w-4" />
            Logout Admin
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border/50 bg-white px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <button className="rounded-lg p-1.5 hover:bg-brand-bg lg:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu className="h-5 w-5 text-brand-dark" />
            </button>
            <div>
              <h1 className="type-h3 text-brand-dark">
                {FILTER_TABS.find((tab) => tab.value === status)?.label || "Doctors"}
              </h1>
              <p className="type-caption text-brand-subtext">
                {doctors.length} doctor{doctors.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative hidden w-64 sm:block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-subtext" />
              <Input
                placeholder="Search doctors..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 border-0 bg-brand-bg pl-9 focus-visible:ring-brand/30"
              />
            </div>
            <Button variant="ghost" size="icon-sm" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        </header>

        <div className="px-4 pt-4 sm:hidden">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-subtext" />
            <Input
              placeholder="Search doctors..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-white pl-9"
            />
          </div>
        </div>

        <main className="min-w-0 flex-1 p-4 lg:p-6">
          <DataTable
            columns={columns}
            data={doctors}
            loading={isLoading}
            emptyIcon={UserCheck}
            emptyTitle="No doctors found"
            emptyDescription="Try a different filter or search term"
            storageKey="admin-doctors-table"
            searchPlaceholder="Search doctors"
            savedViews={[
              { id: "all", label: "All doctors" },
              {
                id: "pending",
                label: "Pending",
                columnFilters: [{ id: "verification_status", value: "pending" }] as ColumnFiltersState,
              },
              {
                id: "approved",
                label: "Approved",
                columnFilters: [{ id: "verification_status", value: "approved" }] as ColumnFiltersState,
              },
              {
                id: "rejected",
                label: "Rejected",
                columnFilters: [{ id: "verification_status", value: "rejected" }] as ColumnFiltersState,
              },
            ]}
            filterOptions={[
              {
                id: "verification_status",
                label: "Verification",
                options: [
                  { label: "Pending", value: "pending" },
                  { label: "Approved", value: "approved" },
                  { label: "Rejected", value: "rejected" },
                ],
              },
              {
                id: "is_suspended",
                label: "Access",
                options: [
                  { label: "Suspended", value: "true" },
                  { label: "Active", value: "false" },
                ],
              },
            ]}
            density="compact"
          />
        </main>
      </div>
    </div>
  );
}
