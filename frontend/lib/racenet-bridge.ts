"use client";

// Pont avec RaceNet. Le favori « eRally4 », lancé sur racenet.com (où l'utilisateur est connecté),
// ouvre la page d'import de l'admin puis relaie ses requêtes de lecture vers l'API RaceNet
// (non officielle), avec la session RaceNet du navigateur. Aucun jeton n'est stocké par le site.
//
// Sécurité du favori : il ne répond qu'à la fenêtre qu'il a ouverte, sur l'origine du site,
// et ne fait que des lectures (GET) sous /api/wrc2023clubs/.

export const RACENET_ORIGIN = "https://racenet.com";

/** Code du favori, pour le site servi depuis `siteOrigin`. Toute la logique d'import reste sur le site. */
export function bookmarkletHref(siteOrigin: string): string {
  const source = `(()=>{
const S=${JSON.stringify(siteOrigin)},A="https://web-api.racenet.com/api/";
if(location.origin!=="${RACENET_ORIGIN}"){alert("Lancez ce favori depuis racenet.com, connecté à votre compte.");return}
const w=window.open(S+"/admin/import?racenet=1","erally4-import");
if(!w){alert("Autorisez les fenêtres pop-up pour racenet.com, puis recliquez sur le favori.");return}
if(window.__erally4)return;window.__erally4=1;
let t=null;
async function auth(){const r=await fetch(A+"identity/refresh-auth",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({clientId:"RACENET_1_JS_WEB_APP",grantType:"refresh_token",redirectUri:"https://racenet.com/oauthCallback"})});if(r.status!==200)throw new Error("not_logged_in");t=(await r.json()).access_token}
async function get(p){if(!t)await auth();let r=await fetch(A+p,{headers:{Authorization:"Bearer "+t}});if(r.status===401){await auth();r=await fetch(A+p,{headers:{Authorization:"Bearer "+t}})}return{status:r.status,body:r.status===200?await r.json():null}}
addEventListener("message",async e=>{const d=e.data;if(e.source!==w||e.origin!==S||!d||d.type!=="erally4:get")return;let res;try{const p=String(d.path);if(!/^wrc2023clubs\\/[A-Za-z0-9\\/?=&%._-]+$/.test(p)||p.includes(".."))throw new Error("forbidden");res=await get(p)}catch(x){res={status:0,error:String(x&&x.message||x)}}w.postMessage(Object.assign({type:"erally4:response",id:d.id},res),S)});
})();`;
  return "javascript:" + encodeURIComponent(source.replace(/\n/g, ""));
}

type BridgeResponse = { status: number; body: unknown; error?: string };

export class RacenetBridgeError extends Error {}

/** Fenêtre racenet.com qui a ouvert la page (via le favori), ou null. */
export function racenetOpener(): Window | null {
  if (typeof window === "undefined" || !window.opener) return null;
  return new URLSearchParams(window.location.search).get("racenet") === "1" ? (window.opener as Window) : null;
}

let nextId = 1;

/** Lecture d'une ressource de l'API RaceNet via le favori (chemin relatif à /api/). */
export function racenetGet<T>(opener: Window, path: string, timeoutMs = 20000): Promise<T> {
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(
        new RacenetBridgeError(
          "RaceNet ne répond pas. Gardez l'onglet racenet.com ouvert, puis recliquez sur le favori.",
        ),
      );
    }, timeoutMs);

    function onMessage(e: MessageEvent) {
      const data = e.data as { type?: string; id?: number } & BridgeResponse;
      if (e.origin !== RACENET_ORIGIN || e.source !== opener || data?.type !== "erally4:response" || data.id !== id)
        return;
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      if (data.error === "not_logged_in") {
        reject(new RacenetBridgeError("Vous n'êtes pas connecté à RaceNet : connectez-vous sur racenet.com."));
      } else if (data.status !== 200) {
        reject(new RacenetBridgeError(`RaceNet a répondu par une erreur (${data.error || data.status}).`));
      } else {
        resolve(data.body as T);
      }
    }

    window.addEventListener("message", onMessage);
    opener.postMessage({ type: "erally4:get", id, path }, RACENET_ORIGIN);
  });
}

// --- Récupération d'une épreuve complète -------------------------------------------------

type Entry = Record<string, unknown> & { ssid?: string };
type Page = { entries?: Entry[]; next?: string | null; cursorNext?: string | null };

export type RacenetEvent = {
  id: string;
  leaderboardID: string;
  status: number;
  absoluteOpenDate: string;
  absoluteCloseDate: string;
  eventSettings?: { location?: string };
  stages: { id: string; leaderboardID: string; stageSettings?: { route?: string; distance?: number } }[];
};

export type RacenetChampionship = { id: string; settings?: { name?: string }; events: RacenetEvent[] };

export type RacenetClub = { clubName: string; currentChampionship?: RacenetChampionship };

/** Toutes les pages d'un classement (RaceNet renvoie 20 lignes au plus par requête). */
async function allPages(opener: Window, path: string, cursorKey: "next" | "cursorNext"): Promise<Entry[]> {
  const rows: Entry[] = [];
  const seen = new Set<string>();
  let cursor = "";
  for (let page = 0; page < 60; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const data = await racenetGet<Page>(opener, cursor ? `${path}${sep}Cursor=${encodeURIComponent(cursor)}` : path);
    const fresh = (data.entries ?? []).filter((e) => e.ssid && !seen.has(e.ssid));
    fresh.forEach((e) => seen.add(e.ssid!));
    rows.push(...fresh);
    const next = data[cursorKey];
    // Arrêt aussi si une page n'apporte rien de nouveau (pagination ignorée par RaceNet)
    if (!next || fresh.length === 0) break;
    cursor = next;
  }
  return rows;
}

function leaderboardPath(clubId: string, leaderboardId: string, cumulative: boolean) {
  return `wrc2023clubs/${clubId}/leaderboard/${leaderboardId}?SortCumulative=${cumulative}&MaxResultCount=20&FocusOnMe=false&Platform=0`;
}

/** Données d'une épreuve, au format attendu par POST /api/admin/imports/racenet. */
export async function fetchRacenetEvent(
  opener: Window,
  clubId: string,
  championship: RacenetChampionship,
  event: RacenetEvent,
  onProgress: (label: string) => void,
) {
  const stages = [];
  for (const [i, stage] of event.stages.entries()) {
    onProgress(`Spéciale ${i + 1} sur ${event.stages.length}…`);
    stages.push({
      leaderboard_id: stage.leaderboardID,
      entries: await allPages(opener, leaderboardPath(clubId, stage.leaderboardID, false), "next"),
    });
  }
  onProgress("Classement général du rallye…");
  const last = event.stages[event.stages.length - 1];
  const overall = await allPages(opener, leaderboardPath(clubId, last.leaderboardID, true), "next");
  onProgress("Classement du championnat…");
  const standings = await allPages(opener, `wrc2023clubs/${clubId}/championship/points/${championship.id}`, "cursorNext");
  return { championship, event_id: event.id, stages, overall, standings };
}
