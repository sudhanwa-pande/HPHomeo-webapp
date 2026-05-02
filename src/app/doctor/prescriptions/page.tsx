"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { ClipboardList, FlaskConical, Layers, Plus, Save, Trash2 } from "lucide-react";
import api from "@/lib/api";
import { notifyApiError, notifyError, notifySuccess } from "@/lib/notify";
import { AuthGuard } from "@/components/auth-guard";
import { DoctorShell } from "@/components/doctor/doctor-shell";
import { DataTable, PageHeader, SectionCard, StatCard } from "@/components/doctor/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { PrescriptionTemplate, RxItem } from "@/types/doctor";

export default function PrescriptionsPage() {
  return (
    <AuthGuard role="doctor">
      <PrescriptionsContent />
    </AuthGuard>
  );
}

function PrescriptionsContent() {
  const queryClient = useQueryClient();
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data: templates, isLoading } = useQuery({
    queryKey: ["prescription-templates"],
    queryFn: async () => {
      const { data } = await api.get<{ items: PrescriptionTemplate[] }>("/doctor/prescription-templates");
      return data.items;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/doctor/prescription-templates/${id}`);
    },
    onSuccess: () => {
      notifySuccess("Template deleted", "It has been removed from your saved templates.");
      queryClient.invalidateQueries({ queryKey: ["prescription-templates"] });
    },
    onError: (err) => notifyApiError(err, "Couldn't delete template"),
  });

  const totalMedicines = templates?.reduce((sum, t) => sum + t.payload.items.length, 0) ?? 0;
  const avgMedicines =
    templates && templates.length > 0 ? (totalMedicines / templates.length).toFixed(1) : "0";

  const columns: ColumnDef<PrescriptionTemplate>[] = [
    {
      accessorKey: "name",
      header: "Template",
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/10">
            <ClipboardList className="h-3.5 w-3.5 text-brand" />
          </div>
          <div>
            <p className="text-sm font-semibold text-brand-dark">{row.original.name}</p>
            <p className="text-xs text-brand-subtext">
              {row.original.payload.diagnosis || row.original.payload.chief_complaints || "No diagnosis noted"}
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "medicines",
      header: "Medicines",
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.payload.items.length > 0 ? (
            <>
              {row.original.payload.items.slice(0, 3).map((item, i) => (
                <span
                  key={i}
                  className="rounded-full bg-brand-bg px-2 py-0.5 text-[11px] font-medium text-brand-subtext"
                >
                  {item.name}
                </span>
              ))}
              {row.original.payload.items.length > 3 && (
                <span className="rounded-full bg-brand-bg px-2 py-0.5 text-[11px] text-brand-subtext">
                  +{row.original.payload.items.length - 3}
                </span>
              )}
            </>
          ) : (
            <span className="text-xs text-brand-subtext/50">No medicines</span>
          )}
        </div>
      ),
    },
    {
      id: "advice",
      header: "Advice",
      cell: ({ row }) => (
        <p className="max-w-[18rem] truncate text-sm text-brand-subtext">
          {row.original.payload.advice || "—"}
        </p>
      ),
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={(event) => {
            event.stopPropagation();
            deleteMutation.mutate(row.original.id);
          }}
          disabled={deleteMutation.isPending}
          className="text-brand-subtext/40 hover:bg-red-50 hover:text-red-500"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      ),
    },
  ];

  return (
    <DoctorShell
      title="Prescriptions"
      subtitle="Templates"
      headerRight={
        <Button size="sm" onClick={() => setSheetOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> New template
        </Button>
      }
    >
      <div className="space-y-5">
        {/* Stats row */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            icon={Layers}
            label="Saved templates"
            value={templates?.length ?? 0}
            loading={isLoading}
            helper="Ready to use in consultations"
          />
          <StatCard
            icon={FlaskConical}
            label="Total medicines"
            value={totalMedicines}
            loading={isLoading}
            iconBg="bg-violet-50"
            iconColor="text-violet-600"
            helper="Across all templates"
          />
          <StatCard
            icon={ClipboardList}
            label="Avg medicines / template"
            value={avgMedicines}
            loading={isLoading}
            iconBg="bg-emerald-50"
            iconColor="text-emerald-600"
            helper="Per template average"
          />
        </div>

        <SectionCard elevated className="bg-white/94">
          <PageHeader
            compact
            title="Reusable templates"
            meta={
              <>
                <span className="rounded-full bg-brand-bg px-3 py-1.5 text-xs font-semibold text-brand-subtext">
                  {templates?.length ?? 0} saved
                </span>
                <span className="rounded-full bg-brand-bg px-3 py-1.5 text-xs font-semibold text-brand-subtext">
                  Ready for consultations
                </span>
              </>
            }
          />
        </SectionCard>

        <DataTable
          columns={columns}
          data={templates ?? []}
          loading={isLoading}
          emptyIcon={ClipboardList}
          emptyTitle="No templates yet"
          emptyDescription="Create your first reusable prescription template"
          storageKey="doctor-prescription-templates-table"
          searchPlaceholder="Search templates"
          savedViews={[{ id: "all", label: "All" }]}
          density="compact"
          emptyAction={
            <Button size="sm" onClick={() => setSheetOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Create template
            </Button>
          }
        />
      </div>

      <CreateTemplateSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onCreated={() => {
          setSheetOpen(false);
          queryClient.invalidateQueries({ queryKey: ["prescription-templates"] });
        }}
      />
    </DoctorShell>
  );
}

function CreateTemplateSheet({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [chiefComplaints, setChiefComplaints] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [advice, setAdvice] = useState("");
  const [items, setItems] = useState<RxItem[]>([
    { name: "", dosage: "", frequency: "", duration: "", instructions: "" },
  ]);
  const [saving, setSaving] = useState(false);

  function resetForm() {
    setName("");
    setChiefComplaints("");
    setDiagnosis("");
    setAdvice("");
    setItems([{ name: "", dosage: "", frequency: "", duration: "", instructions: "" }]);
  }

  function addItem() {
    setItems((prev) => [...prev, { name: "", dosage: "", frequency: "", duration: "", instructions: "" }]);
  }

  function updateItem(index: number, field: keyof RxItem, value: string) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    if (!name.trim()) {
      notifyError("Template name required", "Add a name before saving this template.");
      return;
    }
    setSaving(true);
    try {
      const validItems = items.filter((item) => item.name.trim());
      await api.post("/doctor/prescription-templates", {
        name: name.trim(),
        payload: {
          chief_complaints: chiefComplaints.trim() || undefined,
          diagnosis: diagnosis.trim() || undefined,
          advice: advice.trim() || undefined,
          items: validItems,
        },
      });
      notifySuccess("Template saved", "Your prescription template is ready to reuse.");
      resetForm();
      onCreated();
    } catch (error) {
      notifyApiError(error, "Couldn't save template");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(value) => {
        onOpenChange(value);
        if (!value) resetForm();
      }}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl" side="center">
        <SheetHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10">
              <ClipboardList className="h-4.5 w-4.5 text-brand" />
            </div>
            <div>
              <SheetTitle>New prescription template</SheetTitle>
              <SheetDescription>Reusable during consultations.</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="space-y-5 px-3 pb-4 sm:px-4">
          {/* Section: Basic info */}
          <div>
            <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-brand-subtext">
              Template details
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-semibold text-brand-dark">
                  Template name <span className="text-red-400">*</span>
                </label>
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Fever consultation"
                  className="h-9 text-sm"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-brand-dark">Chief complaints</label>
                <Input
                  value={chiefComplaints}
                  onChange={(event) => setChiefComplaints(event.target.value)}
                  placeholder="e.g. Fever, cough"
                  className="h-9 text-sm"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-brand-dark">Diagnosis</label>
                <Input
                  value={diagnosis}
                  onChange={(event) => setDiagnosis(event.target.value)}
                  placeholder="e.g. Viral fever"
                  className="h-9 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Section: Medicines */}
          <div>
            <div className="mb-2.5 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-subtext">
                Medicines
              </p>
              <Button variant="outline" size="xs" onClick={addItem} className="gap-1">
                <Plus className="h-3 w-3" /> Add medicine
              </Button>
            </div>
            <div className="space-y-2">
              {items.map((item, index) => (
                <div
                  key={index}
                  className="rounded-xl border border-brand/10 bg-brand-bg/30 px-3 py-3"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-brand-subtext/60">
                      Medicine {index + 1}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => removeItem(index)}
                      className="h-6 w-6 text-brand-subtext/40 hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      value={item.name}
                      onChange={(event) => updateItem(index, "name", event.target.value)}
                      placeholder="Medicine name"
                      className="h-8 text-xs sm:col-span-2"
                    />
                    <Input
                      value={item.dosage || ""}
                      onChange={(event) => updateItem(index, "dosage", event.target.value)}
                      placeholder="Dosage (e.g. 500mg)"
                      className="h-8 text-xs"
                    />
                    <Input
                      value={item.frequency || ""}
                      onChange={(event) => updateItem(index, "frequency", event.target.value)}
                      placeholder="Frequency (e.g. TDS)"
                      className="h-8 text-xs"
                    />
                    <Input
                      value={item.duration || ""}
                      onChange={(event) => updateItem(index, "duration", event.target.value)}
                      placeholder="Duration (e.g. 5 days)"
                      className="h-8 text-xs"
                    />
                    <Input
                      value={item.instructions || ""}
                      onChange={(event) => updateItem(index, "instructions", event.target.value)}
                      placeholder="Instructions (e.g. after food)"
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section: Advice */}
          <div>
            <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-brand-subtext">
              Advice / Notes
            </p>
            <Textarea
              value={advice}
              onChange={(event) => setAdvice(event.target.value)}
              rows={3}
              placeholder="General advice for the patient..."
              className="text-sm"
            />
          </div>
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={saving}>
            <Save className="h-4 w-4" />
            Save template
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
