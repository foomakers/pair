import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { loadEnv } from "./load-env";

const workspaceDir = __dirname;
const rootEnvPath = path.resolve(workspaceDir, "../../.env");
const workspaceEnvPath = path.resolve(workspaceDir, ".env");

function writeEnv(file: string, content: string) {
  fs.writeFileSync(file, content);
}
function removeEnv(file: string) {
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

describe("loadEnv utility", () => {
  beforeEach(() => {
    // Clean up env files and process.env
    removeEnv(rootEnvPath);
    removeEnv(workspaceEnvPath);
    delete process.env["PAIR_ADOPTION_FOLDER"];
    delete process.env["ONLY_IN_WORKSPACE"];
    delete process.env["ONLY_IN_ROOT"];
  });

  afterEach(() => {
    removeEnv(rootEnvPath);
    removeEnv(workspaceEnvPath);
  });

  it("loads workspace .env and falls back to root .env for missing variables", () => {
    writeEnv(
      rootEnvPath,
      "PAIR_ADOPTION_FOLDER=.pair\nONLY_IN_ROOT=root_value"
    );
    writeEnv(
      workspaceEnvPath,
      "PAIR_ADOPTION_FOLDER=workspace_value\nONLY_IN_WORKSPACE=workspace_only"
    );
    loadEnv(workspaceDir);
    expect(process.env["PAIR_ADOPTION_FOLDER"]).toBe("workspace_value");
    expect(process.env["ONLY_IN_WORKSPACE"]).toBe("workspace_only");
    expect(process.env["ONLY_IN_ROOT"]).toBe("root_value");
  });

  it("loads only root .env if workspace .env is missing", () => {
    writeEnv(
      rootEnvPath,
      "PAIR_ADOPTION_FOLDER=.pair\nONLY_IN_ROOT=root_value"
    );
    loadEnv(workspaceDir);
    expect(process.env["PAIR_ADOPTION_FOLDER"]).toBe(".pair");
    expect(process.env["ONLY_IN_ROOT"]).toBe("root_value");
    expect(process.env["ONLY_IN_WORKSPACE"]).toBeUndefined();
  });

  it("loads only workspace .env if root .env is missing", () => {
    writeEnv(
      workspaceEnvPath,
      "PAIR_ADOPTION_FOLDER=workspace_value\nONLY_IN_WORKSPACE=workspace_only"
    );
    loadEnv(workspaceDir);
    expect(process.env["PAIR_ADOPTION_FOLDER"]).toBe("workspace_value");
    expect(process.env["ONLY_IN_WORKSPACE"]).toBe("workspace_only");
    expect(process.env["ONLY_IN_ROOT"]).toBeUndefined();
  });
});
