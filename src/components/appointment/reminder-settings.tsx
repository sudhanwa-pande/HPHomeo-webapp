"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Bell, Mail, MessageSquare, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import api, { getApiError } from "@/lib/api";
import { notifySuccess, notifyError } from "@/lib/notify";
import { cn } from "@/lib/utils";

interface ReminderPreferences {
  email: boolean;
  whatsapp: boolean;
  timing: string[];
}

interface ReminderSettingsProps {
  appointmentId: string;
  initialPreferences?: ReminderPreferences | null;
  compact?: boolean;
  className?: string;
}

const TIMING_OPTIONS = [
  { value: "1h", label: "1 hour before" },
  { value: "1d", label: "1 day before" },
];

export function ReminderSettings({
  appointmentId,
  initialPreferences,
  compact = false,
  className,
}: ReminderSettingsProps) {
  const [email, setEmail] = useState(initialPreferences?.email ?? true);
  const [whatsapp, setWhatsapp] = useState(initialPreferences?.whatsapp ?? true);
  const [timing, setTiming] = useState<string[]>(
    initialPreferences?.timing ?? ["1h", "1d"],
  );
  const [hasChanges, setHasChanges] = useState(false);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await api.put(`/patient/appointments/${appointmentId}/reminders`, {
        email,
        whatsapp,
        timing,
      });
    },
    onSuccess: () => {
      notifySuccess("Reminders updated");
      setHasChanges(false);
    },
    onError: (error) => {
      notifyError("Couldn't update reminders", getApiError(error));
    },
  });

  const handleChange = (fn: () => void) => {
    fn();
    setHasChanges(true);
  };

  const toggleTiming = (value: string) => {
    handleChange(() => {
      setTiming((prev) =>
        prev.includes(value)
          ? prev.filter((t) => t !== value)
          : [...prev, value],
      );
    });
  };

  if (compact) {
    return (
      <div className={cn("flex items-center gap-3", className)}>
        <Bell className="h-4 w-4 text-gray-400" />
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleChange(() => setEmail(!email))}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all",
              email
                ? "border-brand/20 bg-brand/5 text-brand"
                : "border-gray-200 text-gray-400",
            )}
          >
            <Mail className="h-3 w-3" />
            Email
          </button>
          <button
            onClick={() => handleChange(() => setWhatsapp(!whatsapp))}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all",
              whatsapp
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-gray-200 text-gray-400",
            )}
          >
            <MessageSquare className="h-3 w-3" />
            WhatsApp
          </button>
        </div>
        {hasChanges && (
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="h-7 text-xs"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              "Save"
            )}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-2xl border border-gray-200/60 bg-white p-5",
        className,
      )}
    >
      <div className="flex items-center gap-2 mb-4">
        <Bell className="h-4 w-4 text-gray-500" />
        <h3 className="text-sm font-semibold text-gray-900">
          Appointment Reminders
        </h3>
      </div>

      {/* Channels */}
      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-xl bg-gray-50 p-3">
          <div className="flex items-center gap-2.5">
            <Mail className="h-4 w-4 text-gray-500" />
            <div>
              <p className="text-sm font-medium text-gray-900">Email</p>
              <p className="text-xs text-gray-500">Get reminded via email</p>
            </div>
          </div>
          <Switch
            checked={email}
            onCheckedChange={(checked) =>
              handleChange(() => setEmail(checked))
            }
          />
        </div>

        <div className="flex items-center justify-between rounded-xl bg-gray-50 p-3">
          <div className="flex items-center gap-2.5">
            <MessageSquare className="h-4 w-4 text-emerald-600" />
            <div>
              <p className="text-sm font-medium text-gray-900">WhatsApp</p>
              <p className="text-xs text-gray-500">
                Get reminded via WhatsApp
              </p>
            </div>
          </div>
          <Switch
            checked={whatsapp}
            onCheckedChange={(checked) =>
              handleChange(() => setWhatsapp(checked))
            }
          />
        </div>
      </div>

      {/* Timing */}
      <div className="mt-4">
        <p className="mb-2 text-xs font-semibold text-gray-500">When</p>
        <div className="flex gap-2">
          {TIMING_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => toggleTiming(opt.value)}
              className={cn(
                "flex-1 rounded-xl border-2 px-3 py-2.5 text-xs font-medium transition-all",
                timing.includes(opt.value)
                  ? "border-brand bg-brand/5 text-brand"
                  : "border-gray-200/60 text-gray-500 hover:border-brand/30",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Save */}
      {hasChanges && (
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="mt-4 w-full gap-1.5"
        >
          {saveMutation.isPending && (
            <Loader2 className="h-4 w-4 animate-spin" />
          )}
          Save Preferences
        </Button>
      )}
    </div>
  );
}
