import type { ReactNode } from "react";
import Link from "next/link";
import Script from "next/script";
import "./globals.css";

export const metadata = {
  title: "eRally4 Cup",
  description: "Championnat de rallye virtuel sur EA Sports WRC",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const umamiId = process.env.UMAMI_SITE_ID;

  return (
    <html lang="fr">
      <body>
        <header className="site-header">
          <div className="container">
            <Link href="/" className="brand">
              eRally<span>4</span> Cup
            </Link>
            <nav>
              <Link href="/">Classement</Link>
            </nav>
          </div>
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
