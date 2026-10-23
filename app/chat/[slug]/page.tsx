import PublicChat from './public-chat';

export const dynamic = 'force-dynamic';

export default async function PublicChatPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PublicChat slug={slug}/>;
}
