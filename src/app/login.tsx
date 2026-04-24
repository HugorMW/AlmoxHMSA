import { Redirect, useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  ActionButton,
  FieldInput,
  FormField,
  InfoBanner,
} from "@/features/almox/components/common";
import { almoxTheme } from "@/features/almox/tokens";
import { useAuth } from "@/features/auth/auth-provider";

export default function LoginScreen() {
  const router = useRouter();
  const { login, status } = useAuth();
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorLines = error
    ? error.split("\n").filter((line) => line.trim().length > 0)
    : [];

  if (status === "authenticated") {
    return <Redirect href="/" />;
  }

  async function handleSubmit() {
    if (submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await login(usuario, senha);
      router.replace("/");
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : "Falha ao autenticar no SISCORE.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.screen}>
      <View pointerEvents="none" style={[styles.glow, styles.glowTop]} />
      <View pointerEvents="none" style={[styles.glow, styles.glowBottom]} />

      <View style={styles.card}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark}>
            <Text style={styles.brandLetter}>H</Text>
          </View>
          <View style={styles.brandText}>
            <Text style={styles.brandEyebrow}>Central logística HMSA</Text>
            <Text style={styles.title}>Entrar no painel</Text>
            <Text style={styles.subtitle}>
              Use seu usuário do SISCORE para liberar o acesso ao painel
              operacional.
            </Text>
          </View>
        </View>

        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Falha na autenticação</Text>
            {errorLines.map((line, index) => (
              <Text
                key={`${index}-${line}`}
                style={index === 0 ? styles.errorPrimary : styles.errorDetail}
              >
                {index === 0 ? line : `• ${line}`}
              </Text>
            ))}
          </View>
        ) : (
          <InfoBanner
            title="Autenticação temporária do app"
            description="Este login só libera o uso da interface. Os dados continuam vindo do banco atual, sem criar conta nova no Supabase."
            tone="info"
          />
        )}

        <View style={styles.form}>
          <FormField label="Usuário SISCORE">
            <FieldInput
              value={usuario}
              onChangeText={setUsuario}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Digite seu usuário"
              editable={!submitting}
              returnKeyType="next"
            />
          </FormField>

          <FormField label="Senha SISCORE">
            <FieldInput
              value={senha}
              onChangeText={setSenha}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Digite sua senha"
              secureTextEntry
              editable={!submitting}
              returnKeyType="done"
              onSubmitEditing={() => void handleSubmit()}
            />
          </FormField>
        </View>

        <View style={styles.actions}>
          <ActionButton
            label={submitting ? "Validando acesso..." : "Entrar"}
            tone="primary"
            onPress={() => void handleSubmit()}
            disabled={submitting || !usuario.trim() || !senha.trim()}
          />
        </View>

        <Pressable
          onPress={() => router.replace("/")}
          style={styles.footerLink}
        >
          <Text style={styles.footerText}>Voltar para a rota principal</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: almoxTheme.spacing.lg,
    backgroundColor: almoxTheme.colors.canvas,
    overflow: "hidden",
  },
  glow: {
    position: "absolute",
    width: 280,
    height: 280,
    borderRadius: 999,
    opacity: 0.1,
  },
  glowTop: {
    top: -120,
    left: -90,
    backgroundColor: almoxTheme.colors.brand,
  },
  glowBottom: {
    bottom: -140,
    right: -100,
    backgroundColor: almoxTheme.colors.emerald,
  },
  card: {
    width: "100%",
    maxWidth: 460,
    borderRadius: almoxTheme.radii.lg,
    borderWidth: 1,
    borderColor: almoxTheme.colors.lineStrong,
    backgroundColor: almoxTheme.colors.surface,
    padding: almoxTheme.spacing.xl,
    gap: almoxTheme.spacing.lg,
    shadowColor: almoxTheme.colors.black,
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 5,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: almoxTheme.spacing.md,
  },
  brandMark: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: almoxTheme.colors.brandStrong,
  },
  brandLetter: {
    color: almoxTheme.colors.white,
    fontSize: 24,
    fontWeight: "900",
  },
  brandText: {
    flex: 1,
    gap: 4,
  },
  brandEyebrow: {
    color: almoxTheme.colors.brand,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  title: {
    color: almoxTheme.colors.text,
    fontSize: 28,
    fontWeight: "800",
    fontFamily: almoxTheme.typography.display,
  },
  subtitle: {
    color: almoxTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  form: {
    gap: almoxTheme.spacing.md,
  },
  errorCard: {
    borderRadius: almoxTheme.radii.md,
    borderWidth: 1,
    borderColor: "#efb4c1",
    backgroundColor: "#fff0f3",
    padding: almoxTheme.spacing.md,
    gap: almoxTheme.spacing.xs,
  },
  errorTitle: {
    color: "#b4234a",
    fontSize: 13,
    fontWeight: "700",
  },
  errorPrimary: {
    color: almoxTheme.colors.text,
    fontSize: 13,
    lineHeight: 20,
  },
  errorDetail: {
    color: almoxTheme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  actions: {
    gap: almoxTheme.spacing.sm,
  },
  footerLink: {
    alignSelf: "center",
  },
  footerText: {
    color: almoxTheme.colors.brandStrong,
    fontSize: 12,
    textDecorationLine: "underline",
  },
});
