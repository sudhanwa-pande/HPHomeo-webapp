"use client";

import { useRouter } from "next/navigation";
import { ClipboardList, Receipt, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PrescriptionReceiptPreviewProps {
  appointmentId: string;
  hasPrescription: boolean;
  hasReceipt: boolean;
  fee?: number;
  paymentStatus?: string;
  className?: string;
}

export function PrescriptionReceiptPreview({
  appointmentId,
  hasPrescription,
  hasReceipt,
  fee,
  paymentStatus,
  className,
}: PrescriptionReceiptPreviewProps) {
  const router = useRouter();

  if (!hasPrescription && !hasReceipt) return null;

  return (
    <div className={cn("grid gap-3 sm:grid-cols-2", className)}>
      {hasPrescription && (
        <button
          onClick={() =>
            router.push(
              `/patient/prescriptions?appointment=${appointmentId}`,
            )
          }
          className="group flex items-center gap-3 rounded-2xl border border-gray-200/60 bg-white p-4 text-left transition-all hover:border-brand/20 hover:shadow-sm"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900">Prescription</p>
            <p className="text-xs text-gray-500">View your medicines & advice</p>
          </div>
          <ChevronRight className="h-4 w-4 text-gray-300 transition-colors group-hover:text-brand" />
        </button>
      )}

      {hasReceipt && (
        <button
          onClick={() =>
            router.push(`/patient/receipts?appointment=${appointmentId}`)
          }
          className="group flex items-center gap-3 rounded-2xl border border-gray-200/60 bg-white p-4 text-left transition-all hover:border-brand/20 hover:shadow-sm"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <Receipt className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900">Receipt</p>
            <p className="text-xs text-gray-500">
              {fee && fee > 0
                ? `₹${fee} · ${paymentStatus === "refunded" ? "Refunded" : "Paid"}`
                : "View payment details"}
            </p>
          </div>
          <ChevronRight className="h-4 w-4 text-gray-300 transition-colors group-hover:text-brand" />
        </button>
      )}
    </div>
  );
}
