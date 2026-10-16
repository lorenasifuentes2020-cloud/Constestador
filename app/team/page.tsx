import { requireChatGPTUser } from '../chatgpt-auth';
import TeamPanel from './team-panel';

export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  const user = await requireChatGPTUser('/team');
  return (
    <TeamPanel
      userName={user.fullName || user.displayName || user.email}
      userEmail={user.email}
    />
  );
}
