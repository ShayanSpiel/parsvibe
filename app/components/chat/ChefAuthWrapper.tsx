import { useConvex } from 'convex/react';
import { useConvexAuth } from 'convex/react';
import { createContext, useContext, useEffect, useRef } from 'react';
import { sessionIdStore } from '~/lib/stores/sessionId';
import { useConvexSessionIdOrNullOrLoading } from '~/lib/stores/sessionId';
import type { Id } from '@convex/_generated/dataModel';
import { useLocalStorage } from '@uidotdev/usehooks';
import { api } from '@convex/_generated/api';
import { toast } from 'sonner';
import { fetchOptIns } from '~/lib/convexOptins';
import { setChefDebugProperty } from 'chef-agent/utils/chefDebug';

type ChefAuthState =
  | {
      kind: 'loading';
    }
  | {
      kind: 'unauthenticated';
    }
  | {
      kind: 'fullyLoggedIn';
      sessionId: Id<'sessions'>;
    };

const ChefAuthContext = createContext<{
  state: ChefAuthState;
}>(null as unknown as { state: ChefAuthState });

export function useChefAuth() {
  const state = useContext(ChefAuthContext);
  if (state === null) {
    throw new Error('useChefAuth must be used within a ChefAuthProvider');
  }
  return state.state;
}

export function useChefAuthContext() {
  const state = useContext(ChefAuthContext);
  if (state === null) {
    throw new Error('useChefAuth must be used within a ChefAuthProvider');
  }
  return state;
}

export const SESSION_ID_KEY = 'sessionIdForConvex';

export const ChefAuthProvider = ({
  children,
  redirectIfUnauthenticated,
}: {
  children: React.ReactNode;
  redirectIfUnauthenticated: boolean;
}) => {
  const sessionId = useConvexSessionIdOrNullOrLoading();
  const convex = useConvex();
  const { isAuthenticated, isLoading: isConvexAuthLoading } = useConvexAuth();
  const [sessionIdFromLocalStorage, setSessionIdFromLocalStorage] = useLocalStorage<Id<'sessions'> | null>(
    SESSION_ID_KEY,
    null,
  );
  const hasAlertedAboutOptIns = useRef(false);

  useEffect(() => {
    function setSessionId(sessionId: Id<'sessions'> | null) {
      setSessionIdFromLocalStorage(sessionId);
      sessionIdStore.set(sessionId);
      if (sessionId) {
        setChefDebugProperty('sessionId', sessionId);
      }
    }

    const isUnauthenticated = !isAuthenticated && !isConvexAuthLoading;

    if (sessionId === undefined && isUnauthenticated) {
      setSessionId(null);
      return undefined;
    }

    if (sessionId !== null && isUnauthenticated) {
      setSessionId(null);
      return undefined;
    }

    async function verifySession() {
      if (sessionIdFromLocalStorage) {
        if (!isAuthenticated) {
          return;
        }
        let isValid: boolean = false;
        try {
          isValid = await convex.query(api.sessions.verifySession, {
            sessionId: sessionIdFromLocalStorage as Id<'sessions'>,
          });
        } catch (error) {
          console.error('Error verifying session', error);
          toast.error('Unexpected error verifying credentials');
          setSessionId(null);
        }
        if (isValid) {
          const optIns = await fetchOptIns(convex);
          if (optIns.kind === 'loaded' && optIns.optIns.length === 0) {
            setSessionId(sessionIdFromLocalStorage as Id<'sessions'>);
          }
          if (!hasAlertedAboutOptIns.current && optIns.kind === 'loaded' && optIns.optIns.length > 0) {
            toast.info('Please accept the Convex Terms of Service to continue');
            hasAlertedAboutOptIns.current = true;
          }
          if (hasAlertedAboutOptIns.current && optIns.kind === 'error') {
            toast.error('Unexpected error setting up your account.');
          }
        } else {
          setSessionId(null);
        }
      }

      if (isAuthenticated) {
        try {
          const sessionId = await convex.mutation(api.sessions.startSession);
          setSessionId(sessionId);
        } catch (error) {
          console.error('Error creating session', error);
          setSessionId(null);
        }
      }
      return;
    }

    void verifySession();
  }, [
    convex,
    sessionId,
    isAuthenticated,
    isConvexAuthLoading,
    sessionIdFromLocalStorage,
    setSessionIdFromLocalStorage,
  ]);

  const isLoading = sessionId === undefined || isConvexAuthLoading;
  const isUnauthenticated = sessionId === null || !isAuthenticated;
  const state: ChefAuthState = isLoading
    ? { kind: 'loading' }
    : isUnauthenticated
      ? { kind: 'unauthenticated' }
      : { kind: 'fullyLoggedIn', sessionId: sessionId as Id<'sessions'> };

  if (redirectIfUnauthenticated && state.kind === 'unauthenticated') {
    console.log('redirecting to /');
    window.location.href = '/';
  }

  return <ChefAuthContext.Provider value={{ state }}>{children}</ChefAuthContext.Provider>;
};
