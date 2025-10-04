import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type ActionCtx,
  type MutationCtx,
} from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { getChatByIdOrUrlIdEnsuringAccess } from "./messages";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

export const hasConnectedConvexProject = query({
  args: {
    sessionId: v.id("sessions"),
    chatId: v.string(),
  },
  handler: async (ctx, args) => {
    const chat = await getChatByIdOrUrlIdEnsuringAccess(ctx, { id: args.chatId, sessionId: args.sessionId });
    return chat?.convexProject !== undefined;
  },
});

export const loadConnectedConvexProjectCredentials = query({
  args: {
    sessionId: v.id("sessions"),
    chatId: v.string(),
  },
  returns: v.union(
    v.object({
      kind: v.literal("connected"),
      projectSlug: v.string(),
      teamSlug: v.string(),
      deploymentUrl: v.string(),
      deploymentName: v.string(),
      adminKey: v.string(),
      warningMessage: v.optional(v.string()),
    }),
    v.object({
      kind: v.literal("connecting"),
    }),
    v.object({
      kind: v.literal("failed"),
      errorMessage: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const chat = await getChatByIdOrUrlIdEnsuringAccess(ctx, { id: args.chatId, sessionId: args.sessionId });
    if (!chat) {
      return null;
    }
    const project = chat.convexProject;
    if (project === undefined) {
      return null;
    }
    if (project.kind === "connecting") {
      return { kind: "connecting" } as const;
    }
    if (project.kind === "failed") {
      return { kind: "failed", errorMessage: project.errorMessage } as const;
    }
    const credentials = await ctx.db
      .query("convexProjectCredentials")
      .withIndex("bySlugs", (q) => q.eq("teamSlug", project.teamSlug).eq("projectSlug", project.projectSlug))
      .first();
    if (!credentials) {
      return null;
    }
    return {
      kind: "connected",
      projectSlug: project.projectSlug,
      teamSlug: project.teamSlug,
      deploymentUrl: project.deploymentUrl,
      deploymentName: project.deploymentName,
      adminKey: credentials.projectDeployKey,
      warningMessage: project.warningMessage,
    } as const;
  },
});

const CHECK_CONNECTION_DEADLINE_MS = 15000;

export const startProvisionConvexProject = mutation({
  args: {
    sessionId: v.id("sessions"),
    chatId: v.string(),
    projectInitParams: v.optional(
      v.object({
        teamSlug: v.string(),
        workosAccessToken: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await startProvisionConvexProjectHelper(ctx, args);
  },
});

export async function startProvisionConvexProjectHelper(
  ctx: MutationCtx,
  args: {
    sessionId: Id<"sessions">;
    chatId: string;
    projectInitParams?: {
      teamSlug: string;
      workosAccessToken: string;
    };
  },
): Promise<void> {
  const chat = await getChatByIdOrUrlIdEnsuringAccess(ctx, { id: args.chatId, sessionId: args.sessionId });
  if (!chat) {
    throw new ConvexError({ code: "NotAuthorized", message: "Chat not found" });
  }
  const session = await ctx.db.get(args.sessionId);
  if (!session) {
    console.error(`Session not found: ${args.sessionId}`);
    throw new ConvexError({ code: "NotAuthorized", message: "Chat not found" });
  }
  if (session.memberId === undefined) {
    throw new ConvexError({ code: "NotAuthorized", message: "Must be logged in to connect a project" });
  }

  // Use single-team flow (no longer need projectInitParams)
  await ctx.scheduler.runAfter(0, internal.convexProjects.connectConvexProjectForTeam, {
    sessionId: args.sessionId,
    chatId: args.chatId,
  });
  const jobId = await ctx.scheduler.runAfter(CHECK_CONNECTION_DEADLINE_MS, internal.convexProjects.checkConnection, {
    sessionId: args.sessionId,
    chatId: args.chatId,
  });
  await ctx.db.patch(chat._id, { convexProject: { kind: "connecting", checkConnectionJobId: jobId } });
  return;
}

export const recordProvisionedConvexProjectCredentials = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    chatId: v.string(),
    projectSlug: v.string(),
    teamSlug: v.optional(v.string()),
    projectDeployKey: v.string(),
    deploymentUrl: v.string(),
    deploymentName: v.string(),
    warningMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const teamSlug = args.teamSlug ?? "ShayanSpiel";
    await ctx.db.insert("convexProjectCredentials", {
      projectSlug: args.projectSlug,
      teamSlug,
      projectDeployKey: args.projectDeployKey,
    });
    const chat = await getChatByIdOrUrlIdEnsuringAccess(ctx, { id: args.chatId, sessionId: args.sessionId });
    if (!chat) {
      console.error(`Chat not found: ${args.chatId}, sessionId: ${args.sessionId}`);
      return;
    }
    if (chat.convexProject?.kind === "connecting") {
      const jobId = chat.convexProject.checkConnectionJobId;
      if (jobId) {
        await ctx.scheduler.cancel(jobId);
      }
    }
    await ctx.db.patch(chat._id, {
      convexProject: {
        kind: "connected",
        projectSlug: args.projectSlug,
        teamSlug,
        deploymentUrl: args.deploymentUrl,
        deploymentName: args.deploymentName,
        warningMessage: args.warningMessage,
      },
    });
  },
});

const TOTAL_WAIT_TIME_MS = 5000;
const WAIT_TIME_MS = 500;

// Renamed from connectConvexProjectForOauth to connectConvexProjectForTeam
export const connectConvexProjectForTeam = internalAction({
  args: {
    sessionId: v.id("sessions"),
    chatId: v.string(),
  },
  handler: async (ctx, args) => {
    await _connectConvexProjectForMember(ctx, {
      sessionId: args.sessionId,
      chatId: args.chatId,
    })
      .then(async (data) => {
        await ctx.runMutation(internal.convexProjects.recordProvisionedConvexProjectCredentials, {
          sessionId: args.sessionId,
          chatId: args.chatId,
          projectSlug: data.projectSlug,
          teamSlug: data.teamSlug,
          projectDeployKey: data.projectDeployKey,
          deploymentUrl: data.deploymentUrl,
          deploymentName: data.deploymentName,
          warningMessage: data.warningMessage,
        });
      })
      .catch(async (error) => {
        console.error(`Error connecting convex project: ${error.message}`);
        const errorMessage = error instanceof ConvexError ? error.data.message : "Unexpected error";
        await ctx.runMutation(internal.convexProjects.recordFailedConvexProjectConnection, {
          sessionId: args.sessionId,
          chatId: args.chatId,
          errorMessage,
        });
      });
  },
});

async function _connectConvexProjectForMember(
  ctx: ActionCtx,
  args: {
    sessionId: Id<"sessions">;
    chatId: string;
  },
): Promise<{
  projectSlug: string;
  teamSlug: string;
  deploymentUrl: string;
  deploymentName: string;
  projectDeployKey: string;
  warningMessage: string | undefined;
}> {
  const bigBrainHost = ensureEnvVar("BIG_BRAIN_HOST");
  const teamToken = ensureEnvVar("CONVEX_TEAM_TOKEN");
  
  let projectName: string | null = null;
  let timeElapsed = 0;
  while (timeElapsed < TOTAL_WAIT_TIME_MS) {
    projectName = await ctx.runQuery(internal.convexProjects.getProjectName, {
      sessionId: args.sessionId,
      chatId: args.chatId,
    });
    if (projectName) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, WAIT_TIME_MS));
    timeElapsed += WAIT_TIME_MS;
  }
  projectName = projectName ?? "My Project (Chef)";
  
  const response = await fetch(`${bigBrainHost}/api/create_project`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${teamToken}`,
    },
    body: JSON.stringify({
      team: "ShayanSpiel",
      projectName,
      deploymentType: "dev",
    }),
  });
  
  if (!response.ok) {
    const text = await response.text();
    const defaultProvisioningError = new ConvexError({
      code: "ProvisioningError",
      message: `Failed to create project: ${response.status}`,
      details: text,
    });
    if (response.status !== 400) {
      throw defaultProvisioningError;
    }
    let data: { code?: string; message?: string } | null = null;
    try {
      data = JSON.parse(text);
    } catch (_e) {
      throw defaultProvisioningError;
    }

    if (data !== null && data.code === "ProjectQuotaReached" && typeof data.message === "string") {
      throw new ConvexError({
        code: "ProvisioningError",
        message: `Failed to create project: ProjectQuotaReached: ${data.message}`,
        details: text,
      });
    }
    throw defaultProvisioningError;
  }
  
  const data: {
    projectSlug: string;
    projectId: number;
    teamSlug: string;
    deploymentName: string;
    prodUrl: string;
    adminKey: string;
    projectsRemaining: number;
  } = await response.json();

  // KEY CHANGE: Use the adminKey directly instead of OAuth authorization
  const projectDeployKey = data.adminKey;
  
  const warningMessage =
    data.projectsRemaining <= 2 ? `You have ${data.projectsRemaining} projects remaining on this team.` : undefined;

  return {
    projectSlug: data.projectSlug,
    teamSlug: "ShayanSpiel",
    deploymentUrl: data.prodUrl,
    deploymentName: data.deploymentName,
    projectDeployKey,
    warningMessage,
  };
}

export const recordFailedConvexProjectConnection = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    chatId: v.string(),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const chat = await getChatByIdOrUrlIdEnsuringAccess(ctx, { id: args.chatId, sessionId: args.sessionId });
    if (!chat) {
      console.error(`Chat not found: ${args.chatId}, sessionId: ${args.sessionId}`);
      return;
    }
    if (chat.convexProject?.kind === "connecting") {
      const jobId = chat.convexProject.checkConnectionJobId;
      if (jobId) {
        await ctx.scheduler.cancel(jobId);
      }
    }
    await ctx.db.patch(chat._id, {
      convexProject: { kind: "failed", errorMessage: args.errorMessage },
    });
  },
});

export const checkConnection = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    chatId: v.string(),
  },
  handler: async (ctx, args) => {
    const chat = await getChatByIdOrUrlIdEnsuringAccess(ctx, { id: args.chatId, sessionId: args.sessionId });
    if (!chat) {
      console.error(`Chat not found: ${args.chatId}, sessionId: ${args.sessionId}`);
      return;
    }
    if (chat.convexProject?.kind !== "connecting") {
      return;
    }
    await ctx.db.patch(chat._id, { convexProject: { kind: "failed", errorMessage: "Failed to connect to project" } });
  },
});

export const getProjectName = internalQuery({
  args: {
    sessionId: v.id("sessions"),
    chatId: v.string(),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const chat = await getChatByIdOrUrlIdEnsuringAccess(ctx, { id: args.chatId, sessionId: args.sessionId });
    if (!chat) {
      throw new ConvexError({ code: "NotAuthorized", message: "Chat not found" });
    }
    return chat.urlId ?? null;
  },
});

export const disconnectConvexProject = mutation({
  args: {
    sessionId: v.id("sessions"),
    chatId: v.string(),
  },
  handler: async (ctx, args) => {
    const chat = await getChatByIdOrUrlIdEnsuringAccess(ctx, { id: args.chatId, sessionId: args.sessionId });
    if (!chat) {
      throw new ConvexError({ code: "NotAuthorized", message: "Chat not found" });
    }
    await ctx.db.patch(chat._id, { convexProject: undefined });
  },
});

export function ensureEnvVar(name: string) {
  if (!process.env[name]) {
    throw new Error(`Environment variable ${name} is not set`);
  }
  return process.env[name];
}
