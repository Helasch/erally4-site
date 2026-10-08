import { notFound, permanentRedirect } from "next/navigation";

// Ancienne adresse d'un rallye : les résultats sont désormais un onglet de /classements
export default async function OldRallyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  permanentRedirect(`/classements?rallye=${id}`);
}
