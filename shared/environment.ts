import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const variableName = z
  .string()
  .regex(/^[A-Z_][A-Z0-9_]*$/)
  .max(128);
export const variableMetadata = z.object({ name: variableName, description: z.string().max(500) });
export const variableInput = variableMetadata.extend({
  value: z
    .string()
    .min(1)
    .max(16384)
    .refine((value) => !value.includes("\0"), "Values cannot contain a null character"),
});
const workspace = z.object({ workspaceId: z.string().min(1) });
export const listVariables = defineRpc({
  name: "environment.list",
  input: workspace,
  output: z.object({ variables: z.array(variableMetadata) }),
});
export const saveVariable = defineRpc({
  name: "environment.save",
  input: workspace.extend({ variable: variableInput }),
  output: z.object({}),
});
export const removeVariable = defineRpc({
  name: "environment.remove",
  input: workspace.extend({ name: variableName }),
  output: z.object({}),
});

export const scopeId = z.string().regex(/^[a-f0-9]{64}$/);
export const variableTarget = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("workspace"), workspaceId: z.string().min(1) }),
  z.object({ kind: z.literal("project"), scopeId }),
]);
export type VariableTarget = z.infer<typeof variableTarget>;
export const readVariableValue = defineRpc({
  name: "environment.value",
  input: z.object({ target: variableTarget, name: variableName }),
  output: z.object({ value: z.string() }).strict(),
});

export const catalogueProject = z
  .object({
    scopeId,
    name: z.string(),
    directory: z.string().nullable(),
    workspaces: z.array(
      z.object({ id: z.string(), name: z.string(), directory: z.string() }).strict(),
    ),
    variables: z.array(variableMetadata.strict()),
  })
  .strict();
export type CatalogueProject = z.infer<typeof catalogueProject>;
export const variableCatalogue = defineRpc({
  name: "environment.catalogue",
  input: z.object({}).strict(),
  output: z
    .object({
      projects: z.array(catalogueProject),
      unavailableDirectories: z.number().int().nonnegative(),
    })
    .strict(),
});

export function filterVariableCatalogue(
  projects: CatalogueProject[],
  query: string,
): CatalogueProject[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return projects.flatMap((project) => {
    const variables = project.variables.filter(({ name, description }) => {
      const text = `${name}\n${description}`.toLocaleLowerCase();
      return terms.every((term) => text.includes(term));
    });
    return variables.length ? [{ ...project, variables }] : [];
  });
}
