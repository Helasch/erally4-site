import Link from "next/link";
import PageHeader from "../page-header";

const ERRORS: Record<string, string> = {
  indisponible: "La connexion Discord n'est pas encore activée sur le site. Réessayez plus tard.",
  annulee: "Connexion annulée sur Discord.",
  session: "La connexion a expiré, merci de recommencer.",
  serveur:
    "Votre compte Discord n'est pas membre du serveur eRally4 Cup. Rejoignez-le d'abord, puis reconnectez-vous.",
  discord: "Discord n'a pas répondu correctement. Réessayez dans un instant.",
};

export default async function ConnexionPage({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string; next?: string }>;
}) {
  const { erreur, next } = await searchParams;
  const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/mon-compte";
  const message = erreur ? (ERRORS[erreur] ?? "La connexion a échoué, réessayez.") : null;

  return (
    <>
      <PageHeader title="Connexion" subtitle="Espace pilote : votre photo, votre voiture et vos statistiques." />
      <section className="band band-grey">
        <div className="band-inner narrow">
          <div className="card-block login-box">
            {message && <p className="notice notice-error">{message}</p>}
            <h2>Se connecter avec Discord</h2>
            <p>
              Le compte pilote utilise votre compte Discord : pas de mot de passe à créer. Il est réservé aux membres du
              serveur Discord eRally4 Cup.
            </p>
            <a href={`/api/auth/discord/login?next=${encodeURIComponent(target)}`} className="btn btn-discord">
              Se connecter avec Discord
            </a>
            <p className="small muted">
              Le site reçoit uniquement votre identifiant et votre nom Discord, ainsi que la liste de vos serveurs pour
              vérifier que vous êtes membre. Il n&apos;a accès ni à vos messages ni à votre e-mail. Détails dans la{" "}
              <Link href="/confidentialite">politique de confidentialité</Link>.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
