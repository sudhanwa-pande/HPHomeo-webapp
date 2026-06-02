import React from "react";
import { Receipt as ReceiptIcon, Download } from "lucide-react";
import { SectionShell, InfoLabel } from "./shared";
import { formatDateOnly } from "./utils";
import { Button } from "@/components/ui/button";
import { fetchAndOpenPdf } from "@/lib/pdf";
import type { Receipt } from "@/types/receipt";

export function ReceiptSection({
  appointmentId,
  receipt,
}: {
  appointmentId: string;
  receipt: Receipt | null;
}) {
  if (!receipt) {
    return (
      <SectionShell title="Receipt">
        <div className="flex flex-col items-center py-10">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-bg">
            <ReceiptIcon className="h-6 w-6 text-brand-subtext/50" />
          </div>
          <p className="mt-4 text-sm font-medium text-brand-dark">
            No receipt available
          </p>
          <p className="mt-1 text-xs text-brand-subtext">
            A receipt will be generated after the appointment is completed and
            payment is confirmed.
          </p>
        </div>
      </SectionShell>
    );
  }

  return (
    <div className="space-y-5">
      <SectionShell
        title="Receipt"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={() =>
                fetchAndOpenPdf(`/doctor/appointments/${appointmentId}/receipt/pdf/view`)
              }
            >
              <Download className="h-3.5 w-3.5" />
              Download PDF
            </Button>
          </div>
        }
      >
        {/* Receipt summary */}
        <div className="grid gap-4 sm:grid-cols-2">
          <InfoLabel label="Receipt ID" value={receipt.receipt_id} />
          <InfoLabel label="Patient" value={receipt.patient_name} />
          <InfoLabel
            label="Consultation Fee"
            value={`₹ ${receipt.consultation_fee.toLocaleString("en-IN")}`}
          />
          <InfoLabel label="Payment Method" value={receipt.payment_method} />
          <InfoLabel
            label="Date"
            value={formatDateOnly(receipt.receipt_date)}
          />
          {receipt.payment_id && (
            <InfoLabel label="Payment ID" value={receipt.payment_id} />
          )}
        </div>
      </SectionShell>
    </div>
  );
}
