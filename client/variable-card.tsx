import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { Text, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { ActionButton } from "./action-button";
import { Field } from "./field";
import { SavedVariableEditor } from "./saved-variable-editor";
import { ValueControls } from "./value";
import type { variableInput } from "../shared/environment";
import type { z } from "zod";

interface VariableCardProps {
  workspaceId: string;
  name: string;
  description: string;
  theme: PluginTheme;
  save(variable: z.infer<typeof variableInput>): Promise<void>;
  remove(name: string): Promise<void>;
}
export function VariableCard({
  workspaceId,
  name,
  description,
  theme,
  save,
  remove,
}: VariableCardProps) {
  const [editor] = useState(() => new SavedVariableEditor(name, { save, remove }));
  const state = useSyncExternalStore(editor.subscribe, editor.getState);
  const pending = state.status === "pending";
  const begin = useCallback(() => editor.beginReplacement(description), [editor, description]);
  const setDescription = useCallback((text: string) => editor.set("description", text), [editor]);
  const setValue = useCallback((text: string) => editor.set("value", text), [editor]);
  const submit = useCallback(() => {
    void editor.save();
  }, [editor]);
  const confirm = useCallback(() => {
    void editor.remove();
  }, [editor]);
  const target = useMemo(() => ({ kind: "workspace" as const, workspaceId }), [workspaceId]);
  const styles = useMemo(
    () => ({
      card: {
        padding: 16,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
        gap: 12,
      },
      title: { color: theme.colors.foreground, fontSize: 14, fontWeight: "600" as const },
      description: { color: theme.colors.foregroundMuted, fontSize: 13 },
      actions: {
        flexDirection: "row" as const,
        flexWrap: "wrap" as const,
        gap: 8,
        alignItems: "center" as const,
      },
      confirmation: {
        padding: 12,
        borderRadius: 8,
        backgroundColor: theme.colors.surface2,
        gap: 10,
      },
      success: { color: theme.colors.statusSuccess, fontSize: 13 },
      error: { color: theme.colors.statusDanger, fontSize: 13 },
    }),
    [theme],
  );
  let messageStyle = styles.description;
  if (state.status === "error") messageStyle = styles.error;
  if (state.status === "success") messageStyle = styles.success;
  return (
    <View style={styles.card}>
      <Text selectable style={styles.title}>
        {name}
      </Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
      {state.mode === "view" ? (
        <ValueControls target={target} name={name} theme={theme}>
          <ActionButton label="Replace" onPress={begin} theme={theme} />
          <ActionButton label="Remove" onPress={editor.confirmRemove} theme={theme} />
        </ValueControls>
      ) : null}
      {state.mode === "replace" ? (
        <>
          <Field
            label="New value"
            accessibilityLabel={`New value for ${name}`}
            value={state.value}
            onChangeText={setValue}
            theme={theme}
            secure
            disabled={pending}
          />
          <Field
            label="Description"
            accessibilityLabel={`Description for ${name}`}
            value={state.description}
            onChangeText={setDescription}
            theme={theme}
            disabled={pending}
          />
          <View style={styles.actions}>
            <ActionButton
              label={pending ? "Saving…" : "Save replacement"}
              onPress={submit}
              theme={theme}
              variant="primary"
              disabled={pending}
            />
            <ActionButton label="Cancel" onPress={editor.cancel} theme={theme} disabled={pending} />
          </View>
        </>
      ) : null}
      {state.mode === "confirm-remove" ? (
        <View style={styles.confirmation}>
          <Text style={styles.description}>
            Remove this saved variable? Commands already running keep their value.
          </Text>
          <View style={styles.actions}>
            <ActionButton label="Cancel" onPress={editor.cancel} theme={theme} disabled={pending} />
            <ActionButton
              label={pending ? "Removing…" : "Confirm remove"}
              onPress={confirm}
              theme={theme}
              variant="destructive"
              disabled={pending}
            />
          </View>
        </View>
      ) : null}
      {state.message ? (
        <Text accessibilityRole="alert" style={messageStyle}>
          {state.message}
        </Text>
      ) : null}
    </View>
  );
}
