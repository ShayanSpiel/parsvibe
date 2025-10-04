import { useEffect } from 'react';
import { convexTeamsStore, type ConvexTeam } from '~/lib/stores/convexTeams';
import { waitForConvexSessionId } from '~/lib/stores/sessionId';
import { getStoredTeamSlug, setSelectedTeamSlug } from '~/lib/stores/convexTeams';
import type { ConvexReactClient } from 'convex/react';
import { useConvex } from 'convex/react';

export function useTeamsInitializer() {
  const convex = useConvex();
  useEffect(() => {
    void fetchTeams(convex);
  }, [convex]);
}

async function fetchTeams(convex: ConvexReactClient) {
  await waitForConvexSessionId('fetchTeams');
  
  // Hardcoded team - no external API call needed
  const teams: ConvexTeam[] = [
    {
      id: 301270,
      slug: 'ShayanSpiel',
      name: 'ShayanSpiel',
    },
  ];

  convexTeamsStore.set(teams);
  
  const teamSlugFromLocalStorage = getStoredTeamSlug();
  if (teamSlugFromLocalStorage) {
    const team = teams.find((team) => team.slug === teamSlugFromLocalStorage);
    if (team) {
      setSelectedTeamSlug(teamSlugFromLocalStorage);
      return;
    }
  }

  // Since there's only one team, auto-select it
  setSelectedTeamSlug(teams[0].slug);
}
