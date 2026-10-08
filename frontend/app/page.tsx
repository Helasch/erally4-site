import Link from "next/link";
import { ApiError, apiGet, formatDate, type Championship, type Standings } from "@/lib/api";

export const dynamic = "force-dynamic";

async function load() {
  try {
    const [championship, standings] = await Promise.all([
      apiGet<Championship>("/api/championship/current"),
      apiGet<Standings>("/api/championship/current/standings"),
    ]);
    return { championship, standings };
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

export default async function Home() {
  const data = await load();

  if (!data) {
    return (
      <main>
        <h1 className="section-title">Classement général</h1>
        <p className="section-subtitle">Aucun championnat en cours pour le moment.</p>
      </main>
    );
  }

  const { championship, standings } = data;
  const custom = standings.mode === "custom";

  return (
    <main>
      <h1 className="section-title">Classement général</h1>
      <p className="section-subtitle">{championship.name}</p>

      {standings.standings.length === 0 ? (
        <p className="card muted">Le classement sera publié après le premier rallye.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Pos</th>
                <th>Pilote</th>
                {custom &&
                  standings.rallies.map((r, i) => (
                    <th key={r.id} className="num" title={r.name}>
                      R{i + 1}
                    </th>
                  ))}
                <th className="num">Points</th>
              </tr>
            </thead>
            <tbody>
              {standings.standings.map((row, i) => (
                <tr key={row.id ?? `d${row.driver_id}-${i}`}>
                  <td className="pos">{row.position}</td>
                  <td className="name">{row.name}</td>
                  {custom &&
                    row.per_rally?.map((p, j) => (
                      <td key={j} className="num muted">
                        {p ?? "–"}
                      </td>
                    ))}
                  <td className="num">{row.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="section-title">Rallyes</h2>
      {championship.rallies.length === 0 ? (
        <p className="section-subtitle">Calendrier à venir.</p>
      ) : (
        <ul className="rally-list">
          {championship.rallies.map((r, i) => {
            const content = (
              <>
                <span className="round">Rallye {i + 1}</span>
                <span className="rally-name">{r.name}</span>
                <small>{r.event_date ? formatDate(r.event_date) : r.has_results ? "" : "À venir"}</small>
              </>
            );
            return (
              <li key={r.id}>
                {r.has_results ? (
                  <Link href={`/rallyes/${r.id}`}>{content}</Link>
                ) : (
                  <span className="disabled">{content}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
