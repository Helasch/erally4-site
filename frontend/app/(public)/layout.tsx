import type { ReactNode } from "react";
import Link from "next/link";
import Script from "next/script";

export default function PublicLayout({ children }: { children: ReactNode }) {
  const umamiId = process.env.UMAMI_SITE_ID;

  return (
    <>
      <header className="site-header">
        <Link href="/" className="logo" aria-label="eRally4 Cup — accueil">
          <span className="logo-erally">
            eRally<span className="logo-4">4</span>
          </span>
          <span className="logo-cup">CUP</span>
        </Link>
      </header>
      <div className="container">{children}</div>
      {umamiId && (
        <Script src="https://stats.devnest.fr/script.js" data-website-id={umamiId} strategy="afterInteractive" />
      )}
    </>
  );
}
