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
      <p>
        <Link href="/">← {rally.championship.name}</Link>
      </p>
      <h1>{rally.name}</h1>
      {rally.event_date && <p className="muted">{formatDate(rally.event_date)}</p>}

      {rally.results.length === 0 ? (
        <p className="card muted">Résultats pas encore publiés.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Pilote</th>
                <th>Voiture</th>
                <th className="num">Temps</th>
                <th className="num">Écart</th>
                <th>Plateforme</th>
                {custom && <th className="num">Points</th>}
              </tr>
            </thead>
            <tbody>
              {rally.results.map((r) => (
                <tr key={r.id} className={`p${r.position}`}>
                  <td className="pos">{r.position}</td>
                  <td>{r.name}</td>
                  <td className="muted">{r.vehicle}</td>
                  <td className="num">{formatTime(r.time)}</td>
                  <td className="num muted">{formatDiff(r.diff)}</td>
                  <td>
                    <span className="badge">{r.platform}</span>
                  </td>
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
