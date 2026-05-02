"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parseISO } from "date-fns";
import { BellRing, CalendarClock, CalendarX2, RefreshCcw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import api from "@/lib/api";
import { notifyApiError, notifyError, notifyInfo, notifySuccess } from "@/lib/notify";
import type { DoctorNotification } from "@/types/doctor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type NotificationCategory = "booked" | "cancelled" | "rescheduled";

interface NotificationItem extends DoctorNotification {
  category: NotificationCategory;
  unread: boolean;
}

const STORAGE_KEY = "doctor-notification-read-state";

function deriveCategory(item: DoctorNotification): NotificationCategory {
  if (item.type === "cancelled") return "cancelled";
  if (item.type === "rescheduled") return "rescheduled";
  return "booked";
}

function notificationVisual(category: NotificationCategory) {
  if (category === "cancelled") {
    return {
      icon: CalendarX2,
      bgColor: "bg-red-500/10",
      iconColor: "text-red-500",
    };
  }

  if (category === "rescheduled") {
    return {
      icon: RefreshCcw,
      bgColor: "bg-orange-400/10",
      iconColor: "text-orange-500",
    };
  }

  return {
    icon: CalendarClock,
    bgColor: "bg-brand-accent/25",
    iconColor: "text-brand-dark",
  };
}

function readReadState() {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set<string>();
    return new Set<string>(JSON.parse(raw) as string[]);
  } catch {
    return new Set<string>();
  }
}

function persistReadState(ids: Set<string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(ids)));
}

function clearReadState() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

function formatNotificationTime(item: NotificationItem) {
  const source = item.scheduled_at ?? item.event_at;
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(parseISO(source));
}

function formatNotificationDate(item: NotificationItem) {
  const source = item.scheduled_at ?? item.event_at;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
  }).format(parseISO(source));
}

export function DoctorNotifications() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(() => readReadState());
  const seenToastIds = useRef<Set<string>>(new Set());
  const initialized = useRef(false);

  const { data } = useQuery({
    queryKey: ["doctor-notifications"],
    queryFn: async () => {
      const response = await api.get<{ items: DoctorNotification[] }>("/doctor/notifications");
      return response.data.items;
    },
    // SSE via DoctorShell pushes instant invalidation; 60s poll as safety net
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!data) return;

    if (!initialized.current) {
      data.forEach((item) => seenToastIds.current.add(item.id));
      initialized.current = true;
      return;
    }

    const fresh = data.filter((item) => !seenToastIds.current.has(item.id));
    fresh.forEach((item) => {
      const timeLabel = item.scheduled_at
        ? new Intl.DateTimeFormat("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          }).format(parseISO(item.scheduled_at))
        : "";
      const description = `${item.patient_name}${timeLabel ? ` at ${timeLabel}` : ""}`;

      if (item.type === "booked") {
        notifySuccess(item.title, description);
      } else if (item.type === "cancelled") {
        notifyError(item.title, description);
      } else {
        notifyInfo(item.title, description);
      }

      seenToastIds.current.add(item.id);
    });
  }, [data]);

  const items = useMemo<NotificationItem[]>(
    () =>
      (data ?? []).map((item) => ({
        ...item,
        category: deriveCategory(item),
        unread: !readIds.has(item.id),
      })),
    [data, readIds]
  );

  const unreadCount = items.filter((item) => item.unread).length;
  const visibleItems = items.slice(0, 6);

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await api.post("/doctor/notifications/mark-all-read");
    },
    onSuccess: () => {
      setReadIds(new Set());
      clearReadState();
      queryClient.setQueryData<DoctorNotification[]>(["doctor-notifications"], []);
      queryClient.invalidateQueries({ queryKey: ["doctor-notifications"] });
      setOpen(false);
    },
    onError: (error) => {
      notifyApiError(error, "Couldn't clear notifications");
    },
  });

  function markRead(ids: string[]) {
    setReadIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      persistReadState(next);
      return next;
    });
  }

  function handleOpenItem(item: NotificationItem) {
    markRead([item.id]);
    setOpen(false);
    router.push(`/doctor/appointments?focus=${item.appointment_id}`);
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        aria-label="Notifications"
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-brand-accent/40 bg-brand-accent text-brand-dark shadow-sm transition-all hover:brightness-95 data-[popup-open]:scale-[0.98]"
      >
        <BellRing className="h-4 w-4" />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-brand-dark px-1 text-[10px] font-bold text-white shadow-sm">
            {Math.min(unreadCount, 9)}
            {unreadCount > 9 ? "+" : ""}
          </span>
        ) : null}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={10}
        className="w-[min(92vw,24rem)] rounded-2xl p-0 shadow-[0_24px_60px_rgba(15,23,42,0.18)]"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center justify-between px-4 py-4">
            <div>
              <p className="text-sm font-semibold text-popover-foreground">Notifications</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {unreadCount > 0 ? `${unreadCount} new updates` : "All caught up"}
              </p>
            </div>
            <Badge className="rounded-full bg-brand-accent/25 px-2.5 py-1 font-normal text-brand-dark hover:bg-brand-accent/25">
              {unreadCount > 0 ? `${unreadCount} New` : `${items.length} Total`}
            </Badge>
          </DropdownMenuLabel>

          <div className="max-h-[min(62vh,24rem)] overflow-y-auto px-1.5 pb-1">
            {visibleItems.length === 0 ? (
              <div className="px-3 pb-3 pt-2">
                <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 px-4 py-10 text-center">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-background shadow-sm">
                    <BellRing className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">No notifications right now</p>
                </div>
              </div>
            ) : (
              visibleItems.map((item) => {
                const visual = notificationVisual(item.category);
                const Icon = visual.icon;

                return (
                  <DropdownMenuItem
                    key={item.id}
                    onClick={() => handleOpenItem(item)}
                    className={cn(
                      "mx-1.5 my-1.5 flex items-center justify-between gap-3 rounded-2xl border bg-white p-3",
                      "cursor-pointer border-border/40 focus:bg-brand-accent/10",
                      item.unread && "border-brand-accent/30 bg-brand-accent/10"
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", visual.bgColor)}>
                        <Icon className={cn("h-5 w-5", visual.iconColor)} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-popover-foreground">
                          {item.title}
                        </p>
                        <p className="max-w-[14rem] truncate text-sm text-muted-foreground">
                          {item.message || item.patient_name}
                        </p>
                        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span>{formatNotificationDate(item)}</span>
                          {item.unread ? <span className="h-1.5 w-1.5 rounded-full bg-brand-accent" /> : null}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-xs text-muted-foreground">{formatNotificationTime(item)}</p>
                    </div>
                  </DropdownMenuItem>
                );
              })
            )}
          </div>

          <div className="px-3 pb-3 pt-2">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-9 flex-1 rounded-xl border-brand-accent/35 bg-brand-accent/10 text-brand-dark hover:bg-brand-accent/20"
                disabled={items.length === 0 || markAllReadMutation.isPending}
                loading={markAllReadMutation.isPending}
                onClick={() => markAllReadMutation.mutate()}
              >
                Mark all read
              </Button>
              <Button
                className="h-9 flex-1 rounded-xl bg-brand-accent text-brand-dark hover:bg-brand-accent/90"
                onClick={() => {
                  setOpen(false);
                  router.push("/doctor/appointments");
                }}
              >
                See All Notifications
              </Button>
            </div>
          </div>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
