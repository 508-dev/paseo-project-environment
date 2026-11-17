import { useMemo } from "react";
import { Text, View } from "react-native";
import { TextInput } from "@getpaseo/plugin/client/ui";
import type { PluginTheme } from "@getpaseo/plugin";

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
  const styles = useMemo(
    () => ({
      field: { gap: 6 },
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
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={accessibilityLabel ?? label}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secure}
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
