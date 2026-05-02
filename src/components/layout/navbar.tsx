"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { Menu, X, ArrowRight } from "lucide-react";

const navLinks = [
  { href: "/doctors", label: "Find Doctors" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#why-us", label: "Why Us" },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 10);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const close = useCallback(() => setOpen(false), []);

  return (
    <header className="sticky top-0 z-50 w-full">
      {/* Spacer — keeps content below the floating pill */}
      <div className="h-14 sm:h-16 md:h-[68px]" />

      {/* Floating pill */}
      <nav
        className={`
          absolute top-3 sm:top-4 left-1/2 -translate-x-1/2
          w-[calc(100%-1.5rem)] sm:w-[calc(100%-2rem)] max-w-[820px]
          flex items-center justify-between
          h-12 sm:h-[52px]
          px-3 sm:px-4
          rounded-full
          transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]
          ${
            scrolled || open
              ? "bg-white/75 backdrop-blur-2xl border border-border/50 shadow-[0_4px_20px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.04)]"
              : "bg-white/40 backdrop-blur-md border border-white/60 shadow-[0_2px_8px_rgba(0,0,0,0.03)]"
          }
        `}
      >
        {/* Logo */}
        <Link href="/" className="flex shrink-0 items-center" onClick={close}>
          <Image
            src="/images/logo.png"
            alt="hpHomeo Logo"
            width={120}
            height={40}
            className="h-7 w-auto sm:h-8"
            priority
          />
        </Link>

        {/* Desktop nav links — centered */}
        <ul className="hidden md:flex items-center gap-0.5">
          {navLinks.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="px-3 py-1.5 rounded-full text-[13px] font-medium text-brand-ink-soft hover:text-brand-dark hover:bg-brand-dark/[0.04] transition-all duration-200"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>

        {/* Desktop right — Login pair + Get Started */}
        <div className="hidden md:flex items-center gap-2.5">
          <div className="flex items-center text-[13px] font-medium">
            <Link
              href="/patient/login"
              className="px-2.5 py-1.5 rounded-full text-brand-ink-soft hover:text-brand-dark transition-colors duration-200"
            >
              Patient
            </Link>
            <span className="text-border select-none" aria-hidden="true">/</span>
            <Link
              href="/doctor/login"
              className="px-2.5 py-1.5 rounded-full text-brand-ink-soft hover:text-brand-dark transition-colors duration-200"
            >
              Doctor
            </Link>
          </div>
          <Link
            href="/doctors"
            className="group inline-flex items-center gap-1.5 rounded-full bg-brand-accent text-brand-dark pl-4 pr-3 py-1.5 text-[13px] font-semibold hover:bg-[#d0e64b] transition-all duration-200"
          >
            Start Healing
            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          className="md:hidden flex h-9 w-9 items-center justify-center rounded-full hover:bg-brand-dark/[0.05] transition-colors"
          onClick={() => setOpen(!open)}
          aria-label="Toggle menu"
        >
          {open ? <X className="w-[18px] h-[18px]" /> : <Menu className="w-[18px] h-[18px]" />}
        </button>
      </nav>

      {/* Mobile overlay */}
      <div
        className={`
          fixed inset-0 z-40 md:hidden
          transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]
          ${open ? "visible opacity-100" : "invisible opacity-0 pointer-events-none"}
        `}
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-brand-dark/20 backdrop-blur-sm"
          onClick={close}
        />

        {/* Sheet */}
        <div
          className={`
            absolute top-3 left-1/2 -translate-x-1/2
            w-[calc(100%-1.5rem)]
            bg-white/95 backdrop-blur-2xl
            rounded-2xl border border-border/40
            shadow-[0_16px_48px_rgba(0,0,0,0.12)]
            transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]
            ${open ? "translate-y-0 scale-100" : "-translate-y-3 scale-[0.97]"}
          `}
        >
          {/* Sheet header */}
          <div className="flex items-center justify-between px-5 h-14 border-b border-border/30">
            <Link href="/" className="flex items-center" onClick={close}>
              <Image
                src="/images/logo.png"
                alt="hpHomeo Logo"
                width={120}
                height={40}
                className="h-7 w-auto"
                priority
              />
            </Link>
            <button
              className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-brand-bg transition-colors"
              onClick={close}
              aria-label="Close menu"
            >
              <X className="w-[18px] h-[18px]" />
            </button>
          </div>

          {/* Sheet links */}
          <div className="px-3 py-3 flex flex-col gap-0.5">
            {navLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="px-3 py-3 rounded-xl text-[15px] font-medium text-brand-ink-soft hover:bg-brand-bg active:bg-brand-bg transition-colors"
                onClick={close}
              >
                {item.label}
              </Link>
            ))}
          </div>

          {/* Sheet actions */}
          <div className="px-3 pb-4 pt-1 flex flex-col gap-2 border-t border-border/30 mx-3">
            <div className="flex gap-2 pt-3">
              <Link
                href="/patient/login"
                className="flex-1 rounded-xl border border-border/60 px-4 py-3 text-center text-[14px] font-semibold text-brand-ink-soft hover:bg-brand-bg transition-colors"
                onClick={close}
              >
                Patient login
              </Link>
              <Link
                href="/doctor/login"
                className="flex-1 rounded-xl border border-border/60 px-4 py-3 text-center text-[14px] font-semibold text-brand-ink-soft hover:bg-brand-bg transition-colors"
                onClick={close}
              >
                Doctor login
              </Link>
            </div>
            <Link
              href="/doctors"
              className="group flex items-center justify-center gap-2 rounded-xl bg-brand-accent text-brand-dark px-4 py-3 text-[14px] font-semibold active:bg-[#d0e64b] transition-colors"
              onClick={close}
            >
              Start Healing
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
