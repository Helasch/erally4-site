import Link from "next/link";
import type { ReactNode } from "react";
import { apiGet, type Championship } from "@/lib/api";
import { formatRallyDates, statusLabel } from "@/lib/format";
import PageHeader from "../page-header";

export const metadata = { title: "Règlement — eRally4 Cup" };
export const dynamic = "force-dynamic";

const UPDATED = "8 octobre 2026";

const ARTICLES = [
  { id: "objet", title: "Objet et organisation" },
  { id: "inscription", title: "Engagement et inscription" },
  { id: "vehicules", title: "Véhicules éligibles" },
  { id: "calendrier", title: "Calendrier de la saison" },
  { id: "format", title: "Format de chaque manche" },
  { id: "points", title: "Système de points" },
  { id: "general", title: "Classement général" },
  { id: "penalites", title: "Pénalités et sanctions" },
  { id: "reclamations", title: "Réclamations et litiges" },
  { id: "communication", title: "Communication et vie du championnat" },
  { id: "modification", title: "Modification du règlement" },
];

const ROUNDS = [
  { name: "Monte-Carlo", surface: "Asphalte, neige et glace" },
  { name: "Portugal", surface: "Gravel et asphalte" },
  { name: "Pologne", surface: "Gravel rapide" },
  { name: "Europe Centrale", surface: "Asphalte rapide" },
  { name: "Finlande", surface: "Gravel, sauts" },
  { name: "Océanie (finale)", surface: "Gravel vallonné" },
];

const VEHICLES = ["Ford Fiesta MK8 Rally4", "Opel Corsa Rally4", "Peugeot 208 Rally4", "Renault Clio Rally4"];

const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

const SANCTIONS = [
  {
    fault: "Participation en dehors de la fenêtre de la manche",
    sanction: "Non classé sur la manche, sauf accord préalable et motivé des organisateurs",
  },
  {
    fault: "Coupe de route ou sortie de piste manifestement volontaire, constatée en replay",
    sanction: "Pénalité de temps fixée par le commissaire, pouvant aller jusqu'au « non classé » sur la manche",
  },
  {
    fault: "Abandon ou déconnexion volontaire en cours de spéciale, sans motif technique avéré",
    sanction: "Non classé sur la manche (0 point)",
  },
  {
    fault: "Incident technique avéré (crash du jeu, perte de connexion documentée)",
    sanction: "Reprise possible sur décision des organisateurs, sur présentation d'une preuve (capture d'écran, replay)",
  },
  { fault: "Véhicule non conforme à l'article 3", sanction: "Non classé sur la manche" },
  {
    fault: "Comportement antisportif ou irrespectueux envers un pilote ou un organisateur",
    sanction: "Avertissement, puis exclusion du championnat en cas de récidive",
  },
];

function Article({ n, children }: { n: number; children: ReactNode }) {
  const { id, title } = ARTICLES[n - 1];
  return (
    <article id={id} className="rule">
      <h2>
        <span className="rule-num">Art. {n}</span>
        {title}
      </h2>
      {children}
    </article>
  );
}

function Channel({ children }: { children: ReactNode }) {
  return <span className="channel">{children}</span>;
}

async function loadCalendar(): Promise<Championship | null> {
  try {
    return await apiGet<Championship | null>("/api/championship/current");
  } catch {
    return null;
  }
}

