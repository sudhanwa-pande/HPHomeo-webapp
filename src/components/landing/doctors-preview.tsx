"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { ArrowRight } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import api from "@/lib/api";
import type { PublicDoctor } from "@/types/patient";

function getInitials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

function DoctorCard({ doc, index }: { doc: PublicDoctor; index: number }) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      {...(prefersReducedMotion
        ? {}
        : {
            initial: { opacity: 0, y: 20, scale: 0.97 },
            whileInView: { opacity: 1, y: 0, scale: 1 },
            viewport: { once: true, margin: "-30px" },
            transition: {
              duration: 0.45,
              delay: index * 0.06,
              ease: [0.22, 1, 0.36, 1] as const,
            },
          })}
    >
      <Link
        href="/doctors"
        className="group flex items-start gap-3.5 shrink-0 w-[280px] sm:w-[300px] rounded-xl sm:rounded-2xl border border-border/40 bg-white p-4 sm:p-5 transition-all duration-300 hover:border-border/70 hover:-translate-y-0.5 hover:shadow-[0_4px_20px_rgba(0,0,0,0.06)]"
      >
        {/* Avatar */}
        <div className="shrink-0 h-12 w-12 sm:h-14 sm:w-14 rounded-xl bg-brand-bg overflow-hidden flex items-center justify-center">
          {doc.profile_photo ? (
            <Image
              src={doc.profile_photo}
              alt={doc.full_name}
              width={80}
              height={80}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-base sm:text-lg font-bold text-brand/50">
              {getInitials(doc.full_name)}
            </span>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h3 className="text-[13.5px] sm:text-[14.5px] font-semibold tracking-[-0.01em] text-brand-dark truncate">
            {doc.full_name}
          </h3>
          {doc.registration_no && (
            <p className="mt-0.5 text-[10.5px] sm:text-[11px] font-medium text-brand-subtext/45 tracking-wide">
              Reg. {doc.registration_no}
            </p>
          )}

          {/* Meta */}
          <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11.5px] sm:text-[12px] text-brand-subtext">
            {doc.specialization && (
              <span className="truncate max-w-[140px]">{doc.specialization}</span>
            )}
            {doc.specialization && doc.experience_years != null && (
              <span className="text-border select-none" aria-hidden="true">&middot;</span>
            )}
            {doc.experience_years != null && (
              <span className="whitespace-nowrap">{doc.experience_years} yr{doc.experience_years !== 1 ? "s" : ""}</span>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

function SkeletonCard() {
  return (
    <div className="flex items-start gap-3.5 shrink-0 w-[280px] sm:w-[300px] rounded-xl sm:rounded-2xl border border-border/30 bg-white p-4 sm:p-5">
      <div className="shrink-0 h-12 w-12 sm:h-14 sm:w-14 rounded-xl animate-pulse bg-brand-bg" />
      <div className="flex-1 space-y-2.5 pt-0.5">
        <div className="h-4 w-28 animate-pulse rounded bg-brand-bg" />
        <div className="h-3 w-16 animate-pulse rounded bg-brand-bg" />
        <div className="h-3 w-36 animate-pulse rounded bg-brand-bg" />
      </div>
    </div>
  );
}

const SCROLL_THRESHOLD = 4;

export function DoctorsPreview() {
  const [doctors, setDoctors] = useState<PublicDoctor[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get<{ doctors: PublicDoctor[] }>(
          "/public/doctors",
          { params: { limit: "20" } }
        );
        if (!cancelled) setDoctors(data.doctors ?? []);
      } catch {
        /* silently fail */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loading && doctors.length === 0) return null;

  const useScroll = loading || doctors.length >= SCROLL_THRESHOLD;

  const sectionFade = prefersReducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 20 } as const,
        whileInView: { opacity: 1, y: 0 } as const,
        viewport: { once: true, margin: "-40px" } as const,
        transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
      };

  return (
    <section id="doctors" className="py-12 sm:py-16 md:py-20 bg-brand-bg">
      <div className="container-main">
        {/* Header */}
        <motion.div className="mb-8 sm:mb-10" {...sectionFade}>
          <span className="inline-flex items-center rounded-full border border-brand/15 bg-white px-3.5 py-1 text-[11px] sm:text-[12px] font-semibold text-brand tracking-wide">
            Our Doctors
          </span>
          <h2 className="mt-4 text-[clamp(1.4rem,3vw,2.25rem)] font-bold leading-[1.1] tracking-[-0.03em] text-brand-dark">
            Meet the Experts
          </h2>
        </motion.div>
      </div>

      {/* Cards — horizontal scroll for 4+, wrapped grid for 1-3 */}
      {useScroll ? (
        <div
          ref={scrollRef}
          className="flex items-center gap-3 sm:gap-4 overflow-x-auto scroll-smooth px-[max(1rem,calc((100vw-var(--container-max))/2+1rem))] pb-2 no-scrollbar"
          style={{ scrollbarWidth: "none" }}
        >
          {loading
            ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
            : doctors.map((doc, i) => <DoctorCard key={doc.doctor_id} doc={doc} index={i} />)
          }
          {/* View all — last item in scroll row */}
          {!loading && doctors.length > 0 && (
            <motion.div
              {...(prefersReducedMotion
                ? {}
                : {
                    initial: { opacity: 0, x: 10 },
                    whileInView: { opacity: 1, x: 0 },
                    viewport: { once: true },
                    transition: { duration: 0.4, delay: 0.3 },
                  })}
            >
              <Link
                href="/doctors"
                className="group hidden sm:inline-flex items-center gap-1.5 shrink-0 px-4 text-[13px] font-medium text-brand-subtext hover:text-brand-dark transition-colors duration-200 whitespace-nowrap"
              >
                View all
                <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
            </motion.div>
          )}
        </div>
      ) : (
        <div className="container-main">
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            {doctors.map((doc, i) => <DoctorCard key={doc.doctor_id} doc={doc} index={i} />)}

            {/* View all — sits inline after cards */}
            <Link
              href="/doctors"
              className="group hidden sm:inline-flex items-center gap-1.5 px-6 text-[13px] font-medium text-brand-subtext hover:text-brand-dark transition-colors duration-200"
            >
              View all doctors
              <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      )}

      {/* Mobile CTA */}
      <div className="container-main sm:hidden mt-6">
        <Link
          href="/doctors"
          className="group flex items-center justify-center gap-2 w-full rounded-xl bg-brand-dark text-white py-3.5 text-[14px] font-semibold transition-colors active:bg-brand-dark/80"
        >
          View All Doctors
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>
      </div>
    </section>
  );
}
