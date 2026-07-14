import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const validateInternalKey = (key: string) => {
  const internalKey = process.env.CURSOR_CONVEX_INTERNAL_KEY;
  if (!internalKey) {
    throw new Error("Internal key is not set");
  }
  if (key !== internalKey) {
    throw new Error("Invalid internal key");
  }
};

export const getConversationById = query({
  args: {
    conversationId: v.id("conversations"),
    internalKey: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);
    const conversation = await ctx.db.get("conversations", args.conversationId);

    if (!conversation) {
      return null;
    }

    const project = await ctx.db.get("projects", conversation.projectId);
    if (!project || project.ownerId !== args.userId) {
      return null;
    }

    return conversation;
  },
});

export const createMessage = mutation({
  args: {
    internalKey: v.string(),
    conversationId: v.id("conversations"),
    projectId: v.id("projects"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    status: v.optional(
      v.union(
        v.literal("processing"),
        v.literal("completed"),
        v.literal("cancelled"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);
    const messageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      projectId: args.projectId,
      role: args.role,
      content: args.content,
      status: args.status,
    });

    // Update the conversation's updatedAt timestamp
    await ctx.db.patch(args.conversationId, {
      updatedAt: Date.now(),
    });
    return messageId;
  },
});

export const updateMessageContent = mutation({
  args: {
    internalKey: v.string(),
    messageId: v.id("messages"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);
    await ctx.db.patch(args.messageId, {
      content: args.content,
      status: "completed" as const,
    });
  },
});

export const cancelMessage = mutation({
  args: {
    internalKey: v.string(),
    messageId: v.id("messages"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    const message = await ctx.db.get("messages", args.messageId);
    if (!message) {
      return false;
    }

    const project = await ctx.db.get("projects", message.projectId);
    if (!project || project.ownerId !== args.userId) {
      return false;
    }

    await ctx.db.patch(args.messageId, {
      status: "cancelled" as const,
    });
    return true;
  },
});
