import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, test } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { z } from "zod";
import { EnvironmentBroker } from "./broker";
import { EnvironmentStore, projectScope } from "./store";
import { execute, redact } from "./execute";
import { buildVariableCatalogue } from "./catalogue";
import {
  filterVariableCatalogue,
  variableCatalogue,
  readVariableValue,
} from "../shared/environment";
import { VariableValueController } from "../client/value-controller";
import { SavedVariableEditor } from "../client/saved-variable-editor";
import { EnvironmentEditor } from "../client/editor";

const execFileAsync = promisify(execFile);
const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  for (const close of cleanup.toReversed()) await close();
  cleanup.length = 0;
});
async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), "paseo-environment-"));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  const scope = await projectScope(directory);
  const store = new EnvironmentStore(path.join(directory, "data"));
  return { directory, scope, store };
}
function quote(value: string): string {
  return "'" + value.replaceAll("'", "'\\''") + "'";
}
function node(script: string): string {
  return `${quote(process.execPath)} -e ${quote(script)}`;
}
function toolText(result: unknown): string {
  const response = z
    .object({
      content: z.array(z.object({ type: z.literal("text"), text: z.string() })),
      isError: z.boolean().optional(),
    })
    .parse(result);
  expect(response.isError).not.toBe(true);
  return response.content.map((entry) => entry.text).join("");
}

test("persists variables privately, serializes edits, and scopes them by project", async () => {
  const { directory, scope, store } = await fixture();
  await Promise.all([
    store.save(scope, { name: "FIRST_KEY", description: "first", value: "first-private-value" }),
    store.save(scope, { name: "SECOND_KEY", description: "second", value: "second-private-value" }),
  ]);
  const reopened = new EnvironmentStore(path.join(directory, "data"));
  expect((await reopened.read(scope)).map((variable) => variable.name)).toEqual([
    "FIRST_KEY",
    "SECOND_KEY",
  ]);
  const document = path.join(directory, "data", `${scope.id}.json`);
  expect((await stat(document)).mode & 0o777).toBe(0o600);
  expect((await stat(path.dirname(document))).mode & 0o777).toBe(0o700);
  const other = await fixture();
  expect(await reopened.read(other.scope)).toEqual([]);
  await reopened.remove(scope, "FIRST_KEY");
  expect((await store.read(scope)).map((variable) => variable.name)).toEqual(["SECOND_KEY"]);
});

test("Git worktrees share variables while retaining their own command directory", async () => {
  const { directory, store } = await fixture();
  await execFileAsync("git", ["init", "--initial-branch=main", directory]);
  await execFileAsync("git", [
    "-C",
    directory,
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.com",
    "commit",
    "--allow-empty",
    "-m",
    "Initial",
  ]);
  const worktree = path.join(directory, "worktree");
  await execFileAsync("git", ["-C", directory, "worktree", "add", "-b", "other", worktree]);
  const mainScope = await projectScope(directory);
  const worktreeScope = await projectScope(worktree);
  expect(mainScope.id).toBe(worktreeScope.id);
  expect(worktreeScope.cwd).toBe(worktree);
  await store.save(mainScope, { name: "API_KEY", description: "shared", value: "shared-value" });
  const result = await execute({
    store,
    scope: worktreeScope,
    input: { command: "pwd", variables: ["API_KEY"] },
  });
  expect(result.output.trim()).toBe(worktree);
  const catalogue = await buildVariableCatalogue({
    store,
    projects: [
      { projectId: "git-project", projectDisplayName: "Git project", projectRootPath: directory },
    ],
    workspaces: [
      {
        id: "main",
        name: "Main",
        projectId: "git-project",
        projectDisplayName: "Git project",
        projectRootPath: directory,
        workspaceDirectory: directory,
      },
      {
        id: "worktree",
        name: "Worktree",
        projectId: "git-project",
        projectDisplayName: "Git project",
        projectRootPath: directory,
        workspaceDirectory: worktree,
      },
    ],
    bindings: [],
  });
  expect(catalogue.projects).toHaveLength(1);
  expect(catalogue.projects[0].variables).toHaveLength(1);
  expect(catalogue.projects[0].workspaces.map((workspace) => workspace.id)).toEqual([
    "main",
    "worktree",
  ]);
});