export default async function ReglementPage() {
  const championship = await loadCalendar();
  const rallies = championship?.rallies ?? [];

  return (
    <>
      <PageHeader
        title="Règlement sportif"
        subtitle="Saison 1 · Championnat virtuel Rally4 sur EA SPORTS WRC"
      />

      <section className="band band-grey">
        <div className="band-inner rules-layout">
          <nav className="rules-toc" aria-label="Sommaire du règlement">
            <p className="rules-toc-title">Sommaire</p>
            <ol>
              {ARTICLES.map((a, i) => (
                <li key={a.id}>
                  <a href={`#${a.id}`}>
                    <span>{i + 1}</span> {a.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="rules">
            <Article n={1}>
              <p>
                L&apos;eRally4 Cup est un championnat virtuel organisé sur EA SPORTS WRC, librement inspiré du format et
                de l&apos;esprit sportif de la Stellantis Motorsport Rally Cup (SMRC4). Il a pour objectif d&apos;offrir à
                des pilotes de tous niveaux un cadre structuré, équitable et exigeant pour s&apos;affronter en Rally4,
                dans un esprit professionnel mais convivial.
              </p>
              <p>
                Le championnat est organisé par les fondateurs de l&apos;eRally4 Cup, qui assurent la création et
                l&apos;administration du club en jeu, la tenue des classements, la communication officielle et
                l&apos;arbitrage des litiges.
              </p>
            </Article>

            <Article n={2}>
              <p>La participation à l&apos;eRally4 Cup est ouverte à tout pilote possédant :</p>
              <ul className="checklist">
                <li>une copie légale d&apos;EA SPORTS WRC (PC, PlayStation ou Xbox — le cross-platform est activé) ;</li>
                <li>un compte EA RaceNet actif ;</li>
                <li>un compte Discord.</li>
              </ul>
              <p>
                L&apos;inscription se fait en prenant le rôle <strong>Pilote inscrit</strong> dans le salon des rôles du
                serveur Discord, avant le début de la première manche. Une inscription en cours de saison reste
                possible, mais ne permet pas de rattraper les manches déjà disputées.
              </p>
              <p>
                En prenant ce rôle, chaque pilote s&apos;engage à respecter le présent règlement ainsi que les règles de
                bonne conduite (article 10).
              </p>
              <aside className="callout">
                <strong>Compte pilote sur le site (facultatif)</strong> — en vous{" "}
                <Link href="/connexion">connectant avec Discord</Link>, vous pouvez ajouter une photo, indiquer votre
                voiture et suivre vos statistiques. Votre pseudo RaceNet sert à relier le compte à vos résultats.
              </aside>
            </Article>

            <Article n={3}>
              <p>Le championnat est ouvert aux Rally4 suivantes :</p>
              <ul className="vehicle-list">
                {VEHICLES.map((v) => (
                  <li key={v}>{v}</li>
                ))}
              </ul>
              <p>
                Tout autre véhicule n&apos;est pas autorisé : une participation avec un véhicule non conforme entraîne
                le « non classé » du pilote sur la manche concernée (article 8).
              </p>
            </Article>

            <Article n={4}>
              <p>La saison 1 se compose de six manches, réparties entre asphalte et gravel :</p>
              <div className="table-scroll">
                <table className="rules-table">
                  <thead>
                    <tr>
                      <th>Manche</th>
                      <th>Rallye</th>
                      <th className="hide-sm">Surface</th>
                      <th>Dates</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ROUNDS.map((r, i) => {
                      const rally = rallies[i];
                      const dates = rally ? formatRallyDates(rally.starts_at, rally.ends_at) : null;
                      const status = rally ? statusLabel(rally.status) : null;
                      return (
                        <tr key={r.name}>
                          <td className="c">
                            <span className="round-badge">{i + 1}</span>
                          </td>
                          <td>
                            <strong>{r.name}</strong>
                            <small className="show-sm">{r.surface}</small>
                          </td>
                          <td className="hide-sm">{r.surface}</td>
                          <td>
                            {dates ?? <span className="muted">À annoncer</span>}
                            {status && <span className={`cal-status ${status.kind} rules-status`}>{status.text}</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p>
                Les dates d&apos;ouverture et de clôture de chaque manche sont publiées sur la page{" "}
                <Link href="/calendrier">Calendrier</Link> et dans <Channel>🔔-annonces-officielles</Channel> sur Discord.
              </p>
            </Article>

            <Article n={5}>
              <p>Chaque manche est organisée via le système de Club d&apos;EA SPORTS WRC, avec les paramètres suivants :</p>
              <dl className="settings">
                <div>
                  <dt>Méthode de scoring</dt>
                  <dd>WRC — le barème standard du jeu, sans règle maison (article 6)</dd>
                </div>
                <div>
                  <dt>Dégâts</dt>
                  <dd>Standard — Hardcore Damage désactivé, sauf annonce contraire pour une manche</dd>
                </div>
                <div>
                  <dt>Reconnaissances</dt>
                  <dd>Non autorisées, pour préserver la découverte des spéciales</dd>
                </div>
                <div>
                  <dt>Fenêtre de participation</dt>
                  <dd>5 à 7 jours par manche, précisée dans l&apos;annonce de chaque événement</dd>
                </div>
              </dl>
              <aside className="callout">
                Chaque pilote dispose d&apos;<strong>un seul passage chronométré par spéciale</strong>. Aucune reprise
                n&apos;est autorisée après la validation du temps, sauf incident technique avéré (article 8).
              </aside>
            </Article>

            <Article n={6}>
              <p>
                Le championnat utilise le barème standard du mode WRC d&apos;EA SPORTS WRC, sans aucune modification ni
                point bonus (pas de points de Power Stage) :
              </p>
              <div className="table-scroll">
                <table className="rules-table points-table">
                  <thead>
                    <tr>
                      <th>Place</th>
                      {POINTS.map((_, i) => (
                        <th key={i}>{i === 0 ? "1er" : `${i + 1}e`}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th scope="row">Points</th>
                      {POINTS.map((p, i) => (
                        <td key={i} className={i < 3 ? `podium-${i + 1}` : ""}>
                          {p}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="muted">Au-delà de la 10e place, aucun point n&apos;est attribué.</p>
            </Article>

            <Article n={7}>
              <p>
                Le classement général additionne les points de <strong>toutes les manches</strong> disputées, tels que
                calculés par le championnat de club RaceNet. Une manche non disputée rapporte 0 point.
              </p>
              <p>
                Les ajustements de points décidés par les organisateurs (article 8) sont appliqués sur le{" "}
                <Link href="/classements">classement du site</Link>, avec leur motif.
              </p>
              <aside className="callout">
                <strong>En cas d&apos;égalité de points</strong>, l&apos;ordre du classement RaceNet fait foi.
              </aside>
            </Article>

            <Article n={8}>
              <div className="table-scroll">
                <table className="rules-table sanctions-table">
                  <thead>
                    <tr>
                      <th>Infraction</th>
                      <th>Sanction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SANCTIONS.map((s) => (
                      <tr key={s.fault}>
                        <td>{s.fault}</td>
                        <td>{s.sanction}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <aside className="callout">
                <strong>Sur le site</strong>, une pénalité de temps s&apos;ajoute au temps total de la manche et le
                classement est recalculé ; un pilote non classé apparaît en « NC ». Si nécessaire, les points du
                classement général sont ajustés. Chaque sanction est affichée avec son motif.
              </aside>
            </Article>

            <Article n={9}>
              <p>
                Toute contestation relative aux résultats d&apos;une manche doit être adressée dans{" "}
                <Channel>📄-réclamations</Channel> sur Discord, <strong>dans les 48 heures</strong> suivant la publication
                des résultats sur le site, accompagnée d&apos;un élément de preuve (capture d&apos;écran ou replay).
              </p>
              <p>
                Le litige est tranché par un commissaire ou un organisateur non impliqué. Sa décision est définitive et
                sans appel.
              </p>
            </Article>

            <Article n={10}>
              <p>
                Le serveur Discord est le canal officiel du championnat : annonces, ouverture et clôture des manches,
                réclamations et échanges entre pilotes. Les <strong>classements et résultats officiels</strong> sont
                publiés sur le site eRally4 Cup.
              </p>
              <p>
                Chaque pilote s&apos;engage à faire preuve de respect et de fair-play envers les autres participants.
                Tout comportement toxique, propos discriminatoire ou harcèlement entraîne un avertissement immédiat, puis
                une exclusion du championnat en cas de récidive.
              </p>
              <p>
                Le contenu du championnat (résultats, moments forts, replays) peut être relayé sur les réseaux sociaux
                officiels du championnat (TikTok notamment) à des fins de promotion, sauf opposition expresse d&apos;un
                pilote signalée aux organisateurs.
              </p>
              <p>
                Les profils pilotes du site sont publics : pseudo et résultats, ainsi que la photo et la voiture pour les
                pilotes qui ont créé un compte. Voir la page <Link href="/confidentialite">Confidentialité</Link>.
              </p>
            </Article>

            <Article n={11}>
              <p>
                Les organisateurs se réservent le droit de modifier le présent règlement en cours de saison en cas de
                nécessité (équilibrage, correction d&apos;une ambiguïté, problème technique du jeu). Toute modification
                est annoncée dans <Channel>🔔-annonces-officielles</Channel> et mise à jour sur cette page{" "}
                <strong>au moins 72 heures</strong> avant son entrée en vigueur. Elle ne peut pas s&apos;appliquer
                rétroactivement à une manche déjà disputée.
              </p>
            </Article>

            <p className="rules-version">eRally4 Cup — Règlement sportif, saison 1 · mis à jour le {UPDATED}</p>
          </div>
        </div>
      </section>
    </>
  );
}
