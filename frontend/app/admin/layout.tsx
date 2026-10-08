"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { adminApi, setCsrf } from "@/lib/admin-api";

type Me = { username: string; csrf: string };

// Icônes au trait, 20×20
const icons: Record<string, ReactNode> = {
  dashboard: <path d="M3 3h6v8H3zM11 3h6v5h-6zM11 10h6v7h-6zM3 13h6v4H3z" />,
  trophy: <path d="M6 3h8v4a4 4 0 0 1-8 0zM6 5H3v1a3 3 0 0 0 3 3M14 5h3v1a3 3 0 0 1-3 3M10 11v3M7 17h6M8 14h4v3H8z" />,
  upload: <path d="M10 13V3M6 7l4-4 4 4M3 13v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3" />,
  users: (
    <path d="M7 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 17v-1a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4v1M13 3.5a3 3 0 0 1 0 5.5M15 12a4 4 0 0 1 3 4v1" />
  ),
  external: <path d="M11 3h6v6M17 3l-8 8M14 12v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4" />,
  logout: <path d="M8 17H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4M13 14l4-4-4-4M17 10H8" />,
  menu: <path d="M3 5h14M3 10h14M3 15h14" />,
  settings: (
    <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM16 10l1.5-1-1.5-3-1.8.4a6 6 0 0 0-1.4-.8L12.5 4h-3l-.3 1.6a6 6 0 0 0-1.4.8L6 6 4.5 9 6 10l-1.5 1L6 14l1.8-.4a6 6 0 0 0 1.4.8L9.5 16h3l.3-1.6a6 6 0 0 0 1.4-.8L16 14l1.5-3z" />
  ),
};

function Icon({ name }: { name: keyof typeof icons }) {
  return (
    <svg
      className="icon"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {icons[name]}
    </svg>
  );
}

const NAV = [
  { href: "/admin", label: "Tableau de bord", icon: "dashboard", exact: true },
  { href: "/admin/championnats", label: "Championnats", icon: "trophy", match: ["/admin/championnats", "/admin/rallyes", "/admin/classement"] },
  { href: "/admin/import", label: "Importer un CSV", icon: "upload" },
  { href: "/admin/pilotes", label: "Pilotes", icon: "users" },
  { href: "/admin/parametres", label: "Paramètres", icon: "settings" },
] as const;

function isActive(pathname: string, item: (typeof NAV)[number]) {
  if ("exact" in item && item.exact) return pathname === item.href;
  const prefixes = "match" in item ? item.match : [item.href];
  return prefixes.some((p) => pathname.startsWith(p));
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === "/admin/login";
  const [me, setMe] = useState<Me | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (isLogin) return;
    adminApi
      .get<Me>("/me")
      .then((data) => {
        setCsrf(data.csrf);
        setMe(data);
      })
      .catch(() => router.replace("/admin/login"));
  }, [isLogin, router]);

  // Referme le menu mobile après chaque navigation
  useEffect(() => setMenuOpen(false), [pathname]);

  if (isLogin) return <div className="admin admin-login">{children}</div>;
  if (!me) return <div className="admin admin-loading">Chargement…</div>;

  async function logout() {
    await adminApi.post("/logout").catch(() => {});
    router.replace("/admin/login");
  }

  const current = NAV.find((item) => isActive(pathname, item));

  return (
    <div className={`admin admin-shell ${menuOpen ? "menu-open" : ""}`}>
      <aside className="sidebar">
        <Link href="/admin" className="sidebar-brand">
          <span className="logo-erally">
            eRally<span className="logo-4">4</span>
          </span>
          <span className="sidebar-brand-sub">Admin</span>
        </Link>

        <nav className="sidebar-nav" aria-label="Administration">
          {NAV.map((item) => {
            const active = isActive(pathname, item);
            return (
              <Link key={item.href} href={item.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
                <Icon name={item.icon} />
                {item.label}
              </Link>
            );
          })}
          <hr />
          <a href="/" target="_blank" rel="noopener">
            <Icon name="external" />
            Voir le site
          </a>
        </nav>

        <div className="sidebar-user">
          <span className="avatar" aria-hidden="true">
            {me.username.slice(0, 1).toUpperCase()}
          </span>
          <span className="sidebar-username" title={me.username}>
            {me.username}
          </span>
          <button className="icon-button" onClick={logout} title="Déconnexion" aria-label="Déconnexion">
            <Icon name="logout" />
          </button>
        </div>
      </aside>

      <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} />

      <div className="admin-main">
        <header className="topbar">
          <button className="icon-button menu-toggle" onClick={() => setMenuOpen(true)} aria-label="Ouvrir le menu">
            <Icon name="menu" />
          </button>
          <span className="topbar-title">{current?.label ?? "Administration"}</span>
        </header>
        <div className="admin-content">{children}</div>
      </div>
    </div>
  );
}
