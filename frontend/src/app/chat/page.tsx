import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '../api/auth/[...nextauth]/route';
import { ChatLayout } from './layout-client';

export default async function ChatPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  return <ChatLayout />;
}
