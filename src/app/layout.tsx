import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import Providers from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "AquaLens",
  description: "Enables citizens to report freshwater conditions with photos, supports AI-assisted analysis, and provides experts tools to verify and monitor water quality.",
  robots: { index: false, follow: false },
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