test("injects only requested variables, redacts both streams across chunks, and preserves exit codes", async () => {
  const { store, scope } = await fixture();
  await store.save(scope, { name: "API_KEY", description: "api", value: "private-credential-123" });
  await store.save(scope, { name: "OTHER_KEY", description: "other", value: "not-requested" });
  const command = node(
    `const key = process.env.API_KEY; process.stdout.write(key.slice(0,8)); process.stderr.write(key); setTimeout(() => { process.stdout.write(key.slice(8)); console.log(process.env.OTHER_KEY === undefined); process.exitCode = 7; }, 20);`,
  );
  const result = await execute({ store, scope, input: { command, variables: ["API_KEY"] } });
  expect(result.exitCode).toBe(7);
  expect(result.output).toContain("true");
  expect(result.output).toContain("[REDACTED]");
  expect(result.output).not.toContain("private-credential");
  await store.remove(scope, "API_KEY");
  await expect(
    execute({ store, scope, input: { command: "true", variables: ["API_KEY"] } }),
  ).rejects.toThrow("unavailable");
});

test("withholds output on timeout, cancellation, and output overflow", async () => {
  const { store, scope } = await fixture();
  await store.save(scope, { name: "API_KEY", description: "api", value: "private-key" });
  const timeout = await execute({
    store,
    scope,
    input: {
      command: node("process.stdout.write('private'); setInterval(() => {}, 1000)"),
      variables: ["API_KEY"],
      timeoutMs: 100,
    },
  });
  expect(timeout.stopped).toBe("timeout");
  expect(timeout.output).not.toContain("private");
  const controller = new AbortController();
  const execution = execute({
    store,
    scope,
    signal: controller.signal,
    input: { command: "sleep 30", variables: ["API_KEY"] },
  });
  const timer = setTimeout(() => controller.abort(), 50);
  try {
    expect((await execution).stopped).toBe("canceled");
  } finally {
    clearTimeout(timer);
  }
  const overflow = await execute({
    store,
    scope,
    input: { command: node("process.stdout.write('x'.repeat(1100000))"), variables: ["API_KEY"] },
  });
  expect(overflow.stopped).toBe("output_limit");
  expect(overflow.output).toBe("Command stopped; output withheld.");
});

test("redacts overlapping and repeated literal values", () => {
  expect(redact("abc-long abc abc-long", ["abc", "abc-long", "abc"])).toBe(
    "[REDACTED] [REDACTED] [REDACTED]",
  );
});

test("the same MCP client uses an updated API key without reopening its agent", async () => {
  const { directory, scope } = await fixture();
  const broker = new EnvironmentBroker(path.join(directory, "broker"));
  await broker.start();
  cleanup.push(() => broker.close());
  const url = await broker.endpoint(scope);
  const received: string[] = [];
  const api = createServer((request, response) => {
    received.push(request.headers.authorization ?? "");
    response
      .writeHead(200, { "Content-Type": "application/json" })
      .end(JSON.stringify({ customers: ["customer-1"] }));
  });
  await new Promise<void>((resolve) => api.listen(0, "127.0.0.1", resolve));
  cleanup.push(
    () =>
      new Promise<void>((resolve, reject) =>
        api.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        }),
      ),
  );
  const address = api.address();
  if (!address || typeof address === "string") throw new Error("No API port");
  const client = new Client({ name: "environment-test", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));
  cleanup.push(() => client.close());
  const tools = await client.listTools();
  expect(tools.tools.map((tool) => tool.name)).toEqual([
    "project_environment_list",
    "project_environment_run",
  ]);
  const command = node(
    `fetch('http://127.0.0.1:${address.port}', { headers: { Authorization: 'Bearer ' + process.env.API_KEY } }).then(r => r.text()).then(console.log)`,
  );
  await broker.store.save(scope, {
    name: "API_KEY",
    description: "Customer API",
    value: "first-private-key",
  });
  const listed = toolText(
    await client.callTool({ name: "project_environment_list", arguments: {} }),
  );
  expect(listed).toContain("Customer API");
  expect(listed).not.toContain("first-private-key");
  expect(
    toolText(
      await client.callTool({
        name: "project_environment_run",
        arguments: { command, variables: ["API_KEY"] },
      }),
    ),
  ).toContain("customer-1");
  await broker.store.save(scope, {
    name: "API_KEY",
    description: "Customer API",
    value: "updated-private-key",
  });
  expect(
    toolText(
      await client.callTool({
        name: "project_environment_run",
        arguments: { command, variables: ["API_KEY"] },
      }),
    ),
  ).toContain("customer-1");
  expect(received).toEqual(["Bearer first-private-key", "Bearer updated-private-key"]);
  await broker.close();
  const restarted = new EnvironmentBroker(path.join(directory, "broker"));
  await restarted.start();
  cleanup.push(() => restarted.close());
  expect(await restarted.endpoint(scope)).toBe(url);
  const afterReload = toolText(
    await client.callTool({ name: "project_environment_list", arguments: {} }),
  );
  expect(afterReload).toContain("Customer API");
  expect(afterReload).not.toContain("updated-private-key");
  expect(await readFile(path.join(directory, "broker", "broker.json"), "utf8")).not.toContain(
    "private-key",
  );
});

