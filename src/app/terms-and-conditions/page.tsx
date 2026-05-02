import type { Metadata } from "next";
import {
  FileText,
  Stethoscope,
  CalendarX,
  CreditCard,
  AlertTriangle,
  MessageCircle,
  Shield,
  Scale,
  Gavel,
  RefreshCw,
  Mail,
} from "lucide-react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";

export const metadata: Metadata = {
  title: "Terms & Conditions | hpHomeo",
};

const SECTIONS = [
  {
    icon: FileText,
    title: "1. Acceptance of Terms",
    content: (
      <p>
        By accessing or using the website hphomeo.com or any services offered by
        hpHomeo (hereinafter &ldquo;the Clinic&rdquo;), you agree to be bound by
        these Terms &amp; Conditions. If you do not agree, please do not use our
        services.
      </p>
    ),
  },
  {
    icon: Stethoscope,
    title: "2. Services Provided",
    content: (
      <>
        <p>
          hpHomeo provides homeopathic healthcare services including but not
          limited to:
        </p>
        <ul>
          <li>
            Online and in-person consultations with qualified homeopathic
            practitioners
          </li>
          <li>Appointment booking and scheduling</li>
          <li>Patient follow-ups via WhatsApp and email</li>
          <li>
            Health information and guidance through digital channels
          </li>
        </ul>
        <p>
          Our services are intended for informational and supportive healthcare
          purposes. They do not replace emergency medical care or treatment by a
          licensed allopathic physician.
        </p>
      </>
    ),
  },
  {
    icon: CalendarX,
    title: "3. Appointments & Cancellations",
    content: (
      <ul>
        <li>
          Appointments must be booked in advance through our website or WhatsApp
        </li>
        <li>
          Please provide at least 24 hours notice for cancellations or
          rescheduling
        </li>
        <li>No-shows without prior notice may incur a cancellation fee</li>
        <li>
          The Clinic reserves the right to reschedule appointments due to
          practitioner unavailability
        </li>
      </ul>
    ),
  },
  {
    icon: CreditCard,
    title: "4. Payments & Refunds",
    content: (
      <ul>
        <li>
          Consultation fees are payable at the time of booking or as specified
        </li>
        <li>
          Payments are processed securely through third-party payment gateways
        </li>
        <li>
          Refunds for prepaid consultations may be issued if cancelled with at
          least 24 hours notice
        </li>
        <li>No refunds will be issued for completed consultations</li>
        <li>
          In case of technical payment failure, contact us at
          support@hphomeo.com
        </li>
      </ul>
    ),
  },
  {
    icon: AlertTriangle,
    title: "5. Medical Disclaimer",
    content: (
      <>
        <p>
          The information and advice provided by hpHomeo practitioners is for
          general healthcare support and homeopathic treatment. It is:
        </p>
        <ul>
          <li>
            Not a substitute for professional medical diagnosis or emergency
            treatment
          </li>
          <li>
            Based on homeopathic principles which are complementary in nature
          </li>
          <li>Subject to individual response and results may vary</li>
        </ul>
        <p>
          Always seek immediate emergency care for serious or life-threatening
          conditions.
        </p>
      </>
    ),
  },
  {
    icon: MessageCircle,
    title: "6. WhatsApp Communication",
    content: (
      <>
        <p>By providing your WhatsApp number, you consent to receive:</p>
        <ul>
          <li>Appointment confirmations and reminders</li>
          <li>Follow-up messages from our healthcare team</li>
          <li>Service-related notifications</li>
        </ul>
        <p>
          You may opt out of WhatsApp communications at any time by notifying us
          at support@hphomeo.com.
        </p>
      </>
    ),
  },
  {
    icon: Shield,
    title: "7. Intellectual Property",
    content: (
      <p>
        All content on hphomeo.com including text, images, logos, and design is
        the intellectual property of hpHomeo. Reproduction or redistribution
        without written consent is strictly prohibited.
      </p>
    ),
  },
  {
    icon: Scale,
    title: "8. Limitation of Liability",
    content: (
      <p>
        To the maximum extent permitted by applicable law, hpHomeo shall not be
        liable for any indirect, incidental, or consequential damages arising
        from use of our services or website. Our total liability in any case
        shall not exceed the amount paid by you for the specific service in
        question.
      </p>
    ),
  },
  {
    icon: Gavel,
    title: "9. Governing Law",
    content: (
      <p>
        These Terms &amp; Conditions are governed by and construed in accordance
        with the laws of India. Any disputes arising shall be subject to the
        exclusive jurisdiction of the courts in India.
      </p>
    ),
  },
  {
    icon: RefreshCw,
    title: "10. Changes to Terms",
    content: (
      <p>
        We reserve the right to modify these Terms at any time. Updated terms
        will be posted on this page. Continued use of our services constitutes
        acceptance of any revised terms.
      </p>
    ),
  },
  {
    icon: Mail,
    title: "11. Contact",
    content: (
      <>
        <p>For questions regarding these Terms &amp; Conditions:</p>
        <p>
          <a
            href="mailto:support@hphomeo.com"
            className="font-medium text-brand underline decoration-brand/30 underline-offset-2 hover:decoration-brand"
          >
            support@hphomeo.com
          </a>
          <br />
          <a
            href="https://hphomeo.com"
            className="font-medium text-brand underline decoration-brand/30 underline-offset-2 hover:decoration-brand"
          >
            hphomeo.com
          </a>
        </p>
      </>
    ),
  },
];

export default function TermsAndConditions() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-brand-bg">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-border/30 bg-white">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--color-brand)/0.06,transparent_70%)]" />
          <div className="relative mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-20">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/10">
              <FileText className="h-7 w-7 text-brand" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Terms &amp; Conditions
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-base text-brand-subtext">
              Please read these terms carefully before using our services. By
              accessing hpHomeo, you agree to be bound by the following terms.
            </p>
            <p className="mt-4 text-xs text-brand-subtext/70">
              Last updated &mdash; March 2026
            </p>
          </div>
        </section>

        {/* Sections */}
        <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
          <div className="space-y-5">
            {SECTIONS.map((section) => {
              const Icon = section.icon;
              return (
                <article
                  key={section.title}
                  className="group rounded-2xl border border-border/40 bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-md sm:p-8"
                >
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/8 text-brand transition-colors group-hover:bg-brand/12">
                      <Icon className="h-[18px] w-[18px]" />
                    </div>
                    <h2 className="text-lg font-semibold text-gray-900">
                      {section.title}
                    </h2>
                  </div>
                  <div className="prose prose-sm max-w-none text-brand-ink-soft prose-p:leading-relaxed prose-ul:mt-2 prose-ul:space-y-1 prose-li:marker:text-brand/40">
                    {section.content}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
