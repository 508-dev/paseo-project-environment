import { useMemo } from "react";
import { Pressable, Text } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";

interface ActionButtonProps {
  label: string;
  onPress(): void;
  theme: PluginTheme;
  disabled?: boolean;
  variant?: "outline" | "primary" | "destructive";
}
export function ActionButton({
  label,
  onPress,
  theme,
  disabled = false,
  variant = "outline",
}: ActionButtonProps) {
  const styles = useMemo(() => {
    let backgroundColor = "transparent";
    let color = theme.colors.foreground;
    if (variant === "primary") {
      backgroundColor = theme.colors.accent;
      color = theme.colors.accentForeground;
    }
    if (variant === "destructive") {
      backgroundColor = theme.colors.statusDanger;
      color = theme.colors.accentForeground;
    }
    return {
      button: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        minHeight: 40,
        justifyContent: "center" as const,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor,
        opacity: disabled ? 0.5 : 1,
      },
      text: { color, fontSize: 13, fontWeight: "500" as const },
    };
  }, [theme, variant, disabled]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={styles.button}
    >
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}
