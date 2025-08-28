import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const root = path.resolve(__dirname, "../../");
const envExamplePath = path.join(root, ".env.example");

describe("Repository Secrets: .env.example existence and content", () => {
  it("should have a .env.example at the repository root with PAIR_ADOPTION_FOLDER variable", () => {
    expect(fs.existsSync(envExamplePath)).toBe(true);
    const content = fs.readFileSync(envExamplePath, "utf8");
    expect(content).toMatch(/PAIR_ADOPTION_FOLDER=.pair/);
  });
});
