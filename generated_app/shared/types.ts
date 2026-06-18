export const SIGN_REASONS = ["CONSTRUCTION", "MOVING", "EVENT", "DELIVERY"] as const;
export type SignReason = (typeof SIGN_REASONS)[number];

export interface Sign {
  id:              string;
  address:         string;
  reason:          SignReason;
  permit_number:   string;
  lat:             number;
  lng:             number;
  start_date:      string;   // original M/D/YYYY from API — preserved for display only
  start_time:      string;   // original HH:MM:SS from API — preserved for display only
  stop_date:       string;   // original M/D/YYYY from API — preserved for display only
  end_time:        string;   // original HH:MM:SS from API — preserved for display only
  start_iso:       string;   // ISO 8601 local datetime — use this for all time logic
  end_iso:         string;   // ISO 8601 local datetime — use this for all time logic
  active_at_fetch: boolean;
}

export interface ParkingData {
  fetched_at: string;   // ISO 8601 UTC — when the fetch ran
  count:      number;   // must equal signs.length
  signs:      Sign[];
}

export interface RawSign {
  id:           string;
  address:      string;
  reason:       string;       // validated against SIGN_REASONS before use; typed as string here
  permit_number: string;
  latitude:     number;       // renamed to lat in Sign
  longitude:    number;       // renamed to lng in Sign
  start_date:   string;
  start_time:   string;
  stop_date:    string;
  end_time:     string;
}

export interface RawApiResponse {
  status: string;
  data:   RawSign[];
}

export interface StreetCleaningEntry {
  street:   string;   // "Washington Street"
  side:     string;   // "East" | "West" | "North" | "South" | "Both"
  schedule: string;   // "Monday through Friday  8 am – 9 am"
  location: string;   // "Observer Hwy. to Seventh St."
}

export interface StreetCleaningData {
  fetched_at: string;                // ISO 8601 UTC — when the scrape ran
  entries:    StreetCleaningEntry[];
}

export type RoadGeometry = Record<string, [number, number][][]>;

export interface Garage {
  name: string;       // "Garage B"
  address: string;    // "28 2nd St"
  capacity: number;   // 829
  lat: number;
  lng: number;
  phone: string;      // "201-653-7333"
}

export interface SnowRoute {
  street: string;   // road-geometry key, e.g. "3RD ST" (uppercase, no periods)
  side: string;     // "North" | "South" | "Both" | "West" | "East"
  from: string;     // cross-street label for display only
  to: string;       // cross-street label for display only
  minLon?: number;  // clip geometry west of this longitude (east-west streets)
  maxLon?: number;  // clip geometry east of this longitude (east-west streets)
  minLat?: number;  // clip geometry south of this latitude (north-south streets)
  maxLat?: number;  // clip geometry north of this latitude (north-south streets)
}

export interface BusStop {
  id: string;    // stop_id from GTFS stops.txt
  name: string;  // stop_name from GTFS stops.txt
  lat: number;   // stop_lat
  lng: number;   // stop_lon
}

export type AppMode = "check" | "current";

export type ParkingStatus =
  | "safe"
  | "unknown"
  | "limited"
  | "ticket"
  | "tow"
  | "snow";

export type ParkingSide =
  | "North"
  | "South"
  | "East"
  | "West"
  | "Both"
  | "Unknown";

export interface CheckQuery {
  startTime: Date;
  endTime: Date;
  label: string;
  source: "duration" | "parser";
}

export interface ParkingWindowConflict {
  status: ParkingStatus;
  reason: string;
  label: string;
  startsAt?: Date;
  endsAt?: Date;
  sourceId?: string;
  sourceType?:
    | "street-cleaning"
    | "tow-sign"
    | "snow-route"
    | "unknown";
}

export interface SegmentGeometry {
  ways: Array<Array<[number, number]>>;
  clipped: boolean;
  source: "road-geometry";
}

export interface ParkingSegment {
  id: string;
  street: string;
  location: string;
  side: ParkingSide;
  geometry?: SegmentGeometry;
  cleaningEntries: StreetCleaningEntry[];
  towSigns: Sign[];
  snowRoutes: SnowRoute[];
}

export interface CheckResultSegment {
  id: string;
  street: string;
  location: string;
  side: ParkingSide;
  status: ParkingStatus;
  conflicts: ParkingWindowConflict[];
  primaryConflict?: ParkingWindowConflict;
  geometry?: SegmentGeometry;
}

export interface RulesTimeSelection {
  mode: "now" | "custom";
  selectedTime: Date;
}

export interface RulesInspectionSection {
  title: string;
  content: string;
  priority: ParkingStatus;
}

export interface NextRestriction {
  startsAt: Date;
  endsAt: Date;
  label: string;
  status: ParkingStatus;
}

// streetKey → [[houseNum, arcM], ...] sorted by houseNum ascending
// arcM is cumulative meters from the start of flattenWaysToArcPath(ways).
// IMPORTANT: arcM values are computed against a specific road-geometry.json.
// If road-geometry.json is regenerated, address-arc.json must also be regenerated.
export type AddressArcIndex = Record<string, [number, number][]>;
