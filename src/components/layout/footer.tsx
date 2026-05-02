import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";

export function Footer({ hideCta = false }: { hideCta?: boolean }) {
  return (
    <footer className="bg-[#111]">
      {/* CTA area */}
      {!hideCta && (
        <div className="container-main pt-14 sm:pt-20 md:pt-24 pb-12 sm:pb-16 text-center">
          <h3 className="text-[clamp(1.4rem,3.5vw,2.5rem)] font-bold tracking-[-0.03em] text-white leading-[1.1]">
            Ready to get started?
          </h3>
          <p className="mt-3 text-[13.5px] sm:text-[15px] leading-relaxed text-white/40 max-w-md mx-auto">
            Book an appointment with our expert homeopaths and experience
            natural healthcare from home.
          </p>
          <Link
            href="/doctors"
            className="group mt-7 sm:mt-8 inline-flex items-center justify-center gap-2.5 rounded-2xl bg-brand-accent px-8 sm:px-9 py-3.5 sm:py-4 text-[14px] sm:text-[15px] font-semibold text-brand-dark shadow-[0_12px_40px_rgba(216,238,83,0.15)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_50px_rgba(216,238,83,0.25)]"
          >
            Book an Appointment
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
        </div>
      )}

      {/* Divider */}
      <div className="container-main">
        <div className="border-t border-white/[0.06]" />
      </div>

      {/* Main footer content */}
      <div className="container-main py-10 sm:py-14">
        {/* Logo + tagline */}
        <div className="mb-8 sm:mb-10">
          <Image
            src="/images/logo.png"
            alt="hpHomeo"
            width={120}
            height={40}
            className="h-7 sm:h-8 w-auto brightness-0 invert"
          />
          <p className="mt-3 max-w-xs text-[12px] sm:text-[13px] leading-relaxed text-white/35">
            Expert homeopathic healthcare, delivered digitally.
          </p>
        </div>

        {/* Link columns — 3 columns */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-8 sm:gap-12">
          {/* Quick Links */}
          <div>
            <h4 className="mb-4 text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.15em] text-white/25">
              Quick Links
            </h4>
            <div className="flex flex-col gap-2.5">
              {[
                { href: "/doctors", label: "Find Doctors" },
                { href: "/#how-it-works", label: "How It Works" },
                { href: "/patient/login", label: "Patient Login" },
                { href: "/doctor/login", label: "Doctor Login" },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-[12px] sm:text-[13px] text-white/40 transition-colors hover:text-white/80"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Legal */}
          <div>
            <h4 className="mb-4 text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.15em] text-white/25">
              Legal
            </h4>
            <div className="flex flex-col gap-2.5">
              <Link
                href="/privacy-policy"
                className="text-[12px] sm:text-[13px] text-white/40 transition-colors hover:text-white/80"
              >
                Privacy Policy
              </Link>
              <Link
                href="/terms-and-conditions"
                className="text-[12px] sm:text-[13px] text-white/40 transition-colors hover:text-white/80"
              >
                Terms &amp; Conditions
              </Link>
            </div>
          </div>

          {/* Contact */}
          <div className="col-span-2 sm:col-span-1">
            <h4 className="mb-4 text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.15em] text-white/25">
              Contact
            </h4>
            <div className="flex flex-col gap-2.5">
              <p className="text-[12px] sm:text-[13px] leading-[1.7] text-white/40">
                Hahnemann&apos;s Homoeo Pharmacy,
                <br />
                53 Boral Main Road, Garia
                <br />
                Kolkata 700084
              </p>
              <a
                href="mailto:support@hphomeo.com"
                className="text-[12px] sm:text-[13px] text-white/40 transition-colors hover:text-white/80"
              >
                support@hphomeo.com
              </a>
              <a
                href="tel:+919830661016"
                className="text-[12px] sm:text-[13px] text-white/40 transition-colors hover:text-white/80"
              >
                +91 9830661016
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Copyright bar */}
      <div className="container-main">
        <div className="flex flex-col items-center justify-between gap-2 border-t border-white/[0.06] py-6 sm:flex-row">
          <p className="text-[11px] sm:text-[12px] text-white/20">
            &copy; {new Date().getFullYear()} hpHomeo. All rights reserved.
          </p>
          <p className="text-[11px] sm:text-[12px] text-white/20">
            Made with care in Kolkata
          </p>
        </div>
      </div>
    </footer>
  );
}
