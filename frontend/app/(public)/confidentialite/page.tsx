import Link from "next/link";
import PageHeader from "../page-header";

export const metadata = { title: "Confidentialité — eRally4 Cup" };

export default function ConfidentialitePage() {
  return (
    <>
      <PageHeader title="Confidentialité" subtitle="Quelles données le site utilise, et pourquoi." />
      <section className="band">
        <div className="band-inner narrow prose">
          <h2>Résultats et classements</h2>
          <p>
            Les classements affichent les pseudos, voitures, plateformes et temps issus des exports de RaceNet (EA SPORTS
            WRC) pour les pilotes du championnat. Ces données sont publiques sur le site.
          </p>

          <h2>Compte pilote</h2>
          <p>La création d&apos;un compte est facultative. Si vous vous connectez avec Discord, le site enregistre :</p>
          <ul>
            <li>votre identifiant et votre nom Discord ;</li>
            <li>le pseudo que vous choisissez pour le site et votre pseudo RaceNet ;</li>
            <li>la voiture que vous indiquez et, si vous en ajoutez une, votre photo de profil.</li>
          </ul>
          <p>
            Lors de la connexion, le site consulte la liste de vos serveurs Discord uniquement pour vérifier que vous
            êtes membre du serveur eRally4 Cup ; cette liste n&apos;est pas conservée. Le site n&apos;a accès ni à vos
            messages, ni à votre adresse e-mail.
          </p>
          <p>
            Votre pseudo, votre photo et votre voiture sont affichés publiquement sur votre profil et dans les
            classements. Ces données servent uniquement au fonctionnement du championnat : elles ne sont ni vendues, ni
            partagées, ni utilisées à des fins publicitaires.
          </p>

          <h2>Cookies</h2>
          <p>
            Le site n&apos;utilise que des cookies nécessaires à son fonctionnement : la session de connexion (pilote ou
            administrateur) et un jeton temporaire de sécurité pendant la connexion Discord. Aucun cookie de mesure
            d&apos;audience ou de publicité.
          </p>

          <h2>Durée de conservation</h2>
          <p>
            Les données du compte sont conservées tant que le compte existe. Les sessions de connexion expirent après 30
            jours.
          </p>

          <h2>Vos droits</h2>
          <p>
            Vous pouvez modifier vos informations ou <strong>supprimer votre compte</strong> à tout moment depuis{" "}
            <Link href="/mon-compte">Mon compte</Link> : votre compte et votre photo sont alors effacés. Vos résultats
            restent affichés sous votre pseudo RaceNet, car ils font partie de l&apos;historique du championnat. Pour
            toute autre demande, contactez les organisateurs sur le serveur Discord eRally4 Cup.
          </p>
        </div>
      </section>
    </>
  );
}
