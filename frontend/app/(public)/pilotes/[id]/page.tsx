import PageHeader from "../../page-header";

// Page provisoire : les statistiques du pilote arrivent à l'étape suivante
export default function PilotePage() {
  return (
    <>
      <PageHeader title="Profil pilote" crumbs={[{ href: "/pilotes", label: "Pilotes" }]} />
      <section className="band">
        <div className="band-inner">
          <p className="empty">Les statistiques des pilotes arrivent très bientôt.</p>
        </div>
      </section>
    </>
  );
}
