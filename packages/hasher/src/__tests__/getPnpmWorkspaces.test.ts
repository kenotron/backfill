import path from "path";

import { setupFixture } from "backfill-utils-test";

import { getPnpmWorkspaces } from "../workspaces/pnpmWorkspaces";

describe("getPnpmWorkspaces()", () => {
  it("gets the name and path of the workspaces", async () => {
    const packageRoot = await setupFixture("monorepo-pnpm");
    const workspacesPackageInfo = getPnpmWorkspaces(packageRoot);

    const packageAPath = path.join(packageRoot, "packages", "package-a");
    const packageBPath = path.join(packageRoot, "packages", "package-b");

    expect(workspacesPackageInfo).toEqual([
      { name: "package-a", path: packageAPath },
      { name: "package-b", path: packageBPath }
    ]);
  });
});
