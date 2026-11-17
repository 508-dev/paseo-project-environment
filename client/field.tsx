import { useCallback, useEffect, useMemo, useState } from "react";
import { AppState, Text, View } from "react-native";
import { TextInput } from "@getpaseo/plugin/client/ui";
import type { PluginTheme } from "@getpaseo/plugin";

import { ActionButton } from "./action-button";

interface FieldProps {
  label: string;
  value: string;
  onChangeText(value: string): void;
  theme: PluginTheme;
  accessibilityLabel?: string;
  placeholder?: string;
  secure?: boolean;
  disabled?: boolean;
}
export function Field({
  label,
  value,
  onChangeText,
  theme,
  accessibilityLabel,
  placeholder,
  secure = false,
  disabled = false,
}: FieldProps) {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (!value || disabled) setRevealed(false);
  }, [value, disabled]);
  useEffect(() => {
    if (!secure) return;
    const subscription = AppState.addEventListener("change", (next) => {
      if (next !== "active") setRevealed(false);
    });
    return () => subscription.remove();
  }, [secure]);
  const toggleVisibility = useCallback(() => setRevealed((shown) => !shown), []);
  const styles = useMemo(
    () => ({
      field: { gap: 6 },
      header: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        justifyContent: "space-between" as const,
        gap: 8,
        flexWrap: "wrap" as const,
      },
      label: { color: theme.colors.foregroundMuted, fontSize: 13 },
      input: {
        minHeight: 42,
        paddingHorizontal: 12,
        paddingVertical: 9,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
        color: theme.colors.foreground,
        backgroundColor: theme.colors.surface0,
        fontSize: 14,
        opacity: disabled ? 0.6 : 1,
      },
    }),
    [theme, disabled],
  );
  return (
    <View style={styles.field}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        {secure ? (
          <ActionButton
            label={revealed ? "Hide value" : "Show value"}
            onPress={toggleVisibility}
            theme={theme}
            disabled={disabled}
          />
        ) : null}
      </View>
      <TextInput
        accessibilityLabel={accessibilityLabel ?? label}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secure && !revealed}
        editable={!disabled}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.foregroundMuted}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        spellCheck={false}
        style={styles.input}
      />
    </View>
  );
}
