import { describe, expect, it } from "vitest";
import { accountStateKey, resolveGhlAccounts } from "./ghl-accounts";

const WATERMARK = { id: "biz-watermark", ghl_location_id: null };
const MANOLO = { id: "biz-manolo", ghl_location_id: "ManoloLoc123" };
const ORIGINAL_ENV = { GHL_LOCATION_ID: "WatermarkLoc99", GHL_API_KEY: "tok-watermark" };

describe("resolveGhlAccounts", () => {
  it("keeps the original connection on the first business when no business names a location", () => {
    expect(resolveGhlAccounts([WATERMARK, { id: "biz-manolo", ghl_location_id: null }], ORIGINAL_ENV)).toEqual([
      { businessId: "biz-watermark", locationId: "WatermarkLoc99", token: "tok-watermark", missing: [], isOriginal: true },
    ]);
  });

  it("gives a business with its own location its own token", () => {
    const accounts = resolveGhlAccounts([WATERMARK, MANOLO], { ...ORIGINAL_ENV, GHL_API_KEY_ManoloLoc123: "tok-manolo" });
    expect(accounts).toEqual([
      { businessId: "biz-manolo", locationId: "ManoloLoc123", token: "tok-manolo", missing: [], isOriginal: false },
      { businessId: "biz-watermark", locationId: "WatermarkLoc99", token: "tok-watermark", missing: [], isOriginal: true },
    ]);
  });

  it("never lends one business's token to another", () => {
    const [manolo] = resolveGhlAccounts([WATERMARK, MANOLO], ORIGINAL_ENV);
    expect(manolo).toMatchObject({ businessId: "biz-manolo", token: "", missing: ["GHL_API_KEY_ManoloLoc123"] });
  });

  it("uses GHL_API_KEY for a business that names the original location", () => {
    const named = { id: "biz-watermark", ghl_location_id: "WatermarkLoc99" };
    expect(resolveGhlAccounts([named], ORIGINAL_ENV)).toEqual([
      { businessId: "biz-watermark", locationId: "WatermarkLoc99", token: "tok-watermark", missing: [], isOriginal: true },
    ]);
  });

  it("doesn't hand the original location to a later business when the first one has its own", () => {
    const first = { id: "biz-a", ghl_location_id: "OtherLoc0001" };
    const accounts = resolveGhlAccounts([first, { id: "biz-b", ghl_location_id: null }], ORIGINAL_ENV);
    expect(accounts.map((a) => a.businessId)).toEqual(["biz-a"]);
  });

  it("connects nothing when there is no location anywhere", () => {
    expect(resolveGhlAccounts([WATERMARK], {})).toEqual([]);
  });

  it("asks for GHL_API_KEY when the original location has no token", () => {
    expect(resolveGhlAccounts([WATERMARK], { GHL_LOCATION_ID: "WatermarkLoc99" })[0].missing).toEqual(["GHL_API_KEY"]);
  });
});

describe("accountStateKey", () => {
  it("keeps the original connection's existing state rows", () => {
    expect(accountStateKey("ghl_sync", { locationId: "WatermarkLoc99", isOriginal: true })).toBe("ghl_sync");
  });

  it("gives every other sub-account its own row", () => {
    expect(accountStateKey("ghl_sync", { locationId: "ManoloLoc123", isOriginal: false })).toBe("ghl_sync:ManoloLoc123");
  });
});