test("the editor clears entered secrets and does not expose transport errors", async () => {
  const saved: string[] = [];
  const editor = new EnvironmentEditor({
    async save(variable) {
      saved.push(variable.value);
      throw new Error(variable.value);
    },
  });
  editor.set("name", "API_KEY");
  editor.set("value", "private-value");
  await editor.save();
  expect(saved).toEqual(["private-value"]);
  expect(JSON.stringify(editor.getState())).not.toContain("private-value");
  expect(editor.getState().status).toBe("error");
});

test("the searchable catalogue contains names and descriptions, never saved values", async () => {
  const { directory, scope, store } = await fixture();
  await store.save(scope, {
    name: "SERVICE_API_KEY",
    description: "Billing sandbox",
    value: "unique-secret-search-needle",
  });
  const result = await buildVariableCatalogue({
    store,
    projects: [{ projectId: "billing", projectDisplayName: "Billing", projectRootPath: directory }],
    workspaces: [],
    bindings: [],
  });
  expect(result.projects[0].name).toBe("Billing");
  expect(result.projects[0].variables).toEqual([
    { name: "SERVICE_API_KEY", description: "Billing sandbox" },
  ]);
  expect(filterVariableCatalogue(result.projects, "service_api")).toHaveLength(1);
  expect(filterVariableCatalogue(result.projects, "BILLING sandbox")).toHaveLength(1);
  expect(filterVariableCatalogue(result.projects, "unique-secret-search-needle")).toEqual([]);
  expect(JSON.stringify(result)).not.toContain("unique-secret-search-needle");
  const injected = structuredClone(result);
  Object.assign(injected.projects[0].variables[0], { value: "unique-secret-search-needle" });
  expect(variableCatalogue.output.safeParse(injected).success).toBe(false);
  expect(await store.readValue(scope, "SERVICE_API_KEY")).toBe("unique-secret-search-needle");
});

test("legacy variables remain discoverable after their workspace disappears", async () => {
  const { directory, scope, store } = await fixture();
  await store.save(scope, {
    name: "LEGACY_KEY",
    description: "Old service",
    value: "legacy-private-value",
  });
  const file = path.join(directory, "data", `${scope.id}.json`);
  await writeFile(
    file,
    JSON.stringify({
      variables: [
        { name: "LEGACY_KEY", description: "Old service", value: "legacy-private-value" },
      ],
    }),
  );
  const before = await readFile(file, "utf8");
  const result = await buildVariableCatalogue({
    store,
    projects: [
      {
        projectId: "missing",
        projectDisplayName: "Missing",
        projectRootPath: path.join(directory, "deleted"),
      },
    ],
    workspaces: [],
    bindings: [scope],
  });
  expect(result.projects[0].directory).toBe(directory);
  expect(result.projects[0].workspaces).toEqual([]);
  expect(result.unavailableDirectories).toBe(1);
  expect(filterVariableCatalogue(result.projects, "old service")).toHaveLength(1);
  expect(await readFile(file, "utf8")).toBe(before);
  expect(JSON.stringify(result)).not.toContain("legacy-private-value");
  const orphaned = await buildVariableCatalogue({
    store,
    projects: [],
    workspaces: [],
    bindings: [],
  });
  expect(orphaned.projects[0].name).toBe("Unidentified project");
  expect(orphaned.projects[0].variables[0].name).toBe("LEGACY_KEY");
});

test("different projects stay separate and shared workspaces are grouped once", async () => {
  const first = await fixture();
  const second = await fixture();
  await first.store.save(first.scope, {
    name: "API_KEY",
    description: "First",
    value: "first-private",
  });
  await first.store.save(second.scope, {
    name: "API_KEY",
    description: "Second",
    value: "second-private",
  });
  const result = await buildVariableCatalogue({
    store: first.store,
    projects: [
      { projectId: "first", projectDisplayName: "First", projectRootPath: first.directory },
      { projectId: "second", projectDisplayName: "Second", projectRootPath: second.directory },
    ],
    workspaces: [
      {
        id: "one",
        name: "First workspace",
        projectId: "first",
        projectDisplayName: "First",
        projectRootPath: first.directory,
        workspaceDirectory: first.directory,
      },
      {
        id: "two",
        name: "Second workspace",
        projectId: "first",
        projectDisplayName: "First",
        projectRootPath: first.directory,
        workspaceDirectory: first.directory,
      },
    ],
    bindings: [],
  });
  expect(result.projects).toHaveLength(2);
  expect(result.projects[0].workspaces.map((workspace) => workspace.id)).toEqual(["one", "two"]);
  expect(result.projects[0].variables).toHaveLength(1);
  expect(result.projects[1].workspaces).toEqual([]);
  expect(await first.store.readValue(second.scope, "API_KEY")).toBe("second-private");
  expect(
    readVariableValue.input.safeParse({
      target: { kind: "project", scopeId: "../outside" },
      name: "API_KEY",
    }).success,
  ).toBe(false);
});

