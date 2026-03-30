import type { Metadata } from "next";
import {
  CTASection,
  FAQSection,
  FeaturesSection,
  Footer,
  Header,
  HeroSection,
  InteractiveProductDemo,
  PricingSection,
  ProductGallery,
  TeamSection,
} from "@/components/landing";

export const metadata: Metadata = {
  title: "2Bot - No-Code Workflow Automation & Backend Builder",
  description:
    "Build powerful workflow automations with AI capabilities. Connect messaging APIs, automate backend processes, and scale your operations — all without writing code.",
  alternates: {
    canonical: "/",
  },
};

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <Header />
      <main>
        <HeroSection />
        <InteractiveProductDemo />
        <ProductGallery />
        <FeaturesSection />
        <PricingSection />
        <TeamSection />
        <FAQSection />
        <CTASection />
      </main>
      <Footer />
    </div>
  );
}
