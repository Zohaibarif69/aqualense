"use client";

import Link from "next/link";
import { btnLink } from "@/components/ui";

const Doc = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <article className="mx-auto max-w-3xl px-5 py-16"><h1 className="text-3xl font-bold text-navy">{title}</h1><div className="mt-6 space-y-4 text-[15px] text-ink [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-navy">{children}</div></article>
);
export function About() {
  return (
    <Doc title="About AquaLens">
      <p>AquaLens is an evidence and monitoring platform for freshwater environments. Citizens submit photos and observations; advisory AI screening highlights possible visual features; environmental models provide context; authorized experts review evidence.</p>
      <h2 id="methodology">Data and methodology</h2>
      <p>Monitoring sites and environmental indicators come from the AquaConnect / OneAquaHealth screening dashboard: 106 sites in Benevento, Coimbra, Ghent, Oslo and Toulouse. They combine a frozen background-pressure model with Open-Meteo weather forecasts and GloFAS v4 river-discharge context, and cover a seven-day window. They are screening signals for prioritising attention, not probabilities of ecological damage, algal blooms, fish mortality or pollutant concentrations, and the discharge is regional rather than the exact flow of the local stream. Citizen observations, photos, reviews and notifications shown in the demo are still illustrative.</p>
      <h2 id="help">Help and contact</h2>
      <p>Contact details will be provided by the operating organization. (Placeholder.)</p>
      <h2 id="accessibility">Accessibility statement</h2>
      <p>AquaLens targets WCAG 2.2 AA practices: keyboard navigation, visible focus, labeled forms, non-color status indicators, and list alternatives to the map.</p>
    </Doc>
  );
}
export const Privacy = () => <Doc title="Privacy"><p>Placeholder. The final privacy notice must match the backend data policy for photos, location, retention and deletion. Reporter identities are never shown in public views, and location can be submitted as approximate.</p></Doc>;
export const Terms = () => <Doc title="Terms of use"><p>Placeholder terms. Observations are community-submitted evidence and do not constitute official water-quality determinations.</p></Doc>;
export const NotFound = () => <div className="mx-auto max-w-md px-5 py-24 text-center"><p className="text-sm font-semibold text-primary">404</p><h1 className="mt-2 text-2xl font-bold text-navy">Page not found</h1><p className="mt-2 text-ink-2">The page you were looking for does not exist.</p><Link href="/app" className={btnLink() + " mt-6"}>Go to Overview</Link></div>;
