"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { fetchMe, pilotApi, type PilotAccount } from "@/lib/pilot-api";
import Avatar from "./avatar";

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

function AccountMenu({ me, onLogout }: { me: PilotAccount; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const name = me.site_name || me.discord_username;

  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  return (
    <div className="account-menu" ref={ref}>
      <button className="account-button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu">
        <Avatar name={name} url={me.avatar_url} size={34} />
        <span className="account-name">{name}</span>
      </button>
      {open && (
        <div className="account-dropdown" role="menu">
          <Link href="/mon-compte" role="menuitem" onClick={() => setOpen(false)}>
            Mon compte
          </Link>
          {me.driver_id !== null && (
            <Link href={`/pilotes/${me.driver_id}`} role="menuitem" onClick={() => setOpen(false)}>
              Mon profil pilote
            </Link>
          )}
          <button role="menuitem" onClick={onLogout}>
            Déconnexion
          </button>
        </div>
      )}
    </div>
  );
}

export default function SiteNav({ discordUrl }: { discordUrl: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState<PilotAccount | null | undefined>(undefined);

  // Referme le menu mobile à chaque changement de page
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    fetchMe()
      .then(setMe)
      .catch(() => setMe(null));
  }, [pathname]);

  async function logout() {
    await pilotApi.logout().catch(() => {});
    setMe(null);
    router.refresh();
  }

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
          {me === null && (
            <Link href={`/connexion?next=${encodeURIComponent(pathname)}`} className="nav-mobile-extra">
              Se connecter
            </Link>
          )}
          {me && (
            <>
              <Link href="/mon-compte" className="nav-mobile-extra">
                Mon compte
              </Link>
              <button className="nav-mobile-extra nav-mobile-logout" onClick={logout}>
                Déconnexion
              </button>
            </>
          )}
          {discordUrl && (
            <a href={discordUrl} className="nav-cta nav-cta-mobile" target="_blank" rel="noopener noreferrer">
              Rejoindre le Discord
            </a>
          )}
        </nav>

        <div className="nav-right">
          {discordUrl && (
            <a href={discordUrl} className="nav-cta" target="_blank" rel="noopener noreferrer">
              Rejoindre le Discord
            </a>
          )}
          {me === null && (
            <Link href={`/connexion?next=${encodeURIComponent(pathname)}`} className="nav-login">
              Se connecter
            </Link>
          )}
          {me && <AccountMenu me={me} onLogout={logout} />}
        </div>

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
