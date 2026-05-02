import type { PatientAppointment } from "@/types/patient";

/* ── Date / Time formatting ── */

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateLong(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatShortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatSlotTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatDateLabel(date: Date) {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow";
  return date.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const target = new Date(iso).getTime();
  const diff = target - now;

  if (diff < 0) {
    const mins = Math.floor(Math.abs(diff) / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return formatShortDate(iso);
  }

  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `In ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `In ${hours}h`;
  const days = Math.floor(hours / 24);
  return `In ${days}d`;
}

/* ── Business logic ── */

export function canCancel(apt: PatientAppointment): boolean {
  if (apt.status !== "confirmed" && apt.status !== "pending_payment") return false;
  const hoursUntil =
    (new Date(apt.scheduled_at).getTime() - Date.now()) / 3600000;
  return hoursUntil > 2;
}

export function canReschedule(apt: PatientAppointment): boolean {
  if (apt.status !== "confirmed") return false;
  const hoursUntil =
    (new Date(apt.scheduled_at).getTime() - Date.now()) / 3600000;
  return hoursUntil > 2;
}

export function canJoinCall(apt: PatientAppointment): boolean {
  if (apt.mode !== "online" || !apt.video_enabled || apt.status !== "confirmed")
    return false;
  const now = Date.now();
  const scheduled = new Date(apt.scheduled_at).getTime();
  return now >= scheduled - 10 * 60 * 1000 && now <= scheduled + 30 * 60 * 1000;
}

export function isUpcoming(apt: PatientAppointment): boolean {
  return (
    new Date(apt.scheduled_at) > new Date() &&
    (apt.status === "confirmed" || apt.status === "pending_payment")
  );
}

export function getNextAppointment(
  appointments: PatientAppointment[],
): PatientAppointment | null {
  const upcoming = appointments
    .filter(
      (a) =>
        a.status === "confirmed" &&
        new Date(a.scheduled_at).getTime() > Date.now(),
    )
    .sort(
      (a, b) =>
        new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime(),
    );
  return upcoming[0] || null;
}

/* ── Slot grouping ── */

export interface SlotGroup {
  label: string;
  icon: "sunrise" | "sun" | "sunset";
  slots: string[];
}

export function groupSlotsByTimeOfDay(slots: string[]): SlotGroup[] {
  const morning: string[] = [];
  const afternoon: string[] = [];
  const evening: string[] = [];

  for (const slot of slots) {
    const hour = new Date(slot).getHours();
    if (hour < 12) morning.push(slot);
    else if (hour < 17) afternoon.push(slot);
    else evening.push(slot);
  }

  const groups: SlotGroup[] = [];
  if (morning.length > 0) groups.push({ label: "Morning", icon: "sunrise", slots: morning });
  if (afternoon.length > 0) groups.push({ label: "Afternoon", icon: "sun", slots: afternoon });
  if (evening.length > 0) groups.push({ label: "Evening", icon: "sunset", slots: evening });

  return groups;
}

/* ── Status config ── */

export const STATUS_STYLES: Record<
  string,
  { bg: string; text: string; label: string; dot: string; border: string }
> = {
  confirmed: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    label: "Confirmed",
    dot: "bg-emerald-500",
    border: "border-emerald-200",
  },
  pending_payment: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    label: "Pending Payment",
    dot: "bg-amber-500",
    border: "border-amber-200",
  },
  completed: {
    bg: "bg-blue-50",
    text: "text-blue-700",
    label: "Completed",
    dot: "bg-blue-500",
    border: "border-blue-200",
  },
  cancelled: {
    bg: "bg-red-50",
    text: "text-red-700",
    label: "Cancelled",
    dot: "bg-red-500",
    border: "border-red-200",
  },
  no_show: {
    bg: "bg-slate-100",
    text: "text-slate-600",
    label: "No Show",
    dot: "bg-slate-400",
    border: "border-slate-200",
  },
};

export const PAYMENT_LABELS: Record<string, string> = {
  paid: "Paid",
  pending: "Payment Pending",
  unpaid: "Pay at Clinic",
  transferred: "Transferred",
  refunded: "Refunded",
  failed: "Payment Failed",
};

export const REFUND_CONFIG: Record<
  string,
  { bg: string; text: string; border: string; label: string; desc: string; spinning?: boolean }
> = {
  pending: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
    label: "Refund Pending",
    desc: "Your refund is being initiated. Usually takes 1-2 business days.",
  },
  processing: {
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
    label: "Refund Processing",
    desc: "Your refund is being processed by the payment provider.",
    spinning: true,
  },
  processed: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
    label: "Refund Completed",
    desc: "Refund has been credited to your original payment method.",
  },
  failed: {
    bg: "bg-red-50",
    text: "text-red-700",
    border: "border-red-200",
    label: "Refund Failed",
    desc: "There was an issue processing your refund. Please contact the clinic.",
  },
};

/* ── Date option generators ── */

export function generateDateOptions(days: number): Date[] {
  const dates: Date[] = [];
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push(d);
  }
  return dates;
}
