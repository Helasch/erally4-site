"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { adminApi, setCsrf } from "@/lib/admin-api";

type Me = { username: string; csrf: string };

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === "/admin/login";
  const [me, setMe] = useState<Me | null>(null);

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

  if (isLogin) return <div className="admin">{children}</div>;
  if (!me) return <p className="muted">Chargement…</p>;

  async function logout() {
    await adminApi.post("/logout").catch(() => {});
    router.replace("/admin/login");
  }

  return (
    <div className="admin">
      <div className="row" style={{ justifyContent: "space-between", margin: "16px 0" }}>
        <nav className="admin-nav">
          <Link href="/admin">Championnats</Link>
          <Link href="/admin/import">Importer un CSV</Link>
          <Link href="/admin/pilotes">Pilotes</Link>
        </nav>
        <span className="muted">
          {me.username} · <button className="link" onClick={logout}>Déconnexion</button>
        </span>
      </div>
      {children}
    </div>
  );
}
