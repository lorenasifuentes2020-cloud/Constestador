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
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: form.get("pin"), returnTo }) });
      const data = (await response.json()) as { error?: string; returnTo?: string };
      if (!response.ok) throw new Error(data.error || "No se pudo iniciar sesión.");
      window.location.assign(data.returnTo || "/");
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "No se pudo iniciar sesión."); setLoading(false);
    }
  }
  return <form onSubmit={submit} className={styles.form}>
    <label htmlFor="pin">PIN de acceso</label>
    <input id="pin" name="pin" type="password" inputMode="numeric" autoComplete="current-password" pattern="[0-9]{6}" minLength={6} maxLength={6} aria-describedby="pin-help" required autoFocus />
    <span id="pin-help" className={styles.help}>Ingresa tu PIN de 6 dígitos</span>
    {error ? <p className={styles.error}>{error}</p> : null}
    <button type="submit" disabled={loading}>{loading ? "Ingresando…" : "Entrar a Nexo"}</button>
  </form>;
}
