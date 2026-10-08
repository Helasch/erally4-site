import Link from "next/link";
import type { ReactNode } from "react";

// En-tête sombre des pages intérieures : fil d'Ariane, titre, filigrane « eRally4 »
export default function PageHeader({
  title,
  subtitle,
  crumbs = [],
  children,
  visual,
}: {
  title: string;
  subtitle?: string;
  crumbs?: { href: string; label: string }[];
  children?: ReactNode;
  /** Illustration à droite du bandeau (ex. la voiture du pilote) */
  visual?: ReactNode;
}) {
  return (
    <section className={`page-head ${visual ? "has-visual" : ""}`}>
      {visual}
      <div className="page-head-inner">
        <nav className="crumbs" aria-label="Fil d'Ariane">
          <Link href="/">Accueil</Link>
          {crumbs.map((c) => (
            <span key={c.href}>
              {" / "}
              <Link href={c.href}>{c.label}</Link>
            </span>
          ))}
          <span aria-current="page"> / {title}</span>
        </nav>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
        {children}
      </div>
    </section>
  );
}
