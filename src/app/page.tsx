import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { ClientOnly } from "@/components/client-only";
import { Hero } from "@/components/landing/hero";
import { WhyHomeopathy } from "@/components/landing/why-homeopathy";
import { Journey } from "@/components/landing/journey";
import { DoctorsPreview } from "@/components/landing/doctors-preview";
import { HealSection } from "@/components/landing/heal-section";

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <ClientOnly>
          <Hero />
          <WhyHomeopathy />
          <Journey />
          <DoctorsPreview />
          <HealSection />
        </ClientOnly>
      </main>
      <Footer />
    </>
  );
}
