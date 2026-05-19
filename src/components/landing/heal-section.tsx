"use client";

import { Video, CreditCard, CalendarCheck, FileText, type LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

const features: { icon: LucideIcon; title: string; desc: string }[] = [
  {
    icon: Video,
    title: "Online Consultations",
    desc: "Connect with doctors from anywhere via video call.",
  },
  {
    icon: CreditCard,
    title: "Transparent Pricing",
    desc: "Affordable consultations, no hidden charges.",
  },
  {
    icon: CalendarCheck,
    title: "7-Day Follow-Up",
    desc: "Free support included after every visit.",
  },
  {
    icon: FileText,
    title: "Digital Prescriptions",
    desc: "Rx delivered instantly after consultation.",
  },
];

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  },
};

export function HealSection() {
  const prefersReducedMotion = useReducedMotion();

  const fade = (delay: number) =>
    prefersReducedMotion
      ? {}
      : {
          initial: { opacity: 0, y: 14 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, margin: "-40px" },
          transition: { duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] as const },
        };

  return (
    <section className="relative py-12 sm:py-16 md:py-20 bg-brand-dark text-white overflow-hidden bg-noise">
      {/* Background glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(88,155,255,0.08),transparent_60%)] pointer-events-none" />
      
      <div className="container-main relative z-10">
        {/* Header */}
        <motion.div className="max-w-xl mb-10 sm:mb-14" {...fade(0)}>
          <span className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-3.5 py-1 text-[11px] sm:text-[12px] font-semibold text-brand-accent tracking-wide">
            Why Choose Us
          </span>
          <h2 className="mt-4 text-[clamp(1.4rem,3vw,2.25rem)] font-bold leading-[1.1] text-white">
            Built for Modern Healthcare
          </h2>
          <p className="mt-3 text-[13.5px] sm:text-[14.5px] leading-relaxed text-white/70 max-w-md">
            Access expert homeopathic care digitally — from home, while travelling, or anywhere else.
          </p>
        </motion.div>

        {/* Features — single horizontal row */}
        <motion.div
          className="grid grid-cols-2 sm:grid-cols-4 gap-y-8 gap-x-6 sm:gap-x-8 lg:gap-x-12"
          variants={prefersReducedMotion ? undefined : containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-60px" }}
        >
          {features.map((f) => (
            <motion.div
              key={f.title}
              className="flex flex-col group"
              variants={prefersReducedMotion ? undefined : itemVariants}
            >
              <motion.div
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/10"
                whileHover={prefersReducedMotion ? {} : { scale: 1.2, rotate: -8 }}
                transition={{ type: "spring", stiffness: 300, damping: 15 }}
              >
                <f.icon className="h-[18px] w-[18px] text-brand-accent" strokeWidth={1.8} />
              </motion.div>
              <h3 className="mt-3 text-[13.5px] sm:text-[14.5px] font-semibold tracking-[-0.01em] text-white">
                {f.title}
              </h3>
              <p className="mt-1 text-[12px] sm:text-[13px] leading-[1.55] text-white/70">
                {f.desc}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
