import Link from "next/link";
import { notFound } from "next/navigation";
import { ApiError, apiGet, formatDate, formatDiff, formatTime, type RallyDetail } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function RallyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();

  let rally: RallyDetail;
  try {
    rally = await apiGet<RallyDetail>(`/api/rallies/${id}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  const custom = rally.championship.mode === "custom";

  return (
    <main>
      <Link href="/" className="back-link">
        ← Classement général
      </Link>
      <h1 className="section-title">{rally.name} · Résultats</h1>
      <p className="section-subtitle">
        {rally.championship.name}
        {rally.event_date && ` · ${formatDate(rally.event_date)}`}
      </p>

      {rally.results.length === 0 ? (
        <p className="card muted">Résultats pas encore publiés.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Pos</th>
                <th>Pilote</th>
                <th className="desktop-only">Voiture</th>
                <th className="num">Temps</th>
                <th className="num">Écart</th>
                {custom && <th className="num">Pts</th>}
              </tr>
            </thead>
            <tbody>
              {rally.results.map((r) => (
                <tr key={r.id}>
                  <td className="pos">{r.position}</td>
                  <td className="name">
                    {r.name} <span className="badge">{r.platform}</span>
                    <span className="sub mobile-only">{r.vehicle}</span>
                  </td>
                  <td className="desktop-only">{r.vehicle}</td>
                  <td className="num">{formatTime(r.time)}</td>
                  <td className="num">{formatDiff(r.diff)}</td>
                  {custom && <td className="num">{r.points}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
