"use client";

import { FormEvent, useState } from "react";
import styles from "./login.module.css";

export default function LoginForm({ returnTo }: { returnTo: string }) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setLoading(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: form.get("password"), returnTo }) });
      const data = (await response.json()) as { error?: string; returnTo?: string };
      if (!response.ok) throw new Error(data.error || "No se pudo iniciar sesión.");
      window.location.assign(data.returnTo || "/");
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "No se pudo iniciar sesión."); setLoading(false);
    }
  }
  return <form onSubmit={submit} className={styles.form}>
    <label htmlFor="password">Contraseña</label>
    <input id="password" name="password" type="password" autoComplete="current-password" required autoFocus />
    {error ? <p className={styles.error}>{error}</p> : null}
    <button type="submit" disabled={loading}>{loading ? "Ingresando…" : "Entrar a Nexo"}</button>
  </form>;
}
