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
  schedule: string;   // "Monday through Friday - 8 am to 9 am"
  location: string;   // "Observer Hwy. to Seventh St."
}

export interface StreetCleaningData {
  fetched_at: string;                // ISO 8601 UTC — when the scrape ran
  entries:    StreetCleaningEntry[];
}
