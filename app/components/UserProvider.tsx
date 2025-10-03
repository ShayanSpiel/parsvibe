import { useEffect } from 'react';
import { setExtra, setUser } from '@sentry/remix';
import { useConvex, useQuery } from 'convex/react';
import { useConvexSessionIdOrNullOrLoading, getConvexAuthToken } from '~/lib/stores/sessionId';
import { useChatId } from '~/lib/stores/chatId';
import { setProfile } from '~/lib/stores/profile';
import { getConvexProfile } from '~/lib/convexProfile';
import { useLDClient, withLDProvider, basicLogger } from 'launchdarkly-react-client-sdk';
import { api } from '@convex/_generated/api';
import { useUser } from '@clerk/remix';

export const UserProvider = withLDProvider<any>({
  clientSideID: import.meta.env.VITE_LD_CLIENT_SIDE_ID,
  options: {
    logger: basicLogger({ level: 'error' }),
  },
})(UserProviderInner);

function UserProviderInner({ children }: { children: React.ReactNode }) {
  const launchdarkly = useLDClient();
  
  // Use useUser instead of useAuth to get the user object
  const userHook = typeof window !== 'undefined' ? useUser() : { user: null };
  const user = userHook?.user ?? null;
  
  const convexMemberId = useQuery(api.sessions.convexMemberId);
  const sessionId = useConvexSessionIdOrNullOrLoading();
  const chatId = useChatId();
  const convex = useConvex();

  useEffect(() => {
    if (sessionId) {
      setExtra('sessionId', sessionId);
    }
  }, [sessionId]);

  useEffect(() => {
    setExtra('chatId', chatId);
  }, [chatId]);

  const tokenValue = (convex as any)?.sync?.state?.auth?.value;

  useEffect(() => {
    async function updateProfile() {
      if (user) {
        launchdarkly?.identify({
          key: convexMemberId ?? '',
          email: user.primaryEmailAddress?.emailAddress ?? '',
        });
        setUser({
          id: convexMemberId ?? '',
          username: user.firstName ? (user.lastName ? `${user.firstName} ${user.lastName}` : user.firstName) : '',
          email: user.primaryEmailAddress?.emailAddress ?? undefined,
        });
        try {
          const token = getConvexAuthToken(convex);
          if (token) {
            void convex.action(api.sessions.updateCachedProfile, { convexAuthToken: token });
            const convexProfile = await getConvexProfile(token);
            setProfile({
              username:
                convexProfile.name ??
                (user.firstName ? (user.lastName ? `${user.firstName} ${user.lastName}` : user.firstName) : ''),
              email: convexProfile.email || user.primaryEmailAddress?.emailAddress || '',
              avatar: user.imageUrl || '',
              id: convexProfile.id || user.id || '',
            });
          }
        } catch (error) {
          console.error('Failed to fetch Convex profile:', error);
          setProfile({
            username: user.firstName ? (user.lastName ? `${user.firstName} ${user.lastName}` : user.firstName) : '',
            email: user.primaryEmailAddress?.emailAddress ?? '',
            avatar: user.imageUrl ?? '',
            id: user.id ?? '',
          });
        }
      } else {
        launchdarkly?.identify({
          anonymous: true,
        });
      }
    }
    void updateProfile();
  }, [launchdarkly, user, convex, tokenValue, convexMemberId]);

  return children;
}
