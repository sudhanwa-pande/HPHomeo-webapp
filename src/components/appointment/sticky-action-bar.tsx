"use client";

import { motion, AnimatePresence } from "framer-motion";
import { CreditCard, Loader2, Video, XCircle, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { canCancel, canJoinCall, canReschedule } from "@/lib/appointment-utils";
import type { PatientAppointment } from "@/types/patient";

interface StickyActionBarProps {
  appointment: PatientAppointment;
  onJoinCall?: () => void;
  onPay?: () => void;
  onCancel?: () => void;
  onReschedule?: () => void;
  isPaying?: boolean;
}

export function StickyActionBar({
  appointment,
  onJoinCall,
  onPay,
  onCancel,
  onReschedule,
  isPaying,
}: StickyActionBarProps) {
  const isMobile = useIsMobile();

  if (!isMobile) return null;

  const joinable = canJoinCall(appointment);
  const needsPay =
    appointment.status === "pending_payment" &&
    appointment.payment_choice === "pay_now";
  const cancellable = canCancel(appointment);
  const reschedulable = canReschedule(appointment);

  const hasActions = joinable || needsPay || cancellable || reschedulable;

  return (
    <AnimatePresence>
      {hasActions && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200/40 bg-white/90 px-4 pb-[env(safe-area-inset-bottom,8px)] pt-3 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] backdrop-blur-xl"
        >
          <div className="flex items-center gap-2">
            {/* Primary action */}
            {joinable && onJoinCall && (
              <Button
                onClick={onJoinCall}
                className="flex-1 gap-1.5 rounded-xl bg-emerald-600 shadow-sm shadow-emerald-600/15 hover:bg-emerald-700"
              >
                <Video className="h-4 w-4" />
                Join Call
              </Button>
            )}

            {needsPay && onPay && (
              <Button
                onClick={onPay}
                disabled={isPaying}
                className="flex-1 gap-1.5 rounded-xl bg-brand shadow-sm shadow-brand/15 hover:bg-brand/90"
              >
                {isPaying ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CreditCard className="h-4 w-4" />
                )}
                Complete Payment
              </Button>
            )}

            {/* Secondary actions */}
            {reschedulable && onReschedule && (
              <Button
                variant="outline"
                onClick={onReschedule}
                className="gap-1.5 rounded-xl"
              >
                <CalendarClock className="h-4 w-4" />
                Reschedule
              </Button>
            )}

            {cancellable && onCancel && (
              <Button
                variant="outline"
                onClick={onCancel}
                className="gap-1.5 rounded-xl border-red-200 text-red-600 hover:bg-red-50"
              >
                <XCircle className="h-4 w-4" />
                Cancel
              </Button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
