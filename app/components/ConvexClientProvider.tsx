import { ConvexProviderWithClerk } from 'convex/react-clerk';
import { ConvexReactClient } from 'convex/react';
import { ReactNode, useState } from 'react';
import { captureMessage } from '@sentry/remix';

export function ConvexClientProvider({
  children,
  convexUrl,
}: {
  children: ReactNode;
  convexUrl: string;
}) {
  const [convex] = useState(
    () =>
      new ConvexReactClient(convexUrl, {
        unsavedChangesWarning: false,
        onServerDisconnectError: (message) => captureMessage(message),
      })
  );

  // Import useAuth here to pass as reference
  const { useAuth } = require('@clerk/remix');

  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  );
}
