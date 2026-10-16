import Link from "next/link";
import { Users } from "lucide-react";
import { requireChatGPTUser } from "./chatgpt-auth";
import WorkspaceApp from "./workspace-app";
import styles from "./team-entry.module.css";
export const dynamic = "force-dynamic";
export default async function Page() {
 const user = await requireChatGPTUser("/");
 return <>
  <WorkspaceApp userName={user.fullName || user.displayName || "Lorena"} />
  <Link href="/team" className={styles.entry}><Users size={17}/>Equipo</Link>
 </>;
}
