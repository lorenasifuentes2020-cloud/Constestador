import { redirect } from "next/navigation";
import { getChatGPTUser, safeRelativeReturnPath } from "../chatgpt-auth";
import LoginForm from "./login-form";
import styles from "./login.module.css";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ return_to?: string }> }) {
  const params = await searchParams;
  const returnTo = safeRelativeReturnPath(params.return_to);
  if (await getChatGPTUser()) redirect(returnTo);
  return <main className={styles.page}><section className={styles.card}>
    <div className={styles.mark}>N</div>
    <p className={styles.eyebrow}>ACCESO PRIVADO</p>
    <h1>Bienvenida a Nexo</h1>
    <p className={styles.copy}>Tu centro de ventas, clientes y conversaciones.</p>
    <LoginForm returnTo={returnTo} />
  </section></main>;
}
