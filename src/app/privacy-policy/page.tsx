import type { Metadata } from "next";
import {
  ShieldCheck,
  UserCircle,
  Database,
  Scale,
  Share2,
  Clock,
  Lock,
  KeyRound,
  Cookie,
  RefreshCw,
  Mail,
} from "lucide-react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";

export const metadata: Metadata = {
  title: "Privacy Policy | hpHomeo",
};

const SECTIONS = [
  {
    icon: ShieldCheck,
    title: "1. Introduction",
    content: (
      <>
        <p>
          Welcome to hpHomeo (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or
          &ldquo;us&rdquo;). We are a homeopathic healthcare clinic based in
          India, committed to protecting the privacy and confidentiality of our
          patients and website visitors. This Privacy Policy explains how we
          collect, use, store, and protect your personal information when you use
          our website at hphomeo.com or communicate with us via WhatsApp or
          other digital channels.
        </p>
        <p>
          By using our services, you agree to the terms of this Privacy Policy.
          If you do not agree, please discontinue use of our services.
        </p>
      </>
    ),
  },
  {
    icon: UserCircle,
    title: "2. Information We Collect",
    content: (
      <>
        <h3>Personal Information</h3>
        <ul>
          <li>Full name, age, and gender</li>
          <li>Contact details: phone number and email address</li>
          <li>Physical address (for home consultation requests)</li>
          <li>
            Health and medical history provided during appointment booking or
            consultation
          </li>
        </ul>
        <h3>Communication Data</h3>
        <ul>
          <li>
            Messages exchanged via WhatsApp Business for appointment scheduling
            and follow-ups
          </li>
          <li>Emails sent to our support address</li>
          <li>
            Records of online consultations conducted via our platform
          </li>
        </ul>
        <h3>Payment Information</h3>
        <ul>
          <li>Transaction details for consultation fees and payments</li>
          <li>
            We do not store raw card numbers &mdash; payments are processed
            through secure third-party gateways
          </li>
        </ul>
        <h3>Technical Data</h3>
        <ul>
          <li>IP address, browser type, and device information</li>
          <li>
            Pages visited and time spent on our website (via analytics tools)
          </li>
        </ul>
      </>
    ),
  },
  {
    icon: Database,
    title: "3. How We Use Your Information",
    content: (
      <ul>
        <li>To schedule and manage patient appointments</li>
        <li>
          To conduct online consultations and provide homeopathic healthcare
          services
        </li>
        <li>
          To communicate with you via WhatsApp or email regarding your health
          queries
        </li>
        <li>To process payments for services rendered</li>
        <li>
          To maintain medical records as required under Indian healthcare
          regulations
        </li>
        <li>To improve our website and service quality</li>
        <li>
          To send appointment reminders and health-related updates (with your
          consent)
        </li>
      </ul>
    ),
  },
  {
    icon: Scale,
    title: "4. Legal Basis for Processing (DPDP Act, India)",
    content: (
      <>
        <p>
          We process your personal data in accordance with the Digital Personal
          Data Protection Act, 2023 (DPDP Act) of India. Our legal bases
          include:
        </p>
        <ul>
          <li>
            <strong>Consent:</strong> When you voluntarily provide your
            information to book an appointment or consult with us
          </li>
          <li>
            <strong>Legitimate Interest:</strong> To operate and improve our
            clinic services
          </li>
          <li>
            <strong>Legal Obligation:</strong> To comply with Indian healthcare
            and data protection laws
          </li>
        </ul>
      </>
    ),
  },
  {
    icon: Share2,
    title: "5. Data Sharing & Third Parties",
    content: (
      <>
        <p>
          We do not sell, rent, or trade your personal information. We may share
          data only with:
        </p>
        <ul>
          <li>
            Payment processors (e.g., Razorpay, PayU) to complete transactions
            securely
          </li>
          <li>WhatsApp Business API providers for communication services</li>
          <li>
            Cloud/hosting providers for data storage with appropriate data
            protection agreements
          </li>
          <li>Legal authorities if required by law or court order</li>
        </ul>
      </>
    ),
  },
  {
    icon: Clock,
    title: "6. Data Retention",
    content: (
      <p>
        We retain your personal and medical data for as long as necessary to
        provide services and comply with applicable Indian laws. Patient health
        records are retained for a minimum of 5 years as per standard medical
        practice guidelines. You may request deletion of non-medical personal
        data at any time (see Section 8).
      </p>
    ),
  },
  {
    icon: Lock,
    title: "7. Data Security",
    content: (
      <>
        <p>
          We implement appropriate technical and organizational measures to
          protect your data including:
        </p>
        <ul>
          <li>
            SSL/TLS encryption for all data transmitted via our website
          </li>
          <li>
            Restricted access to patient data on a need-to-know basis
          </li>
          <li>Secure storage of records with access controls</li>
        </ul>
        <p>
          While we take all reasonable precautions, no digital system is 100%
          secure. In the event of a data breach, we will notify affected users as
          required by applicable law.
        </p>
      </>
    ),
  },
  {
    icon: KeyRound,
    title: "8. Your Rights",
    content: (
      <>
        <p>Under Indian data protection law, you have the right to:</p>
        <ul>
          <li>Access the personal data we hold about you</li>
          <li>Correct inaccurate personal data</li>
          <li>
            Request deletion of your personal data (subject to legal retention
            requirements)
          </li>
          <li>
            Withdraw consent for marketing communications at any time
          </li>
          <li>
            Lodge a complaint with the relevant data protection authority
          </li>
        </ul>
        <p>
          To exercise any of these rights, contact us at{" "}
          <a
            href="mailto:support@hphomeo.com"
            className="font-medium text-brand underline decoration-brand/30 underline-offset-2 hover:decoration-brand"
          >
            support@hphomeo.com
          </a>
          .
        </p>
      </>
    ),
  },
  {
    icon: Cookie,
    title: "9. Cookies",
    content: (
      <p>
        Our website may use cookies to improve your browsing experience and
        gather analytics data. You can control cookie preferences through your
        browser settings. Disabling cookies may affect some website
        functionality.
      </p>
    ),
  },
  {
    icon: RefreshCw,
    title: "10. Changes to This Policy",
    content: (
      <p>
        We may update this Privacy Policy from time to time. Any changes will be
        posted on this page with an updated effective date. Continued use of our
        services after changes constitutes acceptance of the revised policy.
      </p>
    ),
  },
  {
    icon: Mail,
    title: "11. Contact",
    content: (
      <>
        <p>
          For any privacy-related questions or requests, please contact us at:
        </p>
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

export default function PrivacyPolicy() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-brand-bg">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-border/30 bg-white">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--color-brand)/0.06,transparent_70%)]" />
          <div className="relative mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-20">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/10">
              <ShieldCheck className="h-7 w-7 text-brand" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Privacy Policy
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-base text-brand-subtext">
              Your privacy matters to us. Learn how we collect, use, and protect
              your personal information when you use hpHomeo services.
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
                  <div className="prose prose-sm max-w-none text-brand-ink-soft prose-headings:mb-2 prose-headings:mt-5 prose-headings:text-sm prose-headings:font-semibold prose-headings:text-gray-800 first:prose-headings:mt-0 prose-p:leading-relaxed prose-ul:mt-2 prose-ul:space-y-1 prose-li:marker:text-brand/40">
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
