import { useAuth } from '@clerk/remix';
import { ConvexProviderWithClerk } from 'convex/react-clerk';
import { ConvexReactClient } from 'convex/react';
import { ReactNode, useState } from 'react';
import { captureMessage } from '@sentry/remix';
import { useClerk } from '@clerk/remix';

export function ConvexClientProvider({
  children,
  convexUrl,
}: {
  children: ReactNode;
  convexUrl: string;
}) {
  const { loaded } = useClerk();
  
  const [convex] = useState(
    () =>
      new ConvexReactClient(convexUrl, {
        unsavedChangesWarning: false,
        onServerDisconnectError: (message) => captureMessage(message),
      })
  );

  // Don't render children until Clerk is fully loaded
  if (!loaded) {
    return <div>Loading...</div>;
  }

  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  );
}
