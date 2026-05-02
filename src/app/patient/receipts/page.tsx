"use client";

import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import {
  Calendar,
  CreditCard,
  Download,
  IndianRupee,
  Receipt as ReceiptIcon,
  User,
} from "lucide-react";

import api from "@/lib/api";
import { AuthGuard } from "@/components/auth-guard";
import { PatientShell } from "@/components/patient/patient-shell";
import { Button } from "@/components/ui/button";
import { DataTable, DataTableSortHeader } from "@/components/ui/data-table";
import { Skeleton } from "@/components/loading";
import type { Receipt } from "@/types/receipt";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function ReceiptsContent() {
  const searchParams = useSearchParams();
  const appointmentFilter = searchParams.get("appointment");

  const { data: raw, isLoading } = useQuery({
    queryKey: ["patient", "receipts"],
    queryFn: async () => {
      const { data } = await api.get("/patient/receipts");
      return data;
    },
  });

  const receipts: Receipt[] = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.items)
      ? raw.items
      : [];

  const filtered = appointmentFilter
    ? receipts.filter((r) => r.appointment_id === appointmentFilter)
    : receipts;

  async function handleDownload(appointmentId: string) {
    try {
      const { data } = await api.get<{ pdf_url: string }>(
        `/patient/appointments/${appointmentId}/receipt/pdf`,
      );
      if (data.pdf_url) {
        window.open(data.pdf_url, "_blank");
      }
    } catch {
      const url = `${process.env.NEXT_PUBLIC_API_URL}/patient/appointments/${appointmentId}/receipt/pdf/view`;
      window.open(url, "_blank");
    }
  }

  const columns: ColumnDef<Receipt>[] = [
    {
      accessorKey: "receipt_id",
      header: "Receipt",
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50">
              <ReceiptIcon className="h-3.5 w-3.5 text-amber-600" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-900">{r.receipt_id}</p>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "doctor_name",
      header: "Doctor",
      cell: ({ row }) => (
        <p className="text-sm text-gray-900">Dr. {row.original.doctor_name}</p>
      ),
    },
    {
      accessorKey: "receipt_date",
      header: ({ column }) => <DataTableSortHeader column={column} title="Date" />,
      cell: ({ row }) => (
        <p className="text-sm text-gray-500">{formatDate(row.original.receipt_date)}</p>
      ),
    },
    {
      accessorKey: "consultation_fee",
      header: ({ column }) => <DataTableSortHeader column={column} title="Amount" />,
      cell: ({ row }) => (
        <p className="text-sm font-semibold text-gray-900">₹{row.original.consultation_fee}</p>
      ),
    },
    {
      accessorKey: "payment_method",
      header: "Method",
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <CreditCard className="h-3.5 w-3.5 text-gray-400" />
          <span className="text-sm capitalize text-gray-600">{row.original.payment_method}</span>
        </div>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const r = row.original;
        return r.pdf_url ? (
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => handleDownload(r.appointment_id)}
              className="h-7 gap-1 bg-amber-600 text-[11px] hover:bg-amber-700"
            >
              <Download className="h-3 w-3" />
              PDF
            </Button>
          </div>
        ) : null;
      },
    },
  ];

  return (
    <PatientShell
      title="Receipts"
      subtitle={`${filtered.length} receipt${filtered.length !== 1 ? "s" : ""}`}
    >
      <div className="space-y-4">
        {appointmentFilter && (
          <div className="flex items-center gap-2 rounded-lg border border-gray-200/60 bg-white px-3 py-2">
            <span className="text-xs text-gray-500">Filtered by appointment</span>
            <a href="/patient/receipts" className="text-xs font-medium text-brand hover:underline">Clear filter</a>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-48 w-full rounded-xl" />
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={filtered}
            pageSize={10}
            emptyState={
              <div className="flex flex-col items-center py-8">
                <ReceiptIcon className="mb-2 h-8 w-8 text-gray-300" />
                <p className="text-sm text-gray-500">No receipts yet</p>
                <p className="text-xs text-gray-400">Payment receipts from your appointments will appear here</p>
              </div>
            }
          />
        )}
      </div>
    </PatientShell>
  );
}

export default function PatientReceiptsPage() {
  return (
    <AuthGuard role="patient">
      <ReceiptsContent />
    </AuthGuard>
  );
}
