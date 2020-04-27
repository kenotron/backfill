import path from "path";
import findUp from "find-up";
import fs from "fs-extra";
import { parse as parseYarnLock } from "@yarnpkg/lockfile";
import { readWantedLockfile } from "@pnpm/lockfile-file";
import { Dependencies } from "./resolveExternalDependencies";
import { nameAtVersion } from "./helpers";

type LockDependency = {
  version: string;
  dependencies?: Dependencies;
};

export type ParsedLock = {
  type: "success" | "merge" | "conflict";
  object: {
    [key in string]: LockDependency;
  };
};

const memoization: { [path: string]: ParsedLock } = {};

export async function parseLockFile(packageRoot: string): Promise<ParsedLock> {
  const yarnLockPath = await findUp("yarn.lock", { cwd: packageRoot });

  // First, test out whether this works for yarn
  if (yarnLockPath) {
    if (memoization[yarnLockPath]) {
      return memoization[yarnLockPath];
    }

    const yarnLock = fs.readFileSync(yarnLockPath).toString();
    const parsed = parseYarnLock(yarnLock);

    memoization[yarnLockPath] = parsed;

    return parsed;
  }

  // Second, test out whether this works for pnpm
  // TODO: support rush common\config\rush\pnpm-lock.yaml
  let pnpmLockPath = await findUp("pnpm-lock.yaml", { cwd: packageRoot });

  if (pnpmLockPath) {
    if (memoization[pnpmLockPath]) {
      return memoization[pnpmLockPath];
    }

    // const pnpmLock = fs.readFileSync(pnpmLockPath).toString();
    const parsed = await readWantedLockfile(path.dirname(pnpmLockPath), {
      ignoreIncompatible: false
    });

    const object: {
      [key in string]: LockDependency;
    } = {};

    if (parsed && parsed.packages) {
      for (const [pkg, snapshot] of Object.entries(parsed.packages)) {
        object[pkg] = {
          version: snapshot.version!,
          dependencies: snapshot.dependencies
        };
      }
    }

    memoization[pnpmLockPath] = { object, type: "success" };

    return memoization[pnpmLockPath];
  }

  throw new Error(
    "You do not have either yarn.lock nor pnpm-lock.yaml. Please use one of these package managers"
  );
}

export function queryLockFile(
  name: string,
  versionRange: string,
  lock: ParsedLock
): LockDependency {
  const versionRangeSignature = nameAtVersion(name, versionRange);
  return lock.object[versionRangeSignature];
}
