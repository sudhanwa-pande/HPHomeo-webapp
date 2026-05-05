"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef, ColumnFiltersState } from "@tanstack/react-table";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  IndianRupee,
  Mail,
  Phone,
  Receipt as ReceiptIcon,
  Users,
} from "lucide-react";

import api from "@/lib/api";
import { fetchAndOpenPdf } from "@/lib/pdf";
import { AuthGuard } from "@/components/auth-guard";
import { DoctorShell } from "@/components/doctor/doctor-shell";
import { DataTable, PageHeader, SectionCard, StatCard, StatusBadge } from "@/components/doctor/ui";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DoctorPatient, Prescription } from "@/types/doctor";
import type { Receipt } from "@/types/receipt";

export default function PatientsPage() {
  return (
    <AuthGuard role="doctor">
      <PatientsContent />
    </AuthGuard>
  );
}

function PatientsContent() {
  const [selectedPatient, setSelectedPatient] = useState<DoctorPatient | null>(null);

  const { data: patients, isLoading } = useQuery({
    queryKey: ["doctor-patients"],
    queryFn: async () => {
      const { data } = await api.get<DoctorPatient[]>("/patients");
      return data;
    },
    placeholderData: (prev) => prev,
  });

  const totalPatients = patients?.length ?? 0;
  const contactComplete = patients?.filter((p) => p.phone && p.email).length ?? 0;
  const missingContact = patients?.filter((p) => !p.phone || !p.email).length ?? 0;

  const columns = useMemo<ColumnDef<DoctorPatient>[]>(
    () => [
      {
        accessorKey: "full_name",
        header: "Patient",
        cell: ({ row }) => {
          const patient = row.original;
          const initials =
            patient.full_name
              ?.split(" ")
              .slice(0, 2)
              .map((n) => n[0])
              .join("")
              .toUpperCase() || "P";
          return (
            <div className="flex min-w-0 items-center gap-3">
              <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand/20 to-brand/5 text-[11px] font-bold text-brand ring-2 ring-brand/10">
                {initials}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-brand-dark">{patient.full_name}</p>
                <p className="text-xs text-brand-subtext">
                  {patient.age ? `${patient.age}y` : ""}
                  {patient.age && patient.sex ? " · " : ""}
                  {patient.sex ?? ""}
                  {!patient.age && !patient.sex ? "No demographics" : ""}
                </p>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "phone",
        header: "Phone",
        cell: ({ row }) =>
          row.original.phone ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-brand-dark">
              <Phone className="h-3.5 w-3.5 text-brand/60" />
              {row.original.phone}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-sm text-brand-subtext/50">
              <Phone className="h-3.5 w-3.5" />—
            </span>
          ),
      },
      {
        accessorKey: "email",
        header: "Email",
        cell: ({ row }) =>
          row.original.email ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-brand-dark">
              <Mail className="h-3.5 w-3.5 text-brand/60" />
              <span className="truncate max-w-[180px]">{row.original.email}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-sm text-brand-subtext/50">
              <Mail className="h-3.5 w-3.5" />—
            </span>
          ),
      },
      {
        id: "contact_state",
        accessorFn: (row) => (row.phone && row.email ? "complete" : "missing"),
        header: "Contact",
        cell: ({ row }) =>
          row.original.phone && row.original.email ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-[11px] font-semibold text-green-700">
              <CheckCircle2 className="h-3 w-3" />
              Complete
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
              <AlertCircle className="h-3 w-3" />
              Incomplete
            </span>
          ),
      },
      {
        accessorKey: "created_at",
        header: "Added",
        cell: ({ row }) => (
          <span className="text-sm text-brand-subtext">
            {row.original.created_at
              ? new Date(row.original.created_at).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })
              : "—"}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 border-brand/20 text-brand hover:bg-brand/5 hover:border-brand/40"
            onClick={(event) => {
              event.stopPropagation();
              setSelectedPatient(row.original);
            }}
          >
            <FileText className="h-3.5 w-3.5" />
            History
          </Button>
        ),
      },
    ],
    []
  );

  return (
    <DoctorShell title="Patients" subtitle="Directory">
      <PatientPrescriptionHistory
        patient={selectedPatient}
        onClose={() => setSelectedPatient(null)}
      />

      <div className="space-y-5">
        {/* Stats row */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            icon={Users}
            label="Total patients"
            value={totalPatients}
            loading={isLoading}
            helper="All time registrations"
          />
          <StatCard
            icon={CheckCircle2}
            label="Contact complete"
            value={contactComplete}
            loading={isLoading}
            iconBg="bg-green-50"
            iconColor="text-green-600"
            helper="Phone & email on file"
          />
          <StatCard
            icon={AlertCircle}
            label="Missing contact"
            value={missingContact}
            loading={isLoading}
            iconBg="bg-amber-50"
            iconColor="text-amber-500"
            helper="Needs follow-up"
          />
        </div>

        <SectionCard elevated className="bg-white/94">
          <PageHeader
            compact
            title="Patient records"
            meta={
              <>
                <span className="rounded-full bg-brand-bg px-3 py-1.5 text-xs font-semibold text-brand-subtext">
                  {totalPatients} total
                </span>
                <span className="rounded-full bg-brand-bg px-3 py-1.5 text-xs font-semibold text-brand-subtext">
                  Prescription drill-in
                </span>
              </>
            }
          />
        </SectionCard>

        <DataTable
          columns={columns}
          data={patients ?? []}
          loading={isLoading}
          emptyIcon={Users}
          emptyTitle="No patients found"
          emptyDescription="Patients will appear here after appointments"
          onRowClick={(patient) => setSelectedPatient(patient)}
          storageKey="doctor-patients-table"
          searchPlaceholder="Search patients"
          savedViews={[
            { id: "all", label: "All" },
            {
              id: "missing-contact",
              label: "Missing contact",
              columnFilters: [{ id: "contact_state", value: "missing" }] as ColumnFiltersState,
            },
          ]}
          filterOptions={[
            {
              id: "contact_state",
              label: "Contact",
              options: [
                { label: "Complete", value: "complete" },
                { label: "Missing", value: "missing" },
              ],
            },
          ]}
          density="compact"
        />
      </div>
    </DoctorShell>
  );
}

