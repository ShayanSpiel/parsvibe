import { selectedTeamSlugStore, waitForSelectedTeamSlug } from '~/lib/stores/convexTeams';
import { useConvex } from 'convex/react';
import { getConvexAuthToken, waitForConvexSessionId } from '~/lib/stores/sessionId';
import { useCallback } from 'react';
import { api } from '@convex/_generated/api';
import { useChefAuth } from '~/components/chat/ChefAuthWrapper';
import { ContainerBootState, waitForBootStepCompleted } from '~/lib/stores/containerBootState';
import { toast } from 'sonner';
import { waitForConvexProjectConnection } from '~/lib/stores/convexProject';
import { useAuth } from '@clerk/remix';

const CREATE_PROJECT_TIMEOUT = 15000;

export function useHomepageInitializeChat(chatId: string, setChatInitialized: (chatInitialized: boolean) => void) {
  const convex = useConvex();
  const auth = typeof window !== 'undefined' ? useAuth() : { signIn: null };
  const signIn = auth?.signIn ?? null;
  const chefAuthState = useChefAuth();
  const isFullyLoggedIn = chefAuthState.kind === 'fullyLoggedIn';

  return useCallback(async () => {
    if (!isFullyLoggedIn) {
      if (signIn) {
        signIn();
      }
      return false;
    }
    const sessionId = await waitForConvexSessionId('useInitializeChat');
    const selectedTeamSlug = selectedTeamSlugStore.get();
    if (selectedTeamSlug === null) {
      return false;
    }
    const workosAccessToken = getConvexAuthToken(convex);
    if (!workosAccessToken) {
      console.error('No WorkOS access token');
      toast.error('Unexpected error creating chat');
      return false;
    }
    const teamSlug = await waitForSelectedTeamSlug('useInitializeChat');
    const projectInitParams = {
      teamSlug,
      workosAccessToken,
    };
    await convex.mutation(api.messages.initializeChat, {
      id: chatId,
      sessionId,
      projectInitParams,
    });
    try {
      await Promise.race([
        waitForConvexProjectConnection(),
        new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error('Connection timeout'));
          }, CREATE_PROJECT_TIMEOUT);
        }),
      ]);
      setChatInitialized(true);
    } catch (error) {
      console.error('Failed to create Convex project:', error);
      if (error instanceof Error && error.message === 'Connection timeout') {
        toast.error('Connection timed out. Please try again.');
      } else {
        toast.error('Failed to create Convex project. Please try again.');
      }
      return false;
    }
    await waitForBootStepCompleted(ContainerBootState.LOADING_SNAPSHOT);
    return true;
  }, [convex, chatId, isFullyLoggedIn, setChatInitialized, signIn]);
}

export function useExistingInitializeChat(chatId: string) {
  const convex = useConvex();
  return useCallback(async () => {
    const sessionId = await waitForConvexSessionId('useInitializeChat');
    const teamSlug = await waitForSelectedTeamSlug('useInitializeChat');
    const workosAccessToken = getConvexAuthToken(convex);
    if (!workosAccessToken) {
      console.error('No WorkOS access token');
      toast.error('Unexpected error creating chat');
      return false;
    }
    const projectInitParams = {
      teamSlug,
      workosAccessToken,
    };
    await convex.mutation(api.messages.initializeChat, {
      id: chatId,
      sessionId,
      projectInitParams,
    });
    return true;
  }, [convex, chatId]);
}
