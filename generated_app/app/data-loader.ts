import type {
  Garage,
  RoadGeometry,
  Sign,
  SnowRoute,
  StreetCleaningEntry,
} from "../shared/types";

type CrossStreetCache = Record<string, { lat: number; lng: number } | null>;
type RawSignDataLoad = { fetched_at?: unknown; signs?: unknown };

export type SignDataLoad = {
  fetchedAt: string;
  fetchTime: Date;
  signs: Sign[];
};

export type StartupStaticData = {
  roadGeometry: RoadGeometry | undefined;
  streetParity: Record<string, 1 | -1> | undefined;
  cleaningEntries: StreetCleaningEntry[];
  snowRoutes: SnowRoute[];
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  return await response.json() as T;
}

function parseSignDataLoad(raw: RawSignDataLoad): SignDataLoad | null {
  if (typeof raw.fetched_at !== "string" || !Array.isArray(raw.signs)) {
    return null;
  }
  return {
    fetchedAt: raw.fetched_at,
    fetchTime: new Date(raw.fetched_at),
    signs: raw.signs as Sign[],
  };
}

export async function loadCrossStreetCache(): Promise<CrossStreetCache | null> {
  try {
    return await fetchJson<CrossStreetCache>("data/cross-streets.json");
  } catch {
    return null;
  }
}

export async function loadStartupStaticData(): Promise<StartupStaticData> {
  let roadGeometry: RoadGeometry | undefined = undefined;
  let streetParity: Record<string, 1 | -1> | undefined = undefined;
  let cleaningEntries: StreetCleaningEntry[] = [];
  let snowRoutes: SnowRoute[] = [];

  await Promise.all([
    fetchJson<RoadGeometry>("data/road-geometry.json")
      .then((data) => { roadGeometry = data; })
      .catch(() => { /* non-fatal */ }),
    fetchJson<Record<string, 1 | -1>>("data/street-parity.json")
      .then((data) => { streetParity = data; })
      .catch(() => { /* non-fatal */ }),
    fetchJson<{ entries?: StreetCleaningEntry[] }>("data/street-cleaning.json")
      .then((data) => { cleaningEntries = data.entries ?? []; })
      .catch(() => { /* non-fatal */ }),
    fetchJson<{ routes?: SnowRoute[] }>("data/snow-emergency-routes.json")
      .then((data) => { snowRoutes = data.routes ?? []; })
      .catch(() => { /* non-fatal */ }),
  ]);

  return { roadGeometry, streetParity, cleaningEntries, snowRoutes };
}

export async function loadSignData(cache?: RequestCache): Promise<SignDataLoad> {
  const json = await fetchJson<RawSignDataLoad>(
    "data/latest.json",
    cache === undefined ? undefined : { cache }
  );
  const parsed = parseSignDataLoad(json);
  if (parsed === null) {
    throw new Error("Invalid latest.json payload");
  }
  return parsed;
}

export async function loadFutureSignData(cache?: RequestCache): Promise<SignDataLoad | null> {
  try {
    const json = await fetchJson<RawSignDataLoad>(
      "data/future.json",
      cache === undefined ? undefined : { cache }
    );
    return parseSignDataLoad(json);
  } catch {
    return null;
  }
}

export async function loadGarages(): Promise<Garage[] | null> {
  try {
    return await fetchJson<Garage[]>("data/garages.json");
  } catch {
    return null;
  }
}