function PatientPrescriptionHistory({
  patient,
  onClose,
}: {
  patient: DoctorPatient | null;
  onClose: () => void;
}) {
  const patientId = patient?.id ?? null;

  const { data: prescriptions, isLoading } = useQuery({
    queryKey: ["patient-prescriptions", patientId],
    queryFn: async () => {
      const { data } = await api.get<{ patient: unknown; items: Prescription[] }>(
        `/doctor/patients/${patientId}/prescription-history`
      );
      return data.items;
    },
    enabled: !!patientId,
  });

  const { data: receipts, isLoading: receiptsLoading } = useQuery({
    queryKey: ["patient-receipts", patientId],
    queryFn: async () => {
      const { data } = await api.get<{ items: Receipt[] }>(
        `/doctor/patients/${patientId}/receipt-history`
      );
      return data.items;
    },
    enabled: !!patientId,
  });

  const prescriptionColumns = useMemo<ColumnDef<Prescription>[]>(
    () => [
      {
        accessorKey: "rx_id",
        header: "RX ID",
        cell: ({ row }) => (
          <span className="font-mono text-xs font-medium text-brand-dark">{row.original.rx_id}</span>
        ),
      },
      {
        accessorKey: "created_at",
        header: "Date",
        cell: ({ row }) => (
          <span className="text-sm text-brand-subtext">
            {row.original.created_at
              ? new Date(row.original.created_at).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })
              : "—"}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge variant={row.original.status as "draft" | "final"} />,
      },
      {
        accessorKey: "diagnosis",
        header: "Diagnosis",
        cell: ({ row }) => (
          <div className="max-w-[14rem] text-sm text-brand-dark">
            {row.original.diagnosis || row.original.chief_complaints || "—"}
          </div>
        ),
      },
      {
        id: "items",
        header: "Medicines",
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.items.length > 0 ? (
              row.original.items.slice(0, 2).map((item, i) => (
                <span
                  key={i}
                  className="rounded-full bg-brand-bg px-2 py-0.5 text-[11px] font-medium text-brand-subtext"
                >
                  {item.name}
                </span>
              ))
            ) : (
              <span className="text-sm text-brand-subtext">—</span>
            )}
            {row.original.items.length > 2 && (
              <span className="rounded-full bg-brand-bg px-2 py-0.5 text-[11px] text-brand-subtext">
                +{row.original.items.length - 2}
              </span>
            )}
          </div>
        ),
      },
      {
        id: "pdf",
        header: "PDF",
        cell: ({ row }) =>
          row.original.pdf_url ? (
            <button
              type="button"
              onClick={() =>
                fetchAndOpenPdf(`/doctor/appointments/${row.original.appointment_id}/prescription/pdf/view`)
              }
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open
            </button>
          ) : (
            <span className="text-sm text-brand-subtext">—</span>
          ),
      },
    ],
    []
  );

  const receiptColumns = useMemo<ColumnDef<Receipt>[]>(
    () => [
      {
        accessorKey: "receipt_id",
        header: "Receipt ID",
        cell: ({ row }) => (
          <span className="font-mono text-xs font-medium text-brand-dark">{row.original.receipt_id}</span>
        ),
      },
      {
        accessorKey: "receipt_date",
        header: "Date",
        cell: ({ row }) => (
          <span className="text-sm text-brand-subtext">
            {new Date(row.original.receipt_date).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
        ),
      },
      {
        accessorKey: "consultation_fee",
        header: "Amount",
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-0.5 text-sm font-semibold text-brand-dark">
            <IndianRupee className="h-3 w-3" />
            {row.original.consultation_fee}
          </span>
        ),
      },
      {
        accessorKey: "payment_method",
        header: "Method",
        cell: ({ row }) => (
          <span className="rounded-full bg-brand-bg px-2.5 py-1 text-[11px] font-medium capitalize text-brand-subtext">
            {row.original.payment_method}
          </span>
        ),
      },
      {
        accessorKey: "payment_id",
        header: "Payment ID",
        cell: ({ row }) => (
          <span className="truncate font-mono text-xs text-brand-subtext">
            {row.original.payment_id || "—"}
          </span>
        ),
      },
      {
        id: "pdf",
        header: "PDF",
        cell: ({ row }) =>
          row.original.pdf_url ? (
            <button
              type="button"
              onClick={() =>
                fetchAndOpenPdf(`/doctor/appointments/${row.original.appointment_id}/receipt/pdf/view`)
              }
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
            >
              <Download className="h-3.5 w-3.5" />
              Open
            </button>
          ) : (
            <span className="text-sm text-brand-subtext">—</span>
          ),
      },
    ],
    []
  );

  const initials =
    patient?.full_name
      ?.split(" ")
      .slice(0, 2)
      .map((n) => n[0])
      .join("")
      .toUpperCase() || "P";

  return (
    <Sheet open={!!patientId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto px-0 sm:max-w-5xl" side="center">
        <SheetHeader className="px-4 sm:px-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand/20 to-brand/5 text-sm font-bold text-brand ring-2 ring-brand/10">
              {initials}
            </div>
            <div>
              <SheetTitle className="text-base">{patient?.full_name ?? "Patient History"}</SheetTitle>
              <SheetDescription className="mt-0.5">
                {[
                  patient?.age ? `${patient.age}y` : null,
                  patient?.sex,
                  patient?.phone,
                  patient?.email,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Prescriptions and receipts on record"}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {/* Stats strip */}
        <div className="mx-4 mt-4 grid grid-cols-2 gap-3 sm:mx-6 sm:grid-cols-4">
          {[
            { label: "Prescriptions", value: prescriptions?.length ?? "—", icon: FileText, color: "text-brand" },
            { label: "Final Rx", value: prescriptions?.filter((p) => p.status === "final").length ?? "—", icon: FileText, color: "text-green-600" },
            { label: "Receipts", value: receipts?.length ?? "—", icon: ReceiptIcon, color: "text-brand" },
            {
              label: "Total paid",
              value: receipts
                ? `₹${receipts.reduce((s, r) => s + (r.consultation_fee || 0), 0)}`
                : "—",
              icon: IndianRupee,
              color: "text-brand",
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="flex flex-col gap-1 rounded-xl border border-gray-100 bg-brand-bg/40 px-3 py-2.5"
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-subtext">
                {stat.label}
              </p>
              <p className={`text-lg font-bold ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="px-4 pt-4 pb-4 sm:px-6">
          <Tabs defaultValue="prescriptions">
            <TabsList className="mb-4">
              <TabsTrigger value="prescriptions" className="gap-1.5">
                <FileText className="h-3.5 w-3.5" />
                Prescriptions
                {prescriptions !== undefined && (
                  <span className="ml-1 rounded-full bg-brand/10 px-1.5 py-0.5 text-[10px] font-bold text-brand">
                    {prescriptions.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="receipts" className="gap-1.5">
                <ReceiptIcon className="h-3.5 w-3.5" />
                Receipts
                {receipts !== undefined && (
                  <span className="ml-1 rounded-full bg-brand/10 px-1.5 py-0.5 text-[10px] font-bold text-brand">
                    {receipts.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="prescriptions">
              <DataTable
                columns={prescriptionColumns}
                data={prescriptions ?? []}
                loading={isLoading}
                emptyIcon={FileText}
                emptyTitle="No prescriptions found"
                storageKey="doctor-patient-history-table"
                searchPlaceholder="Search prescription history"
                density="compact"
              />
            </TabsContent>

            <TabsContent value="receipts">
              <DataTable
                columns={receiptColumns}
                data={receipts ?? []}
                loading={receiptsLoading}
                emptyIcon={ReceiptIcon}
                emptyTitle="No receipts found"
                emptyDescription="Receipts will appear here after payments"
                storageKey="doctor-patient-receipts-table"
                searchPlaceholder="Search receipt history"
                density="compact"
              />
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}
