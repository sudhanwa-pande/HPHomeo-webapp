import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function StickyMobileCTA() {
  return (
    <div className="sm:hidden fixed bottom-0 inset-x-0 z-50 bg-white/80 backdrop-blur-md border-t border-border/40 pb-[calc(env(safe-area-inset-bottom)+12px)] px-4 pt-3">
      <Link
        href="/doctors"
        className="group premium-button flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[15px] font-semibold text-brand-dark"
      >
        Book Consultation
        <ArrowRight className="h-[18px] w-[18px] transition-transform duration-300 group-hover:translate-x-1" />
      </Link>
    </div>
  );
}
