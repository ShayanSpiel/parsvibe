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
  const { user } = useUser();
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
        const userEmail = user.emailAddresses?.[0]?.emailAddress || '';
        
        launchdarkly?.identify({
          key: convexMemberId ?? '',
          email: userEmail,
        });
        
        setUser({
          id: convexMemberId ?? '',
          username: user.firstName ? (user.lastName ? `${user.firstName} ${user.lastName}` : user.firstName) : '',
          email: userEmail || undefined,
        });
        
        // Get additional profile info from Convex
        try {
          const token = getConvexAuthToken(convex);
          if (token) {
            void convex.action(api.sessions.updateCachedProfile, { convexAuthToken: token });
            const convexProfile = await getConvexProfile(token);
            setProfile({
              username:
                convexProfile.name ??
                (user.firstName ? (user.lastName ? `${user.firstName} ${user.lastName}` : user.firstName) : ''),
              email: convexProfile.email || userEmail,
              avatar: user.imageUrl || '',
              id: convexProfile.id || user.id || '',
            });
          }
        } catch (error) {
          console.error('Failed to fetch Convex profile:', error);
          // Fallback to Clerk profile if Convex profile fetch fails
          setProfile({
  username: user.firstName ? (user.lastName ? `${user.firstName} ${user.lastName}` : user.firstName) : '',
  email: convexProfile.email || userEmail || '', // If Convex profile email exists, use it, otherwise use userEmail, or an empty string if both are unavailable
  avatar: user.imageUrl || '',
  id: convexProfile.id || user.id || '',
});
