import { requireChatGPTUser } from "./chatgpt-auth";
import WorkspaceApp from "./workspace-app";
export const dynamic = "force-dynamic";
export default async function Page() {
 const user = await requireChatGPTUser("/");
 return <WorkspaceApp userName={user.fullName || "Lorena"} />;
}
