import { describe, expect, it } from "vitest";
import { loadConfig } from "../../server/config";

describe("loadConfig", () => {
  it("returns parsed config when DATABASE_URL exists", () => {
    const config = loadConfig({ DATABASE_URL: "postgres://test", PORT: "4000" });
    expect(config.databaseUrl).toBe("postgres://test");
    expect(config.port).toBe(4000);
  });

  it("throws actionable error when DATABASE_URL is missing", () => {
    expect(() => loadConfig({})).toThrowError(/DATABASE_URL is not set/);
    expect(() => loadConfig({})).toThrowError(/npm run doctor/);
  });
});
