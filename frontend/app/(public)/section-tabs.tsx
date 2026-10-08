"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

// Barre d'onglets collante, comme « Rally Results / Championship Standings » sur wrc.com
export default function SectionTabs() {
  const pathname = usePathname();
  const saison = useSearchParams().get("saison");
  const query = saison ? `?saison=${saison}` : "";

  const tabs = [
    { href: "/classements", label: "Classement", active: pathname.startsWith("/classements") },
    { href: "/calendrier", label: "Rallyes", active: pathname.startsWith("/calendrier") || pathname.startsWith("/rallyes") },
  ];

  return (
    <nav className="section-tabs" aria-label="Sections">
      <div className="section-tabs-inner">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href + query} className={t.active ? "active" : ""} aria-current={t.active ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
