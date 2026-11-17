import type { PaseoApi, PaseoProject, PaseoWorkspace } from "@getpaseo/client";
import path from "node:path";
import type { CatalogueProject } from "../shared/environment";
import { EnvironmentStore, projectScope, type ProjectScope } from "./store";

export type ProjectReference = Pick<
  PaseoProject,
  "projectId" | "projectDisplayName" | "projectRootPath"
>;
export type WorkspaceReference = Pick<
  PaseoWorkspace,
  "id" | "name" | "projectId" | "projectDisplayName" | "projectRootPath" | "workspaceDirectory"
>;
interface CatalogueOptions {
  store: EnvironmentStore;
  projects: ProjectReference[];
  workspaces: WorkspaceReference[];
  bindings: ProjectScope[];
  resolveScope?: typeof projectScope;
}
interface Location {
  directory: string;
  name: string;
  root: string;
  workspace: CatalogueProject["workspaces"][number] | null;
}

export async function readWorkspaceDirectory(paseo: PaseoApi): Promise<WorkspaceReference[]> {
  const entries: WorkspaceReference[] = [];
  let cursor: string | undefined;
  do {
    const page = await paseo.workspaces.list({
      includeBackground: true,
      page: { limit: 200, cursor },
    });
    entries.push(...page.entries);
    cursor = page.pageInfo.nextCursor ?? undefined;
  } while (cursor);
  return entries;
}

export async function buildVariableCatalogue({
  store,
  projects,
  workspaces,
  bindings,
  resolveScope = projectScope,
}: CatalogueOptions) {
  const saved = await store.catalogue();
  if (!saved.length) return { projects: [], unavailableDirectories: 0 };
  const locations: Location[] = projects.map((project) => ({
    directory: project.projectRootPath,
    root: project.projectRootPath,
    name: project.projectDisplayName,
    workspace: null,
  }));
  for (const workspace of workspaces) {
    locations.push({
      directory: workspace.workspaceDirectory,
      root: workspace.projectRootPath,
      name: workspace.projectDisplayName,
      workspace: {
        id: workspace.id,
        name: workspace.name,
        directory: workspace.workspaceDirectory,
      },
    });
  }
  const resolved = new Map<string, ProjectScope | null>();
  const directories = [...new Set(locations.map((location) => location.directory))];
  // Limit Git subprocesses while resolving worktree ownership, once per directory.
  for (let offset = 0; offset < directories.length; offset += 8) {
    await Promise.all(
      directories.slice(offset, offset + 8).map(async (directory) => {
        try {
          resolved.set(directory, await resolveScope(directory));
        } catch {
          resolved.set(directory, null);
        }
      }),
    );
  }
  const result: CatalogueProject[] = saved.map((entry) => {
    const matches = locations.filter(
      (location) => resolved.get(location.directory)?.id === entry.scopeId,
    );
    const binding = bindings.find((scope) => scope.id === entry.scopeId);
    const directory = matches[0]?.root ?? entry.directory ?? binding?.cwd ?? null;
    const name =
      matches[0]?.name ?? (directory ? path.basename(directory) : "Unidentified project");
    const uniqueWorkspaces = new Map<string, CatalogueProject["workspaces"][number]>();
    for (const location of matches) {
      if (location.workspace) uniqueWorkspaces.set(location.workspace.id, location.workspace);
    }
    const availableWorkspaces = [...uniqueWorkspaces.values()].toSorted((a, b) =>
      a.name.localeCompare(b.name),
    );
    return {
      scopeId: entry.scopeId,
      name,
      directory,
      workspaces: availableWorkspaces,
      variables: entry.variables,
    };
  });
  const unavailableDirectories = [...resolved.values()].filter((scope) => scope === null).length;
  return {
    projects: result.toSorted(
      (a, b) => a.name.localeCompare(b.name) || a.scopeId.localeCompare(b.scopeId),
    ),
    unavailableDirectories,
  };
}
