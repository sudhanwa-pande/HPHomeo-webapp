import type { Metadata } from "next";
import { DM_Sans, Lora } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { ErrorBoundary } from "@/components/error-boundary";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["400", "500", "600"],
});

const lora = Lora({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "hpHomeo - Heal with Homeopathy",
    template: "%s | hpHomeo",
  },
  description:
    "Book appointments with trusted homeopathic doctors. Consult online or in-person, anytime, anywhere.",
  keywords: [
    "homeopathy",
    "homeopathic doctor",
    "online consultation",
    "book appointment",
    "hpHomeo",
  ],
  openGraph: {
    title: "hpHomeo - Heal with Homeopathy",
    description:
      "Book appointments with trusted homeopathic doctors. Consult online or in-person.",
    url: "https://hphomeo.com",
    siteName: "hpHomeo",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${dmSans.variable} ${lora.variable}`}>
      <body>
        <ErrorBoundary>
          <Providers>{children}</Providers>
        </ErrorBoundary>
      </body>
    </html>
  );
}
