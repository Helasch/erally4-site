import type { ReactNode } from "react";
import Link from "next/link";
import Script from "next/script";
import { Barlow, Barlow_Condensed } from "next/font/google";
import "./globals.css";

const display = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
  style: ["normal", "italic"],
  variable: "--font-display",
});

const body = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
});

export const metadata = {
  title: "eRally4 Cup",
  description: "Championnat de rallye virtuel sur EA Sports WRC",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const umamiId = process.env.UMAMI_SITE_ID;

  return (
    <html lang="fr" className={`${display.variable} ${body.variable}`}>
      <body>
        <header className="site-header">
          <nav className="site-nav">
            <Link href="/">Classement</Link>
          </nav>
          <Link href="/" className="logo" aria-label="eRally4 Cup — accueil">
            <span className="logo-erally">
              eRally<span className="logo-4">4</span>
            </span>
            <span className="logo-cup">CUP</span>
          </Link>
        </header>
        <div className="container">{children}</div>
        {umamiId && (
          <Script
            src="https://stats.devnest.fr/script.js"
            data-website-id={umamiId}
            strategy="afterInteractive"
          />
        )}
      </body>
    </html>
  );
}
