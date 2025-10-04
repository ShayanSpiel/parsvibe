import { useTeamsInitializer } from '~/lib/stores/startup/useTeamsInitializer';
import { ChefAuthProvider } from '~/components/chat/ChefAuthWrapper';
import { json } from '@vercel/remix';
import type { LoaderFunctionArgs, MetaFunction } from '@vercel/remix';
import { SettingsContent } from '~/components/SettingsContent.client';
import { ClientOnly } from 'remix-utils/client-only';
import { useEffect } from 'react';
import { setPageLoadChatId } from '~/lib/stores/chatId';

export const meta: MetaFunction = () => {
  return [{ title: 'Settings | Chef' }];
};

export const loader = async (args: LoaderFunctionArgs) => {
  const url = new URL(args.request.url);
  let code: string | null = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (state) {
    code = null;
  }
  return json({ code });
};

export default function Settings() {
  useTeamsInitializer();

  // Initialize with dummy chat ID for settings page
  useEffect(() => {
    setPageLoadChatId('settings-page-dummy-id');
  }, []);

  return (
    <ChefAuthProvider redirectIfUnauthenticated={true}>
      <ClientOnly>{() => <SettingsContent />}</ClientOnly>
    </ChefAuthProvider>
  );
}
