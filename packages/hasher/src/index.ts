import { logger, setLogLevel } from "backfill-logger";
import { outputFolderAsArray } from "backfill-config";

import { generateHashOfFiles } from "./hashOfFiles";
import {
  PackageHashInfo,
  calculatePackageHash,
  combineHashOfInternalPackages
} from "./hashOfPackage";
import { hashStrings, getPackageRoot } from "./helpers";
import { parseLockFile, ParsedYarnLock } from "./yarnLock";
import {
  getYarnWorkspaces,
  findWorkspacePath,
  WorkspaceInfo
} from "./yarnWorkspaces";

setLogLevel("verbose");

export interface IHasher {
  createPackageHash: (
    location?: string,
    completedPackages?: PackageHashInfo[],
    yarnLock?: ParsedYarnLock
  ) => Promise<string>;
  hashOfOutput: () => Promise<string>;
}

function isCompleted(
  packageInfo: PackageHashInfo[],
  packageName: string
): boolean {
  return Boolean(packageInfo.find(({ name }) => name === packageName));
}

function isInQueue(queue: string[], packagePath: string): boolean {
  return queue.indexOf(packagePath) >= 0;
}

export function addToQueue(
  dependencyNames: string[],
  queue: string[],
  completedPackages: PackageHashInfo[],
  workspaces: WorkspaceInfo
): void {
  dependencyNames.forEach(name => {
    const dependencyPath = findWorkspacePath(workspaces, name);

    if (dependencyPath) {
      if (
        !isCompleted(completedPackages, name) &&
        !isInQueue(queue, dependencyPath)
      ) {
        queue.push(dependencyPath);
      }
    }
  });
}

function getPreviousResult(
  location: string,
  completedPackages: PackageHashInfo[]
): PackageHashInfo | undefined {
  return completedPackages.find(({ packageRoot }) => packageRoot === location);
}

function updateCompletedPackagesGlobal(
  completedPackage: PackageHashInfo,
  completedPackagesGlobal?: PackageHashInfo[]
): void {
  if (completedPackagesGlobal) {
    if (
      !completedPackagesGlobal.find(
        ({ packageRoot }) => packageRoot === completedPackage.packageRoot
      )
    ) {
      completedPackagesGlobal.push(completedPackage);
    }
  }
}

export class Hasher implements IHasher {
  private packageRoot: string;
  private outputFolder: string | string[];

  constructor(
    private options: { packageRoot: string; outputFolder: string | string[] },
    private buildCommandSignature: string
  ) {
    this.packageRoot = this.options.packageRoot;
    this.outputFolder = this.options.outputFolder;
  }

  public async createPackageHash(
    location?: string,
    completedPackagesGlobal?: PackageHashInfo[],
    yarnLock?: ParsedYarnLock
  ): Promise<string> {
    logger.profile(`hasher:calculateHash-${location}`);

    const packageRoot = location || (await getPackageRoot(this.packageRoot));
    yarnLock = yarnLock || (await parseLockFile(packageRoot));
    const workspaces = getYarnWorkspaces(packageRoot);

    const completedPackages: PackageHashInfo[] = [];
    const queue = [packageRoot];

    while (queue.length > 0) {
      const packageRoot = queue.shift();

      if (!packageRoot) {
        continue;
      }

      const packageHash =
        getPreviousResult(packageRoot, completedPackagesGlobal || []) ||
        (await calculatePackageHash(packageRoot, workspaces, yarnLock));

      addToQueue(
        packageHash.internalDependencies,
        queue,
        completedPackages,
        workspaces
      );

      completedPackages.push(packageHash);
      updateCompletedPackagesGlobal(packageHash, completedPackagesGlobal);
    }

    const internalPackagesHash = combineHashOfInternalPackages(
      completedPackages
    );
    const buildCommandHash = hashStrings(this.buildCommandSignature);
    const combinedHash = hashStrings([internalPackagesHash, buildCommandHash]);

    logger.verbose(`Hash of internal packages: ${internalPackagesHash}`);
    logger.verbose(`Hash of build command: ${buildCommandHash}`);
    logger.verbose(`Combined hash: ${combinedHash}`);

    logger.profile(`hasher:calculateHash-${location}`);
    logger.setHash(combinedHash);

    return combinedHash;
  }

  public async createHashOfPackages(
    packagesToHash: string[],
    repoRoot: string
  ) {
    const yarnLock = await parseLockFile(repoRoot);
    const completedPackages: PackageHashInfo[] = [];
    const packageResults = [];

    for (let index = 0; index < packagesToHash.length; index++) {
      const element = packagesToHash[index];

      const result = await this.createPackageHash(
        element,
        completedPackages,
        yarnLock
      );

      packageResults.push(result);
    }

    return packageResults;
  }

  public async hashOfOutput(): Promise<string> {
    const outputFolderGlob = outputFolderAsArray(this.outputFolder).map(
      p => `${p}/**`
    );

    return generateHashOfFiles(this.packageRoot, outputFolderGlob);
  }
}