test("values are fetched only by explicit actions and Copy reads the current value", async () => {
  let reads = 0;
  const copied: string[] = [];
  const controller = new VariableValueController({
    async read() {
      reads += 1;
      return `private-${reads}`;
    },
    async copy(value) {
      copied.push(value);
    },
  });
  expect(reads).toBe(0);
  await controller.reveal();
  expect(controller.getState().revealed).toBe("private-1");
  controller.hide();
  expect(controller.getState().revealed).toBeNull();
  await controller.copy();
  expect(copied).toEqual(["private-2"]);
  expect(JSON.stringify(controller.getState())).not.toContain("private-");
  expect(controller.getState().message).toBe("Copied to clipboard.");
  controller.hide();
});

test("hiding a value cancels a late reveal and errors do not expose credentials", async () => {
  const resolveReads: Array<(value: string) => void> = [];
  const controller = new VariableValueController({
    read: () => new Promise((resolve) => resolveReads.push(resolve)),
    async copy() {},
  });
  const pending = controller.reveal();
  controller.hide();
  resolveReads[0]("late-private-value");
  await pending;
  expect(controller.getState().revealed).toBeNull();
  const failing = new VariableValueController({
    async read() {
      return "private-copy-value";
    },
    async copy(value) {
      throw new Error(value);
    },
  });
  await failing.copy();
  expect(failing.getState().message).toContain("Could not copy");
  expect(JSON.stringify(failing.getState())).not.toContain("private-copy-value");
});

test("replacement stays in its own card and gives local success feedback", async () => {
  const saved: Array<{ name: string; value: string; description: string }> = [];
  const adding = new EnvironmentEditor({ async save() {} });
  adding.set("name", "UNRELATED_NEW_KEY");
  adding.set("value", "new-draft-value");
  const replacing = new SavedVariableEditor("EXISTING_KEY", {
    async save(variable) {
      saved.push(variable);
    },
    async remove() {},
  });
  replacing.beginReplacement("Old description");
  replacing.set("description", "Updated description");
  replacing.set("value", "replacement-private-value");
  await replacing.save();
  expect(saved).toEqual([
    {
      name: "EXISTING_KEY",
      description: "Updated description",
      value: "replacement-private-value",
    },
  ]);
  expect(replacing.getState().mode).toBe("view");
  expect(replacing.getState().status).toBe("success");
  expect(replacing.getState().message).toContain("Value updated");
  expect(JSON.stringify(replacing.getState())).not.toContain("replacement-private-value");
  expect(adding.getState().name).toBe("UNRELATED_NEW_KEY");
  expect(adding.getState().value).toBe("new-draft-value");
});

test("Cancel clears a replacement and removal requires a confirmation in that card", async () => {
  let saves = 0;
  let removals = 0;
  const editor = new SavedVariableEditor("API_KEY", {
    async save() {
      saves += 1;
    },
    async remove() {
      removals += 1;
    },
  });
  editor.beginReplacement("API key");
  editor.set("value", "discarded-draft-value");
  editor.cancel();
  expect(editor.getState().value).toBe("");
  expect(editor.getState().mode).toBe("view");
  await editor.save();
  await editor.remove();
  expect(saves).toBe(0);
  expect(removals).toBe(0);
  editor.confirmRemove();
  editor.cancel();
  await editor.remove();
  expect(removals).toBe(0);
  editor.confirmRemove();
  await editor.remove();
  expect(removals).toBe(1);
  expect(editor.getState().message).toBe("API_KEY removed.");
});

test("a failed replacement clears its value and leaves an actionable error in that card", async () => {
  const editor = new SavedVariableEditor("API_KEY", {
    async save(variable) {
      throw new Error(variable.value);
    },
    async remove() {},
  });
  editor.beginReplacement("API");
  editor.set("value", "private-replacement");
  await editor.save();
  expect(editor.getState().mode).toBe("replace");
  expect(editor.getState().status).toBe("error");
  expect(editor.getState().message).toContain("Re-enter the value");
  expect(JSON.stringify(editor.getState())).not.toContain("private-replacement");
});

test("the Add form directs existing names to their own Replace action", async () => {
  let saves = 0;
  const editor = new EnvironmentEditor({
    async save() {
      saves += 1;
    },
  });
  editor.set("name", "API_KEY");
  editor.set("value", "draft-value");
  await editor.save(["API_KEY"]);
  expect(saves).toBe(0);
  expect(editor.getState().message).toContain("Use Replace on its card");
});
