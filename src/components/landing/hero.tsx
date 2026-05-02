"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

export function Hero() {
  const prefersReducedMotion = useReducedMotion();

  const fade = (delay = 0) =>
    prefersReducedMotion
      ? {}
      : {
          initial: { opacity: 0, y: 14 },
          animate: { opacity: 1, y: 0 },
          transition: {
            duration: 0.4,
            delay,
            ease: [0.22, 1, 0.36, 1] as const,
          },
        };

  return (
    <section className="relative overflow-hidden pt-12 pb-10 sm:pt-16 sm:pb-14 md:pt-20 md:pb-16">
      {/* Background — subtle radial glow, not blobs */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-0 -translate-x-1/2 w-[900px] h-[500px] rounded-full bg-brand/[0.04] blur-[120px]" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand/10 to-transparent" />
      </div>

      <div className="container-main">
        {/* Changed max-w-3xl to max-w-5xl so the text has room to breathe on PC */}
        <div className="flex flex-col items-center text-center max-w-5xl mx-auto w-full">
          
          {/* ── Headline ── */}
          <motion.h1
            // Added lg:flex-nowrap and lg:whitespace-nowrap to strictly enforce one line on PC
            className="font-display text-[clamp(2.2rem,6.5vw,4.25rem)] font-bold leading-[1.1] tracking-[-0.01em] text-brand-dark flex flex-wrap lg:flex-nowrap lg:whitespace-nowrap items-center justify-center gap-x-2 sm:gap-x-3"
            {...(prefersReducedMotion
              ? {}
              : {
                  initial: { opacity: 0, y: 20, filter: "blur(6px)" },
                  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
                  transition: {
                    duration: 0.5,
                    ease: [0.22, 1, 0.36, 1] as const,
                  },
                })}
          >
            <span className="text-brand-accent">Heal</span>
            <span className="bg-gradient-to-r from-brand-accent to-brand bg-clip-text text-transparent">
              with
            </span>
            {/* Reduced gap from gap-2 sm:gap-4 to gap-1 sm:gap-2 to pull the icon closer */}
            <span className="inline-flex items-center gap-1 sm:gap-2 whitespace-nowrap">
              <span className="text-brand">Homeopathy</span>
              <Image
                src="/images/icons8-homeopathy-100.png"
                alt=""
                width={80} 
                height={80}
                className="h-[36px] w-[36px] sm:h-[48px] sm:w-[48px] md:h-[64px] md:w-[64px] lg:h-[72px] lg:w-[72px] object-contain"
                unoptimized
              />
            </span>
          </motion.h1>

          {/* ── Subtitle — one concise line ── */}
          <motion.p
            className="mt-8 sm:mt-10 text-[15px] sm:text-[16px] leading-relaxed text-brand-ink-soft max-w-[32rem]"
            {...(prefersReducedMotion
              ? {}
              : {
                  initial: { opacity: 0, y: 14, filter: "blur(3px)" },
                  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
                  transition: {
                    duration: 0.4,
                    delay: 0.1,
                    ease: [0.22, 1, 0.36, 1] as const,
                  },
                })}
          >
            Book online appointments with expert homeopathic doctors
            and receive digital prescriptions — from home.
          </motion.p>

          {/* ── Primary CTA ── */}
          <motion.div
            className="mt-10 sm:mt-14 flex flex-col items-center gap-3"
            {...(prefersReducedMotion
              ? {}
              : {
                  initial: { opacity: 0, y: 14, scale: 0.97 },
                  animate: { opacity: 1, y: 0, scale: 1 },
                  transition: {
                    duration: 0.4,
                    delay: 0.18,
                    ease: [0.22, 1, 0.36, 1] as const,
                  },
                })}
          >
            <Link
              href="/doctors"
              className="group inline-flex items-center justify-center gap-2.5 rounded-2xl bg-brand-accent px-9 sm:px-10 py-4 sm:py-[18px] text-[15px] sm:text-[16px] font-semibold text-brand-dark shadow-[0_8px_30px_rgba(216,238,83,0.25)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#d0e64b] hover:shadow-[0_16px_40px_rgba(216,238,83,0.3)]"
            >
              Book an Appointment
              <ArrowRight className="h-[18px] w-[18px] transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
            <Link
              href="/#how-it-works"
              className="text-[13.5px] font-medium text-brand-subtext hover:text-brand-dark transition-colors duration-200"
            >
              See how it works &darr;
            </Link>
          </motion.div>

          {/* ── Trust strip — compact, horizontal ── */}
          <motion.div
            className="mt-14 sm:mt-18 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12.5px] sm:text-[13px] text-brand-subtext"
            {...fade(0.25)}
          >
            {[
              { color: "bg-green-500", label: "Verified Doctors" },
              { color: "bg-emerald-500", label: "100% Natural" },
              { color: "bg-violet-500", label: "Digital Prescriptions" },
              { color: "bg-blue-500", label: "7-Day Follow-up" },
            ].map((badge, i) => (
              <motion.span
                key={badge.label}
                className="flex items-center gap-1.5"
                {...(prefersReducedMotion
                  ? {}
                  : {
                      initial: { opacity: 0, scale: 0.8 },
                      animate: { opacity: 1, scale: 1 },
                      transition: {
                        duration: 0.3,
                        delay: 0.3 + i * 0.05,
                        ease: [0.22, 1, 0.36, 1] as const,
                      },
                    })}
              >
                <motion.span
                  className={`h-1.5 w-1.5 rounded-full ${badge.color}`}
                  {...(prefersReducedMotion
                    ? {}
                    : {
                        animate: { scale: [1, 1.4, 1] },
                        transition: {
                          duration: 1.5,
                          repeat: Infinity,
                          delay: i * 0.2,
                          ease: "easeInOut",
                        },
                      })}
                />
                {badge.label}
              </motion.span>
            ))}
          </motion.div>
        </div>

        {/* ── Hero illustration — below content, fades out at bottom ── */}
        <motion.div
          className="relative mt-12 sm:mt-16 mx-auto max-w-4xl"
          {...(prefersReducedMotion
            ? {}
            : {
                initial: { opacity: 0, y: 24, scale: 0.97 },
                animate: { opacity: 1, y: 0, scale: 1 },
                transition: {
                  duration: 0.6,
                  delay: 0.3,
                  ease: [0.22, 1, 0.36, 1] as const,
                },
              })}
        >
          {/* Soft glow behind the image */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[70%] rounded-full bg-brand/[0.06] blur-[80px] -z-10" />

          {/* Image with bottom fade mask */}
          <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-border/30 shadow-[0_20px_60px_rgba(0,0,0,0.08)]">
            <Image
              src="/images/hero-illustration.png"
              alt="Online Consultation Illustration"
              width={1120}
              height={900}
              sizes="(min-width: 1024px) 56vw, (min-width: 640px) 80vw, 95vw"
              className="w-full"
              priority
              unoptimized
            />
            {/* Bottom fade — blends image into the white page */}
            <div className="absolute inset-x-0 bottom-0 h-24 sm:h-32 bg-gradient-to-t from-white via-white/80 to-transparent pointer-events-none" />
          </div>
        </motion.div>
      </div>
    </section>
  );
}