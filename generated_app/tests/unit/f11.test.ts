/**
 * F-11 — Flow 2: Returning (DEPRECATED)
 *
 * F-46D removed the "parked" and "browsing" app states and the saved-spot flow
 * entirely. All tests that exercised parked/browsing state, onSaveSpot,
 * onClearSpot, setUserPosition, and onHereNow have been deleted because those
 * methods and state shapes no longer exist on the App type.
 *
 * The F-11 functionality (saved spot, parked mode, return flow) was superseded
 * by the Check | Rules dual-mode model introduced in F-46D.
 */

import { describe, it } from "vitest";

describe("F-11 (deprecated — saved-spot flow removed in F-46D)", () => {
  it("placeholder — F-11 tests removed with saved-spot flow", () => {
    // All F-11 tests were deleted because the parked/browsing AppState modes
    // no longer exist. See F-46D spec for the migration rationale.
  });
});
