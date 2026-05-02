"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FloatingSaveBarProps {
  visible: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
}

export function FloatingSaveBar({
  visible,
  saving,
  onSave,
  onDiscard,
}: FloatingSaveBarProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2"
        >
          <div className="flex items-center gap-4 rounded-2xl border border-border/30 bg-white/95 px-5 py-3 shadow-2xl shadow-black/10 backdrop-blur-xl">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              </div>
              <span className="text-sm font-medium text-brand-dark whitespace-nowrap">
                Unsaved changes
              </span>
            </div>
            <div className="h-5 w-px bg-border/30" />
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={onDiscard}>
                <RotateCcw className="h-3.5 w-3.5" /> Discard
              </Button>
              <Button size="sm" onClick={onSave} loading={saving}>
                <Save className="h-3.5 w-3.5" /> Save changes
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
