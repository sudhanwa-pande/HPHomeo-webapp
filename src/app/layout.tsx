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
  icons: {
    icon: [
      { url: "/favicon_io/favicon.ico" },
      { url: "/favicon_io/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon_io/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [
      { url: "/favicon_io/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  manifest: "/favicon_io/site.webmanifest",
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
