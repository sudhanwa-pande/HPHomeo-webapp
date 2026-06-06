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
    <section className="relative overflow-hidden pt-12 pb-10 sm:pt-16 sm:pb-14 md:pt-20 md:pb-16 bg-noise section-glow">
      {/* Background */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-0 -translate-x-1/2 w-[900px] h-[500px] rounded-full bg-brand/[0.04] blur-[120px]" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand/10 to-transparent" />
      </div>

      <div className="container-main px-4 sm:px-6">
        <div className="flex flex-col items-center text-center max-w-5xl mx-auto w-full">

          {/* ── Headline ── */}
          <motion.h1
            className="font-display font-bold leading-[1.1] tracking-[-0.01em] text-brand-dark text-center
                       text-[clamp(2.2rem,7vw,3.2rem)]
                       sm:text-[clamp(2.6rem,5.5vw,3.8rem)]
                       lg:text-[4.2rem]"
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
            <span className="text-[#D8EE53]">Heal</span>{" "}
            <span className="bg-gradient-to-r from-[#D8EE53] to-[#589BFF] bg-clip-text text-transparent">
              with
            </span>{" "}
            <span className="inline-flex flex-wrap items-center justify-center gap-2">
              <span className="text-[#589BFF]">Homeopathy</span>
              <Image
                src="/images/icons8-homeopathy-100.svg"
                alt=""
                width={80}
                height={80}
                className="
                  h-[24px] w-[24px]
                  sm:h-[32px] sm:w-[32px]
                  md:h-[44px] md:w-[44px]
                  lg:h-[64px] lg:w-[64px]
                  xl:h-[80px] xl:w-[80px]
                  object-contain align-middle
                "
                unoptimized
              />
            </span>
          </motion.h1>

          {/* ── Subtitle ── */}
          <motion.p
            className="mt-8 sm:mt-10 text-[14.5px] sm:text-[16px] leading-relaxed text-brand-ink-soft 
                       max-w-[26rem] sm:max-w-[30rem] px-2"
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

          {/* ── CTA ── */}
          <motion.div
            className="mt-8 sm:mt-12 flex flex-col items-center gap-3 w-full"
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
              className="group bg-[#D8EE53] hover:bg-[#C5DA40] shadow-[0_6px_18px_rgba(216,238,83,0.28)]
                         transition-all duration-300 inline-flex items-center justify-center gap-2.5 
                         rounded-2xl px-5 sm:px-8 py-3 sm:py-4 text-[14.5px] sm:text-[16px] font-semibold 
                         text-brand-dark hover:scale-[1.02] active:scale-[0.98]
                         w-full sm:w-auto"
            >
              Book an Appointment
              <ArrowRight className="h-[18px] w-[18px] transition-transform duration-300 group-hover:translate-x-1" />
            </Link>

            <Link
              href="/#how-it-works"
              className="text-[13px] font-medium text-brand-subtext hover:text-brand-dark transition-colors duration-200"
            >
              See how it works ↓
            </Link>
          </motion.div>

          {/* ── Social Proof ── */}
          <motion.div
            className="mt-5 sm:mt-6 text-[13px] sm:text-[14px] text-brand-subtext flex items-center justify-center gap-2"
            {...(prefersReducedMotion
              ? {}
              : {
                initial: { opacity: 0, y: 10 },
                animate: { opacity: 1, y: 0 },
                transition: {
                  duration: 0.4,
                  delay: 0.25,
                  ease: [0.22, 1, 0.36, 1] as const,
                },
              })}
          >
            <span className="h-2 w-2 rounded-full bg-green-500" />
            Trusted by{" "}
            <span className="font-semibold text-brand-dark">1,000+</span> patients
          </motion.div>

          {/* ── Trust badges ── */}
          <motion.div
            className="mt-8 sm:mt-12 grid grid-cols-2 sm:flex sm:flex-wrap justify-center 
                       gap-x-4 gap-y-2 text-[12.5px] sm:text-[13px] text-brand-subtext"
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
                className="flex items-center gap-1.5 justify-center"
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

        {/* ── Hero Image ── */}
        <motion.div
          className="relative mt-12 sm:mt-16 mx-auto max-w-4xl"
          {...(prefersReducedMotion
            ? {}
            : {
              initial: { opacity: 0, y: 24, scale: 0.97, rotate: -1.5 },
              animate: { opacity: 1, y: 0, scale: 1, rotate: 0 },
              transition: {
                duration: 0.6,
                delay: 0.3,
                ease: [0.22, 1, 0.36, 1] as const,
              },
            })}
        >
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 
                          w-[80%] h-[70%] rounded-full bg-brand/[0.06] blur-[80px] -z-10" />

          <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-border/30 
                          shadow-[0_20px_60px_rgba(0,0,0,0.08)]">
            <Image
              src="/images/hero-illustration.webp"
              alt="Online Consultation Illustration"
              width={1120}
              height={900}
              sizes="(min-width: 1024px) 56vw, (min-width: 640px) 80vw, 95vw"
              className="w-full"
              priority
              unoptimized
            />
            <div className="absolute inset-x-0 bottom-0 h-24 sm:h-32 
                            bg-gradient-to-t from-white via-white/80 to-transparent pointer-events-none" />
          </div>
        </motion.div>
      </div>
    </section>
  );
}