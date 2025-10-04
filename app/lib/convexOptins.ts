import type { ConvexReactClient } from 'convex/react';

type OptInToAccept = {
  optIn: {
    tos: string;
  };
  message: string;
};

export async function fetchOptIns(
  convex: ConvexReactClient
): Promise<
  | {
      kind: 'loaded';
      optIns: OptInToAccept[];
    }
  | {
      kind: 'error';
      error: string;
    }
  | {
      kind: 'missingAuth';
    }
> {
  // No optins needed - using single team setup with Clerk
  return {
    kind: 'loaded',
    optIns: [],
  };
}
