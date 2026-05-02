"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";

const cards = [
  {
    icon: "/images/icon-leaf.png",
    title: "Treats Root Cause",
    desc: "Goes beyond symptom suppression by treating the underlying imbalances in your body.",
  },
  {
    icon: "/images/icon-capsule.png",
    title: "Zero Side Effects",
    desc: "Natural remedies with no side effects, making them safe for long-term use including children.",
  },
  {
    icon: "/images/icon-body.png",
    title: "Holistic Approach",
    desc: "Treats the whole person — mind, body and emotions — not just individual symptoms.",
  },
  {
    icon: "/images/icon-pregnancy.png",
    title: "Safe for Mother & Child",
    desc: "Gentle and safe during pregnancy and for infants, supporting natural healing at every stage.",
  },
];

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.12,
    },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 30, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.5,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  },
};

export function WhyHomeopathy() {
  const prefersReducedMotion = useReducedMotion();

  const fade = (delay: number) =>
    prefersReducedMotion
      ? {}
      : {
          initial: { opacity: 0, y: 20 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, margin: "-40px" },
          transition: { duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] as const },
        };

  return (
    <section id="why-us" className="py-16 sm:py-20 md:py-28 bg-brand-bg">
      <div className="container-main">
        {/* Section heading */}
        <motion.div className="text-center mb-12 sm:mb-16" {...fade(0)}>
          <span className="inline-flex items-center rounded-full border border-brand/15 bg-white px-4 py-1.5 text-[11px] sm:text-[12px] font-semibold text-brand tracking-wide uppercase">
            Why Homeopathy
          </span>
          <h2 className="mt-5 text-[clamp(1.5rem,3.5vw,2.5rem)] font-bold leading-[1.1] tracking-[-0.03em] text-brand-dark">
            Natural Healing That{" "}
            <span className="bg-gradient-to-r from-brand to-blue-500 bg-clip-text text-transparent">
              Actually Works
            </span>
          </h2>
          <p className="mt-4 text-[14px] sm:text-[15px] leading-relaxed text-brand-subtext max-w-lg mx-auto">
            Backed by 200+ years of practice — a system that treats the root cause, not just symptoms.
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
          {cards.map((card) => (
            <motion.div
              key={card.title}
              className="group relative rounded-2xl border border-border/40 bg-white px-6 sm:px-7 py-10 sm:py-12 transition-all duration-300 hover:border-brand/20 hover:shadow-[0_8px_30px_rgba(88,155,255,0.08)] hover:-translate-y-1 text-center flex flex-col items-center"
              variants={prefersReducedMotion ? undefined : cardVariants}
            >
              {/* Icon */}
              <motion.div
                whileHover={prefersReducedMotion ? {} : { scale: 1.15, rotate: 5 }}
                transition={{ type: "spring", stiffness: 300, damping: 15 }}
              >
                <Image
                  src={card.icon}
                  alt={card.title}
                  width={36}
                  height={36}
                  className="sm:w-11 sm:h-11"
                  unoptimized
                />
              </motion.div>

              {/* Title */}
              <h3 className="mt-6 text-[14px] sm:text-[15.5px] font-semibold tracking-[-0.01em] text-brand-dark">
                {card.title}
              </h3>

              {/* Description */}
              <p className="mt-3 text-[12.5px] sm:text-[13.5px] leading-[1.6] text-brand-subtext">
                {card.desc}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
