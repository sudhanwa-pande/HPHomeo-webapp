import Link from "next/link";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";

export default function NotFound() {
  return (
    <>
      <Navbar />
      <main className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <h1 className="type-display text-primary">404</h1>
        <p className="mt-4 type-lead text-muted-foreground">
          Page not found
        </p>
        <p className="mt-2 type-body text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/"
          className="type-label mt-8 rounded-lg bg-primary px-6 py-3 text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Back to Home
        </Link>
      </main>
      <Footer />
    </>
  );
}
