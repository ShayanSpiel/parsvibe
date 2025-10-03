import { useAuth } from '@clerk/remix';
import { ConvexProviderWithClerk } from 'convex/react-clerk';
import { ConvexReactClient } from 'convex/react';
import { ReactNode } from 'react';

export function ConvexClientProvider({
  children,
  convexUrl,
}: {
  children: ReactNode;
  convexUrl: string;
}) {
  const convex = new ConvexReactClient(convexUrl, {
    unsavedChangesWarning: false,
  });

  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  );
}
