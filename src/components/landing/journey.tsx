"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";

const steps = [
  {
    num: 1,
    icon: "/images/icon-doctor.png",
    title: "Browse Doctors",
    desc: "Find the right practitioner for you.",
    highlight: false,
  },
  {
    num: 2,
    icon: "/images/icon-chat.png",
    title: "Book Consultation",
    desc: "Pick a time that works, and schedule an online consultation at your convenience.",
    highlight: true,
  },
  {
    num: 3,
    icon: "/images/icon-paper.png",
    title: "Get Prescription",
    desc: "Digital prescription delivered instantly.",
    highlight: false,
  },
  {
    num: 4,
    icon: "/images/icon-event.png",
    title: "Free Follow-Up",
    desc: "7 days of support after every visit.",
    highlight: false,
  },
];

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.15,
    },
  },
};

const cardVariants = {
  hidden: { opacity: 0, x: -30, scale: 0.95 },
  visible: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: {
      duration: 0.55,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  },
};

export function Journey() {
  const prefersReducedMotion = useReducedMotion();

  const fade = (delay: number) =>
    prefersReducedMotion
      ? {}
      : {
          initial: { opacity: 0, y: 16 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, margin: "-40px" },
          transition: { duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] as const },
        };

  return (
    <section id="how-it-works" className="py-16 sm:py-20 md:py-28">
      <div className="container-main">
        {/* Section header — centered */}
        <motion.div className="text-center max-w-xl mx-auto mb-12 sm:mb-16" {...fade(0)}>
          <span className="inline-flex items-center rounded-full border border-brand/15 bg-brand/[0.06] px-4 py-1.5 text-[11px] sm:text-[12px] font-semibold text-brand tracking-wide uppercase">
            How It Works
          </span>
          <h2 className="mt-5 text-[clamp(1.5rem,3.5vw,2.5rem)] font-bold leading-[1.1] tracking-[-0.03em] text-brand-dark">
            Your Healing Journey,{" "}
            <br className="hidden sm:block" />
            Step by Step
          </h2>
          <p className="mt-4 text-[14px] sm:text-[15px] leading-relaxed text-brand-subtext max-w-lg mx-auto">
            From finding the right doctor to your follow-up — every step is simple and seamless.
          </p>
        </motion.div>

        {/* Horizontal cards */}
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6"
          variants={prefersReducedMotion ? undefined : containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-60px" }}
        >
          {steps.map((step) => (
            <motion.div
              key={step.num}
              className={`group relative rounded-2xl border px-6 sm:px-7 py-10 sm:py-12 transition-all duration-300 hover:-translate-y-1 text-center flex flex-col items-center ${
                step.highlight
                  ? "bg-brand border-brand/30 shadow-[0_8px_30px_rgba(88,155,255,0.2)] hover:shadow-[0_12px_40px_rgba(88,155,255,0.3)]"
                  : "bg-white border-border/40 hover:border-brand/20 hover:shadow-[0_8px_30px_rgba(88,155,255,0.08)]"
              }`}
              variants={prefersReducedMotion ? undefined : cardVariants}
            >
              {/* Step number in circle */}
              <motion.div
                className={`flex items-center justify-center h-9 w-9 sm:h-10 sm:w-10 rounded-full text-[14px] sm:text-[15px] font-bold ${
                  step.highlight
                    ? "bg-white text-brand border-2 border-white"
                    : "border-2 border-brand text-brand"
                }`}
                whileHover={prefersReducedMotion ? {} : { scale: 1.15 }}
                transition={{ type: "spring", stiffness: 300, damping: 15 }}
              >
                {step.num}
              </motion.div>

              {/* Icon */}
              <motion.div
                whileHover={prefersReducedMotion ? {} : { scale: 1.12, rotate: -5 }}
                transition={{ type: "spring", stiffness: 300, damping: 15 }}
              >
                <Image
                  src={step.icon}
                  alt={step.title}
                  width={36}
                  height={36}
                  className={`mt-5 sm:w-11 sm:h-11 ${step.highlight ? "brightness-0 invert" : ""}`}
                  unoptimized
                />
              </motion.div>

              {/* Title */}
              <h3 className={`mt-6 text-[14px] sm:text-[15.5px] font-semibold tracking-[-0.01em] ${
                step.highlight ? "text-white" : "text-brand-dark"
              }`}>
                {step.title}
              </h3>

              {/* Description */}
              <p className={`mt-3 text-[12.5px] sm:text-[13.5px] leading-[1.6] ${
                step.highlight ? "text-white/80" : "text-brand-subtext"
              }`}>
                {step.desc}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
