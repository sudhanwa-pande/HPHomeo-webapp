"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { Check, Loader2, Phone, Shield, User } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";

import api, { getApiError } from "@/lib/api";
import { usePatientAuth } from "@/stores/patient-auth";
import { notifyError, notifySuccess } from "@/lib/notify";
import { AuthGuard } from "@/components/auth-guard";
import { PatientShell } from "@/components/patient/patient-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PatientProfileUpdate } from "@/types/patient";

const profileSchema = z.object({
  full_name: z.string().min(2, "Name must be at least 2 characters").max(100),
  email: z.union([z.string().email("Invalid email"), z.literal("")]).optional(),
  age: z.number().int().min(1, "Age must be at least 1").max(150, "Invalid age"),
  sex: z.enum(["male", "female", "other"], { message: "Please select your sex" }),
});

type ProfileForm = z.infer<typeof profileSchema>;

function ProfileContent() {
  const { patient, setPatient } = usePatientAuth();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      full_name: "",
      email: "",
      age: undefined,
      sex: undefined,
    },
  });

  const selectedSex = watch("sex");

  useEffect(() => {
    if (patient) {
      reset({
        full_name: patient.full_name || "",
        email: patient.email || "",
        age: patient.age || undefined,
        sex: (patient.sex as ProfileForm["sex"]) || undefined,
      });
    }
  }, [patient, reset]);

  const updateMutation = useMutation({
    mutationFn: async (data: PatientProfileUpdate) => {
      await api.patch("/patient/auth/profile", data);
      const { data: me } = await api.get("/patient/auth/me");
      return me;
    },
    onSuccess: (updatedPatient) => {
      setPatient(updatedPatient);
      notifySuccess("Profile updated", "Your information has been saved.");
    },
    onError: (error) => {
      notifyError("Couldn't update profile", getApiError(error));
    },
  });

  function onSubmit(data: ProfileForm) {
    const payload: PatientProfileUpdate = {
      full_name: data.full_name,
      email: data.email || undefined,
      age: data.age,
      sex: data.sex,
    };
    updateMutation.mutate(payload);
  }

  const initials =
    patient?.full_name
      ?.split(" ")
      .slice(0, 2)
      .map((n) => n[0])
      .join("")
      .toUpperCase() || "P";

  return (
    <PatientShell title="My Profile" subtitle="Manage your personal information">
      <div className="mx-auto max-w-xl space-y-4">
        {/* Avatar & Name */}
        <div className="flex items-center gap-4 rounded-xl border border-gray-200/60 bg-white p-5">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand text-lg font-bold text-white">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-base font-semibold text-gray-900">
              {patient?.full_name || "Patient"}
            </p>
            <p className="text-xs text-gray-500">{patient?.phone || ""}</p>
          </div>
        </div>

        {/* Phone - read only */}
        <div className="flex items-center gap-3 rounded-xl border border-gray-200/60 bg-white px-4 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50">
            <Phone className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-gray-400">Phone (verified)</p>
            <p className="text-sm font-medium text-gray-900">{patient?.phone || "—"}</p>
          </div>
          <div className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5">
            <Shield className="h-3 w-3 text-emerald-600" />
            <span className="text-[10px] font-medium text-emerald-700">Verified</span>
          </div>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="rounded-xl border border-gray-200/60 bg-white p-5"
        >
          <h2 className="mb-4 text-sm font-semibold text-gray-900">Personal Information</h2>

          <div className="space-y-4">
            <div>
              <Label htmlFor="full_name" className="text-xs">Full Name *</Label>
              <Input
                id="full_name"
                placeholder="Your full name"
                {...register("full_name")}
                className="mt-1.5"
              />
              {errors.full_name && (
                <p className="mt-1 text-xs text-red-500">{errors.full_name.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="email" className="text-xs">Email (optional)</Label>
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                {...register("email")}
                className="mt-1.5"
              />
              {errors.email && (
                <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="age" className="text-xs">Age *</Label>
              <Input
                id="age"
                type="number"
                inputMode="numeric"
                placeholder="Your age"
                {...register("age", { valueAsNumber: true })}
                className="mt-1.5 w-28"
                min={1}
                max={150}
              />
              {errors.age && (
                <p className="mt-1 text-xs text-red-500">{errors.age.message}</p>
              )}
            </div>

            <div>
              <Label className="text-xs">Sex *</Label>
              <div className="mt-1.5 flex gap-2">
                {(["male", "female", "other"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setValue("sex", option, { shouldDirty: true })}
                    className={`flex items-center gap-1.5 rounded-lg border-2 px-3.5 py-2 text-sm font-medium capitalize transition-all ${
                      selectedSex === option
                        ? "border-brand bg-brand/5 text-brand"
                        : "border-gray-200/60 text-gray-500 hover:border-gray-300"
                    }`}
                  >
                    {selectedSex === option && <Check className="h-3.5 w-3.5" />}
                    {option}
                  </button>
                ))}
              </div>
              {errors.sex && (
                <p className="mt-1 text-xs text-red-500">{errors.sex.message}</p>
              )}
            </div>
          </div>

          <div className="mt-5 flex justify-end border-t border-gray-100 pt-4">
            <Button
              type="submit"
              disabled={!isDirty || updateMutation.isPending}
              className="gap-1.5 bg-brand hover:bg-brand/90"
            >
              {updateMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </form>
      </div>
    </PatientShell>
  );
}

export default function PatientProfilePage() {
  return (
    <AuthGuard role="patient">
      <ProfileContent />
    </AuthGuard>
  );
}
