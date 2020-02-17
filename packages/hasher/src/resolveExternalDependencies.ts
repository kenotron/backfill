import { nameAtVersion } from "./helpers";
import { ParsedYarnLock, queryLockFile } from "./yarnLock";
import { WorkspaceInfo, listOfWorkspacePackageNames } from "./yarnWorkspaces";

export type Dependencies = { [key in string]: string };

export type ExternalDependenciesQueue = {
  name: string;
  versionRange: string;
}[];

export function filterExternalDependencies(
  dependencies: Dependencies,
  workspaces: WorkspaceInfo
): Dependencies {
  const workspacePackageNames = listOfWorkspacePackageNames(workspaces);
  const externalDependencies: Dependencies = {};

  Object.entries(dependencies).forEach(([name, versionRange]) => {
    if (workspacePackageNames.indexOf(name) < 0) {
      externalDependencies[name] = versionRange;
    }
  });

  return externalDependencies;
}

function isCompleted(packageInfo: string[], key: string): boolean {
  return packageInfo.indexOf(key) >= 0;
}

function isInQueue(queue: [string, string][], key: string): boolean {
  return Boolean(
    queue.find(
      ([name, versionRange]) => nameAtVersion(name, versionRange) === key
    )
  );
}

export function addToQueue(
  dependencies: Dependencies | undefined,
  completedDependencies: string[],
  queue: [string, string][]
): void {
  if (dependencies) {
    Object.entries(dependencies).forEach(([name, versionRange]) => {
      const versionRangeSignature = nameAtVersion(name, versionRange);

      if (
        !isCompleted(completedDependencies, versionRangeSignature) &&
        !isInQueue(queue, versionRangeSignature)
      ) {
        queue.push([name, versionRange]);
      }
    });
  }
}

export function resolveExternalDependencies(
  allDependencies: Dependencies,
  workspaces: WorkspaceInfo,
  yarnLock: ParsedYarnLock
): string[] {
  const externalDependencies = filterExternalDependencies(
    allDependencies,
    workspaces
  );

  const completedDependencies = [];
  const doneRange = [];
  const queue = Object.entries(externalDependencies);

  while (queue.length > 0) {
    const next = queue.shift();

    if (!next) {
      continue;
    }

    const [name, versionRange] = next;
    doneRange.push(nameAtVersion(name, versionRange));

    const lockFileResult = queryLockFile(name, versionRange, yarnLock);

    if (lockFileResult) {
      const { version, dependencies } = lockFileResult;

      addToQueue(dependencies, doneRange, queue);
      completedDependencies.push(nameAtVersion(name, version));
    } else {
      completedDependencies.push(nameAtVersion(name, versionRange));
    }
  }

  return completedDependencies;
}
