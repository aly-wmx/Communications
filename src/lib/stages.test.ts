import { describe, expect, it } from "vitest";
import { departmentFor, departmentStages, isDepartment, isStage, stageTag, STAGES, STAGE_STYLE } from "./stages";

describe("stages", () => {
  it("has a colour for every stage", () => {
    for (const s of STAGES) expect(STAGE_STYLE[s]).toBeTruthy();
  });

  it("maps stages to departments", () => {
    expect(departmentFor("New Lead")).toBe("sales");
    expect(departmentFor("Pre-Production & Permitting")).toBe("design");
    expect(departmentFor("Active Construction")).toBe("construction");
    expect(departmentFor("Client Care & Warranty")).toBe("client_care");
    expect(departmentFor("Lost Lead")).toBeNull();
    expect(departmentFor(null)).toBe("sales");
    expect(departmentStages("design")).toEqual(["Architectural & Design Studio", "Pre-Production & Permitting"]);
  });

  it("validates and tags", () => {
    expect(isStage("Legacy")).toBe(true);
    expect(isStage("Closed")).toBe(false);
    expect(isDepartment("sales")).toBe(true);
    expect(isDepartment("admin")).toBe(false);
    expect(stageTag("Active Construction")).toBe("Stage: Active Construction");
  });
});
