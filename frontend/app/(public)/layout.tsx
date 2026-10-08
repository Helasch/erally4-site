import type { ReactNode } from "react";
import Link from "next/link";
import Script from "next/script";
import { apiGet, formatDiff, formatTime, type Home } from "@/lib/api";
import { shortRallyName } from "@/lib/format";
import SiteNav from "./site-nav";
import "./site.css";

async function safe<T>(path: string): Promise<T | null> {
  try {
    return await apiGet<T>(path);
  } catch {
    return null;
  }
}

export default async function PublicLayout({ children }: { children: ReactNode }) {
  const umamiId = process.env.UMAMI_SITE_ID;
  const [home, settings] = await Promise.all([
    safe<Home>("/api/home"),
    safe<{ discord_url: string }>("/api/settings"),
  ]);
  const discordUrl = settings?.discord_url ?? "";
  const last = home?.last_rally;

  return (
    <div className="site">
      <SiteNav discordUrl={discordUrl} />

      {last && (
        <div className="ticker">
          <div className="ticker-inner">
            <span className="ticker-label">
              <span className="ticker-label-full">Dernier résultat · </span>
              {shortRallyName(last.name)}
            </span>
            <ol className="ticker-podium">
              {last.podium.map((p) => (
                <li key={p.position}>
                  <b>{p.position}</b> {p.name}{" "}
                  <span className="ticker-time">{p.position === 1 ? formatTime(p.time) : formatDiff(p.diff)}</span>
                </li>
              ))}
            </ol>
            <Link href="/classements" className="ticker-link">
              Voir les classements →
            </Link>
          </div>
        </div>
      )}

      <div className="site-main">{children}</div>

      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-about">
            <p className="footer-brand">eRally4 Cup</p>
            <p>
              Championnat virtuel de rallye sur EA SPORTS WRC.
              <br />
              Classements et résultats mis à jour après chaque manche.
            </p>
          </div>
          <nav className="footer-col" aria-label="Le championnat">
            <p className="footer-title">Le championnat</p>
            <Link href="/classements">Classements</Link>
            <Link href="/calendrier">Calendrier</Link>
            <Link href="/reglement">Règlement</Link>
          </nav>
          <nav className="footer-col" aria-label="Communauté">
            <p className="footer-title">Communauté</p>
            {discordUrl && (
              <a href={discordUrl} target="_blank" rel="noopener noreferrer">
                Discord
              </a>
            )}
            <Link href="/pilotes">Pilotes</Link>
            {discordUrl && (
              <a href={discordUrl} target="_blank" rel="noopener noreferrer">
                Contact
              </a>
            )}
          </nav>
        </div>
        <p className="footer-legal">
          eRally4 Cup est un championnat communautaire non officiel. Ce site n&apos;est affilié ni à la FIA WRC, ni à EA,
          ni à Codemasters. Résultats issus de RaceNet.
        </p>
      </footer>

      {umamiId && (
        <Script src="https://stats.devnest.fr/script.js" data-website-id={umamiId} strategy="afterInteractive" />
      )}
    </div>
  );
}
