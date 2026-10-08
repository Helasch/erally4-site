"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const LINKS = [
  { href: "/", label: "Accueil" },
  { href: "/calendrier", label: "Calendrier" },
  { href: "/classements", label: "Classements" },
  { href: "/pilotes", label: "Pilotes" },
  { href: "/reglement", label: "Règlement" },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export default function SiteNav({ discordUrl }: { discordUrl: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Referme le menu mobile à chaque changement de page
  useEffect(() => setOpen(false), [pathname]);

  return (
    <header className={`nav ${open ? "nav-open" : ""}`}>
      <div className="nav-inner">
        <Link href="/" className="nav-logo" aria-label="eRally4 Cup — accueil">
          <Image src="/brand/logo-white.png" alt="eRally4 Cup" width={800} height={291} priority />
        </Link>

        <nav className="nav-links" aria-label="Navigation principale">
          {LINKS.map((l) => {
            const active = isActive(pathname, l.href);
            return (
              <Link key={l.href} href={l.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
                {l.label}
              </Link>
            );
          })}
          {discordUrl && (
            <a href={discordUrl} className="nav-cta nav-cta-mobile" target="_blank" rel="noopener noreferrer">
              Rejoindre le Discord
            </a>
          )}
        </nav>

        {discordUrl && (
          <a href={discordUrl} className="nav-cta" target="_blank" rel="noopener noreferrer">
            Rejoindre le Discord
          </a>
        )}

        <button
          className="nav-burger"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
        >
          <span />
          <span />
          <span />
        </button>
      </div>
    </header>
  );
}
