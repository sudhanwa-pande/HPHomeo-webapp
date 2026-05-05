"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEventStream } from "@/hooks/use-event-stream";
import { type ColumnDef } from "@tanstack/react-table";
import { AnimatePresence, motion } from "framer-motion";
import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Download,
  FileText,
  FlaskConical,
  X,
} from "lucide-react";

import api from "@/lib/api";
import { fetchAndOpenPdf } from "@/lib/pdf";
import { notifyError } from "@/lib/notify";
import { AuthGuard } from "@/components/auth-guard";
import { PatientShell } from "@/components/patient/patient-shell";
import { Button } from "@/components/ui/button";
import { DataTable, DataTableSortHeader } from "@/components/ui/data-table";
import { Skeleton } from "@/components/loading";
import type { PatientPrescription } from "@/types/patient";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function PrescriptionsContent() {
  const searchParams = useSearchParams();
  const appointmentFilter = searchParams.get("appointment");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Auto-refresh when a new prescription arrives (doctor completes appointment)
  useEventStream({
    path: "/patient/events/stream",
    onEvent: {
      appointment_completed: () => {
        queryClient.invalidateQueries({ queryKey: ["patient", "prescriptions"] });
      },
    },
    onReconnect: () => {
      queryClient.invalidateQueries({ queryKey: ["patient", "prescriptions"] });
    },
  });

  const { data: raw, isLoading } = useQuery({
    queryKey: ["patient", "prescriptions"],
    queryFn: async () => {
      const { data } = await api.get("/patient/prescriptions");
      return data;
    },
  });

  const prescriptions: PatientPrescription[] = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.items)
      ? raw.items
      : [];
  const filtered = appointmentFilter
    ? prescriptions.filter((p) => p.appointment_id === appointmentFilter)
    : prescriptions;

  const finalCount = filtered.filter((p) => p.status === "final").length;
  const totalMeds = filtered.reduce((sum, p) => sum + p.items.length, 0);

  async function handleDownload(appointmentId: string) {
    try {
      await fetchAndOpenPdf(`/patient/appointments/${appointmentId}/prescription/pdf/view`);
    } catch {
      notifyError("Couldn't open prescription PDF");
    }
  }

  const columns: ColumnDef<PatientPrescription>[] = [
    {
      accessorKey: "rx_id",
      header: "Prescription",
      cell: ({ row }) => {
        const rx = row.original;
        return (
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 ring-1 ring-violet-100">
              <FileText className="h-4 w-4 text-violet-600" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-900">{rx.rx_id}</p>
              <p className="text-[11px] text-gray-400">version {rx.version}</p>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "doctor_info.full_name",
      header: "Doctor",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[9px] font-bold text-gray-500">
            {row.original.doctor_info.full_name?.charAt(0).toUpperCase()}
          </div>
          <p className="text-sm text-gray-700">Dr. {row.original.doctor_info.full_name}</p>
        </div>
      ),
    },
    {
      accessorKey: "created_at",
      header: ({ column }) => <DataTableSortHeader column={column} title="Date" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5 text-sm text-gray-500">
          <Calendar className="h-3.5 w-3.5 text-gray-400" />
          {formatDate(row.original.created_at)}
        </div>
      ),
    },
    {
      id: "medicines",
      header: "Medicines",
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
          <FlaskConical className="h-3 w-3" />
          {row.original.items.length}{" "}
          {row.original.items.length === 1 ? "medicine" : "medicines"}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = row.original.status;
        if (status === "final") {
          return (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-[11px] font-semibold text-green-700">
              <CheckCircle2 className="h-3 w-3" />
              Final
            </span>
          );
        }
        return (
          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-500">
            Draft
          </span>
        );
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const rx = row.original;
        const isExpanded = expandedId === rx.id;
        return (
          <div className="flex items-center justify-end gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExpandedId(isExpanded ? null : rx.id)}
              className="h-7 gap-1 border-gray-200 text-[11px] text-gray-600 hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
            >
              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {isExpanded ? "Less" : "Details"}
            </Button>
            {rx.pdf_url && (
              <Button
                size="sm"
                onClick={() => handleDownload(rx.appointment_id)}
                className="h-7 gap-1 bg-violet-600 text-[11px] hover:bg-violet-700"
              >
                <Download className="h-3 w-3" />
                PDF
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <PatientShell
      title="Prescriptions"
      subtitle={`${filtered.length} prescription${filtered.length !== 1 ? "s" : ""}`}
    >
      <div className="space-y-4">
        {/* Stats strip */}
        {!isLoading && filtered.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Total", value: filtered.length, icon: ClipboardList, color: "text-violet-600", bg: "bg-violet-50" },
              { label: "Finalised", value: finalCount, icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50" },
              { label: "Medicines", value: totalMeds, icon: FlaskConical, color: "text-violet-600", bg: "bg-violet-50" },
            ].map((s) => (
              <div
                key={s.label}
                className="flex items-center gap-2.5 rounded-xl border border-gray-100 bg-white px-3 py-2.5 shadow-[0_1px_4px_rgba(0,0,0,0.04)]"
              >
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${s.bg}`}>
                  <s.icon className={`h-4 w-4 ${s.color}`} />
                </div>
                <div>
                  <p className="text-lg font-bold text-gray-900 leading-none">{s.value}</p>
                  <p className="text-[10px] font-medium text-gray-400 mt-0.5">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {appointmentFilter && (
          <div className="flex items-center justify-between rounded-xl border border-violet-100 bg-violet-50/50 px-3.5 py-2.5">
            <span className="text-xs font-medium text-violet-700">Filtered by appointment</span>
            <a
              href="/patient/prescriptions"
              className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700 hover:underline"
            >
              <X className="h-3 w-3" /> Clear filter
            </a>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-48 w-full rounded-xl" />
          </div>
        ) : (
          <>
            <DataTable
              columns={columns}
              data={filtered}
              pageSize={10}
              emptyState={
                <div className="flex flex-col items-center py-12">
                  <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50">
                    <ClipboardList className="h-6 w-6 text-violet-400" />
                  </div>
                  <p className="text-sm font-semibold text-gray-700">No prescriptions yet</p>
                  <p className="mt-1 text-xs text-gray-400">
                    Prescriptions from completed consultations will appear here
                  </p>
                </div>
              }
            />

            {/* Expanded prescription detail */}
            <AnimatePresence>
              {expandedId &&
                (() => {
                  const rx = filtered.find((p) => p.id === expandedId);
                  if (!rx) return null;
                  return (
                    <motion.div
                      key={expandedId}
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.18 }}
                      className="overflow-hidden rounded-2xl border border-violet-200/70 bg-white shadow-[0_4px_24px_rgba(109,40,217,0.06)]"
                    >
                      {/* Detail header */}
                      <div className="flex items-center justify-between border-b border-gray-100 bg-violet-50/40 px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100">
                            <FileText className="h-4 w-4 text-violet-600" />
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-gray-900">{rx.rx_id}</h3>
                            <p className="text-[11px] text-gray-500">
                              Dr. {rx.doctor_info.full_name} · {formatDate(rx.created_at)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {rx.pdf_url && (
                            <Button
                              size="sm"
                              onClick={() => handleDownload(rx.appointment_id)}
                              className="h-8 gap-1.5 bg-violet-600 text-xs hover:bg-violet-700"
                            >
                              <Download className="h-3.5 w-3.5" />
                              Download PDF
                            </Button>
                          )}
                          <button
                            onClick={() => setExpandedId(null)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      <div className="grid gap-5 p-5 sm:grid-cols-2">
                        {/* Left: Clinical info */}
                        <div className="space-y-4">
                          {rx.chief_complaints && (
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                                Chief Complaints
                              </p>
                              <p className="mt-1.5 text-sm text-gray-800">{rx.chief_complaints}</p>
                            </div>
                          )}
                          {rx.diagnosis && (
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                                Diagnosis
                              </p>
                              <p className="mt-1.5 text-sm font-medium text-gray-900">{rx.diagnosis}</p>
                            </div>
                          )}
                          {rx.advice && (
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                                Advice
                              </p>
                              <p className="mt-1.5 text-sm text-gray-800">{rx.advice}</p>
                            </div>
                          )}
                        </div>

                        {/* Right: Medicines */}
                        {rx.items.length > 0 && (
                          <div>
                            <p className="mb-2.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                              Medicines ({rx.items.length})
                            </p>
                            <div className="space-y-2">
                              {rx.items.map((item, idx) => (
                                <div
                                  key={idx}
                                  className="rounded-xl border border-gray-100 bg-gray-50/80 p-3"
                                >
                                  <div className="flex items-center gap-2">
                                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-50">
                                      <FlaskConical className="h-3.5 w-3.5 text-violet-500" />
                                    </div>
                                    <p className="text-sm font-semibold text-gray-900">{item.name}</p>
                                  </div>
                                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                                    {item.dosage && (
                                      <span className="text-[11px] text-gray-500">
                                        <span className="font-medium text-gray-600">Dose:</span>{" "}
                                        {item.dosage}
                                      </span>
                                    )}
                                    {item.frequency && (
                                      <span className="text-[11px] text-gray-500">
                                        <span className="font-medium text-gray-600">Freq:</span>{" "}
                                        {item.frequency}
                                      </span>
                                    )}
                                    {item.duration && (
                                      <span className="text-[11px] text-gray-500">
                                        <span className="font-medium text-gray-600">Duration:</span>{" "}
                                        {item.duration}
                                      </span>
                                    )}
                                  </div>
                                  {item.instructions && (
                                    <p className="mt-1.5 text-[11px] italic text-gray-400">
                                      {item.instructions}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })()}
            </AnimatePresence>
          </>
        )}
      </div>
    </PatientShell>
  );
}

export default function PatientPrescriptionsPage() {
  return (
    <AuthGuard role="patient">
      <PrescriptionsContent />
    </AuthGuard>
  );
}
