import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { Text, View } from "react-native";
import { type PluginWorkspacePanelProps, useRpc, useWorkspace } from "@getpaseo/plugin/client";
import { ScrollView } from "@getpaseo/plugin/client/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { z } from "zod";
import {
  listVariables,
  saveVariable,
  removeVariable,
  type variableInput,
} from "../shared/environment";
import { VariableCard } from "./variable-card";
import { ActionButton } from "./action-button";
import { Field } from "./field";
import { EnvironmentEditor } from "./editor";

export function EnvironmentPanel(props: PluginWorkspacePanelProps) {
  return <WorkspaceEnvironment key={`${props.host.id}:${props.workspaceId}`} {...props} />;
}
function WorkspaceEnvironment({ theme, layout, host, workspaceId }: PluginWorkspacePanelProps) {
  const project = useWorkspace(workspaceId, (workspace) => workspace.projectDisplayName);
  const list = useRpc(listVariables);
  const save = useRpc(saveVariable);
  const remove = useRpc(removeVariable);
  const queryClient = useQueryClient();
  const variables = useQuery({
    queryKey: ["project-environment", host.id, workspaceId],
    queryFn: () => list({ workspaceId }),
  });
  const [notice, setNotice] = useState("");
  const invalidate = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["project-environment"] }),
      queryClient.invalidateQueries({ queryKey: ["project-environment-catalogue"] }),
    ]);
  }, [queryClient]);
  const saveExisting = useCallback(
    async (variable: z.infer<typeof variableInput>) => {
      setNotice("");
      await save({ workspaceId, variable });
      await invalidate();
    },
    [save, workspaceId, invalidate],
  );
  const removeExisting = useCallback(
    async (name: string) => {
      setNotice("");
      await remove({ workspaceId, name });
      setNotice(`${name} removed.`);
      await invalidate();
    },
    [remove, workspaceId, invalidate],
  );
  const [editor] = useState(() => new EnvironmentEditor({ save: saveExisting }));
  const form = useSyncExternalStore(editor.subscribe, editor.getState);
  const pending = form.status === "pending";
  const styles = useMemo(
    () => ({
      screen: { flex: 1, backgroundColor: theme.colors.surface0 },
      content: {
        padding: layout.compact ? 16 : 24,
        gap: 20,
        maxWidth: 900,
        width: "100%" as const,
        alignSelf: "center" as const,
      },
      heading: { gap: 6 },
      title: { color: theme.colors.foreground, fontSize: 16, fontWeight: "600" as const },
      subtitle: { color: theme.colors.foreground, fontSize: 14, fontWeight: "600" as const },
      detail: { color: theme.colors.foregroundMuted, fontSize: 13 },
      error: { color: theme.colors.statusDanger, fontSize: 13 },
      success: { color: theme.colors.statusSuccess, fontSize: 13 },
      section: { gap: 12 },
      form: {
        padding: 16,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
        gap: 12,
      },
      actions: { flexDirection: "row" as const, gap: 8 },
    }),
    [theme, layout.compact],
  );
  const { refetch } = variables;
  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);
  const setName = useCallback((text: string) => editor.set("name", text), [editor]);
  const setDescription = useCallback((text: string) => editor.set("description", text), [editor]);
  const setValue = useCallback((text: string) => editor.set("value", text), [editor]);
  const submit = useCallback(() => {
    const existingNames = variables.data?.variables.map((variable) => variable.name) ?? [];
    void editor.save(existingNames);
  }, [editor, variables.data]);
  let messageStyle = styles.detail;
  if (form.status === "error") messageStyle = styles.error;
  if (form.status === "saved") messageStyle = styles.success;
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.heading}>
        <Text style={styles.title}>Project environment</Text>
        <Text style={styles.detail}>
          Shared across {project ?? "this project"} and its worktrees. Changes apply to the next
          environment command.
        </Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.subtitle}>Saved variables</Text>
        {notice ? (
          <Text accessibilityRole="alert" style={styles.success}>
            {notice}
          </Text>
        ) : null}
        {variables.isPending ? <Text style={styles.detail}>Loading…</Text> : null}
        {variables.isError ? (
          <>
            <Text style={styles.error}>Could not load variables.</Text>
            <ActionButton label="Retry" onPress={retry} theme={theme} />
          </>
        ) : null}
        {variables.data?.variables.length === 0 ? (
          <Text style={styles.detail}>No variables yet.</Text>
        ) : null}
        {variables.data?.variables.map((variable) => (
          <VariableCard
            key={variable.name}
            workspaceId={workspaceId}
            name={variable.name}
            description={variable.description}
            theme={theme}
            save={saveExisting}
            remove={removeExisting}
          />
        ))}
      </View>
      <View style={styles.form}>
        <Text style={styles.subtitle}>Add variable</Text>
        <Field
          label="Variable name"
          value={form.name}
          placeholder="STRIPE_API_KEY"
          onChangeText={setName}
          theme={theme}
          disabled={pending}
        />
        <Field
          label="Description"
          value={form.description}
          placeholder="What this variable is used for"
          onChangeText={setDescription}
          theme={theme}
          disabled={pending}
        />
        <Field
          label="Value"
          value={form.value}
          secure
          onChangeText={setValue}
          theme={theme}
          disabled={pending}
        />
        <View style={styles.actions}>
          <ActionButton
            label={pending ? "Adding…" : "Add variable"}
            onPress={submit}
            theme={theme}
            variant="primary"
            disabled={pending || !variables.isSuccess}
          />
        </View>
        {form.message ? (
          <Text accessibilityRole="alert" style={messageStyle}>
            {form.message}
          </Text>
        ) : null}
      </View>
      <Text style={styles.detail}>
        Values stay hidden until you choose Reveal or Copy. Commands using a variable can access it
        and call APIs with it.
      </Text>
    </ScrollView>
  );
}
