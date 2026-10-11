import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { ThemeProvider } from "@/components/layout/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Plateforme DAF", template: "%s · Plateforme DAF" },
  description: "Pilotage financier, contrôle de gestion et accompagnement des dirigeants.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
