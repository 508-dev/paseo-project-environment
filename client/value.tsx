import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { AppState, Text, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { copyText } from "@getpaseo/plugin/client/ui";
import { readVariableValue, type VariableTarget } from "../shared/environment";
import { ActionButton } from "./action-button";
import { VariableValueController } from "./value-controller";

interface ValueControlsProps {
  target: VariableTarget;
  name: string;
  theme: PluginTheme;
  disabled?: boolean;
  children?: ReactNode;
}
export function ValueControls({
  target,
  name,
  theme,
  disabled = false,
  children,
}: ValueControlsProps) {
  const read = useRpc(readVariableValue);
  const [controller] = useState(
    () =>
      new VariableValueController({
        async read() {
          const result = await read({ target, name });
          return result.value;
        },
        copy: copyText,
      }),
  );
  const state = useSyncExternalStore(controller.subscribe, controller.getState);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next !== "active") controller.hide();
    });
    return () => {
      subscription.remove();
      controller.hide();
    };
  }, [controller]);
  useEffect(() => {
    if (disabled) controller.hide();
  }, [controller, disabled]);
  const reveal = useCallback(() => {
    if (state.revealed !== null) controller.hide();
    else void controller.reveal();
  }, [controller, state.revealed]);
  const copy = useCallback(() => {
    void controller.copy();
  }, [controller]);
  const styles = useMemo(
    () => ({
      value: {
        color: theme.colors.foreground,
        backgroundColor: theme.colors.surface0,
        padding: 10,
        borderRadius: 6,
        fontSize: 13,
      },
      detail: { color: theme.colors.foregroundMuted, fontSize: 12 },
      error: { color: theme.colors.statusDanger, fontSize: 12 },
      success: { color: theme.colors.statusSuccess, fontSize: 12 },
      actions: {
        flexDirection: "row" as const,
        flexWrap: "wrap" as const,
        gap: 8,
        alignItems: "center" as const,
      },
    }),
    [theme],
  );
  const busy = disabled || state.pending !== null;
  let messageStyle = styles.detail;
  if (state.status === "error") messageStyle = styles.error;
  if (state.status === "success") messageStyle = styles.success;
  let revealLabel = "Reveal";
  if (state.revealed !== null) revealLabel = "Hide";
  if (state.pending === "reveal") revealLabel = "Revealing…";
  return (
    <>
      <View style={styles.actions}>
        <ActionButton label={revealLabel} disabled={busy} onPress={reveal} theme={theme} />
        <ActionButton
          label={state.pending === "copy" ? "Copying…" : "Copy"}
          disabled={busy}
          onPress={copy}
          theme={theme}
        />
        {children}
      </View>
      {state.revealed !== null ? (
        <Text selectable style={styles.value}>
          {state.revealed}
        </Text>
      ) : null}
      {state.message ? (
        <Text accessibilityRole="alert" style={messageStyle}>
          {state.message}
        </Text>
      ) : null}
    </>
  );
}
