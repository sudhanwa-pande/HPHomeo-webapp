"use client";

import { Calendar, CheckCircle2, Search, XCircle, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type TabType = "all" | "upcoming" | "completed" | "cancelled";

const TAB_CONFIG: Record<
  TabType,
  {
    icon: typeof Calendar;
    title: string;
    description: string;
    accent: string;
    showCTA: boolean;
  }
> = {
  all: {
    icon: Stethoscope,
    title: "Start your health journey",
    description:
      "Book your first appointment with a qualified homeopathic doctor. Choose from online or walk-in consultations.",
    accent: "from-brand/10 to-brand/5",
    showCTA: true,
  },
  upcoming: {
    icon: Calendar,
    title: "No upcoming appointments",
    description:
      "When you book a new consultation, it will appear here with live countdown and quick actions.",
    accent: "from-brand/8 to-blue-50/50",
    showCTA: true,
  },
  completed: {
    icon: CheckCircle2,
    title: "No completed consultations yet",
    description:
      "After your first appointment is done, you'll find your prescriptions, receipts, and review options here.",
    accent: "from-emerald-50/80 to-emerald-50/30",
    showCTA: false,
  },
  cancelled: {
    icon: XCircle,
    title: "No cancelled appointments",
    description: "Great news — all your appointments are on track!",
    accent: "from-gray-50/80 to-gray-50/30",
    showCTA: false,
  },
};

interface AppointmentEmptyStateProps {
  tab: TabType;
  onFindDoctor?: () => void;
  className?: string;
}

export function AppointmentEmptyState({
  tab,
  onFindDoctor,
  className,
}: AppointmentEmptyStateProps) {
  const config = TAB_CONFIG[tab];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-2xl border border-dashed border-gray-200/60 px-6 py-16 text-center",
        `bg-gradient-to-b ${config.accent}`,
        className,
      )}
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
        <Icon className="h-6 w-6 text-gray-400" />
      </div>
      <p className="text-sm font-semibold text-gray-800">{config.title}</p>
      <p className="mt-2 max-w-sm text-xs leading-5 text-gray-500">
        {config.description}
      </p>
      {config.showCTA && onFindDoctor && (
        <Button
          size="sm"
          onClick={onFindDoctor}
          className="mt-5 gap-1.5 rounded-xl bg-brand px-5 shadow-sm shadow-brand/15 hover:bg-brand/90"
        >
          <Search className="h-3.5 w-3.5" />
          Find a Doctor
        </Button>
      )}
    </div>
  );
}
