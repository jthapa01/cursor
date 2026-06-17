import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { verifyAuth } from "./auth";
import { Doc, Id } from "./_generated/dataModel";

export const getFiles = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx);
    const project = await ctx.db.get("projects", args.projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    if (project.ownerId !== identity.subject) {
      throw new Error("Unauthorized to access this project");
    }

    return await ctx.db
      .query("files")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

export const getFile = query({
  args: { id: v.id("files") },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx);
    const file = await ctx.db.get("files", args.id);

    if (!file) {
      throw new Error("File not found");
    }

    const project = await ctx.db.get("projects", file.projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    if (project.ownerId !== identity.subject) {
      throw new Error("Unauthorized to access this project");
    }

    return file;
  },
});

/**
 * Builds the full path to a file by traversing up the parent chain.
 *
 * Input:  A file ID (e.g., the ID of "button.tsx")
 * Output: Array of ancestors from root to file: [{ _id, name: "src" }, { _id, name: "components" }, { _id, name: "button.tsx" }]
 *
 * Used for: Breadcrumbs navigation (src > components > button.tsx)
 */
export const getFilePath = query({
  args: { fileId: v.id("files") },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx);
    const file = await ctx.db.get("files", args.fileId);

    if (!file) {
      throw new Error("File not found");
    }

    const project = await ctx.db.get("projects", file.projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    if (project.ownerId !== identity.subject) {
      throw new Error("Unauthorized to access this project");
    }

    const path: { _id: string; name: string }[] = [];
    let currentId: Id<"files"> | undefined = args.fileId;

    while (currentId) {
      const file = (await ctx.db.get("files", currentId)) as Doc<"files"> | undefined;
      if (!file) break;

      path.unshift({ _id: file._id, name: file.name });
      currentId = file.parentId;
    }
    return path;
  },
});

export const getFolderContents = query({
  args: {
    projectId: v.id("projects"),
    parentId: v.optional(v.id("files")),
  },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx);
    const project = await ctx.db.get("projects", args.projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    if (project.ownerId !== identity.subject) {
      throw new Error("Unauthorized to access this project");
    }

    const files = await ctx.db
      .query("files")
      .withIndex("by_project_parent", (q) =>
        q.eq("projectId", args.projectId).eq("parentId", args.parentId),
      )
      .collect();

    // Sort: folders first, then files, alphabetically within each group
    return files.sort((a, b) => {
      // Folders comes before files
      if (a.type == "folder" && b.type === "file") {
        return -1;
      }
      if (a.type === "file" && b.type === "folder") {
        return 1;
      }
      // within same type, sort alphabetically by name
      return a.name.localeCompare(b.name);
    });
  },
});

export const createFile = mutation({
  args: {
    projectId: v.id("projects"),
    parentId: v.optional(v.id("files")),
    name: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx);
    const project = await ctx.db.get("projects", args.projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    if (project.ownerId !== identity.subject) {
      throw new Error("Unauthorized to access this project");
    }

    // Check if the parent folder exists and belongs to the same project
    if (args.parentId) {
      const parent = await ctx.db.get("files", args.parentId);
      if (!parent) {
        throw new Error("Parent folder not found");
      }
      if (parent.projectId !== args.projectId) {
        throw new Error("Parent folder does not belong to this project");
      }
      if (parent.type !== "folder") {
        throw new Error("Parent is not a folder");
      }
    }

    // Check if file with same name already exists in this parent folder
    const existingFiles = await ctx.db
      .query("files")
      .withIndex("by_project_parent", (q) =>
        q.eq("projectId", args.projectId).eq("parentId", args.parentId),
      )
      .collect();
    if (
      existingFiles.some(
        (file) => file.name === args.name && file.type === "file",
      )
    ) {
      throw new Error("File with the same name already exists in this folder");
    }

    const now = Date.now();

    await ctx.db.insert("files", {
      projectId: args.projectId,
      parentId: args.parentId,
      name: args.name,
      content: args.content,
      type: "file",
      updatedAt: now,
    });

    await ctx.db.patch("projects", args.projectId, { updatedAt: now });
  },
});

export const createFolder = mutation({
  args: {
    projectId: v.id("projects"),
    parentId: v.optional(v.id("files")),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx);
    const project = await ctx.db.get("projects", args.projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    if (project.ownerId !== identity.subject) {
      throw new Error("Unauthorized to access this project");
    }

    // Check if the parent folder exists and belongs to the same project
    if (args.parentId) {
      const parent = await ctx.db.get("files", args.parentId);
      if (!parent) {
        throw new Error("Parent folder not found");
      }
      if (parent.projectId !== args.projectId) {
        throw new Error("Parent folder does not belong to this project");
      }
      if (parent.type !== "folder") {
        throw new Error("Parent is not a folder");
      }
    }

    // Check if folder with same name already exists in this parent folder
    const existingFolders = await ctx.db
      .query("files")
      .withIndex("by_project_parent", (q) =>
        q.eq("projectId", args.projectId).eq("parentId", args.parentId),
      )
      .collect();
    if (
      existingFolders.some(
        (file) => file.name === args.name && file.type === "folder",
      )
    ) {
      throw new Error(
        "Folder with the same name already exists in this folder",
      );
    }

    const now = Date.now();

    await ctx.db.insert("files", {
      projectId: args.projectId,
      parentId: args.parentId,
      name: args.name,
      type: "folder",
      updatedAt: now,
    });

    await ctx.db.patch("projects", args.projectId, { updatedAt: now });
  },
});

export const renameFile = mutation({
  args: {
    id: v.id("files"),
    newName: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx);
    const file = await ctx.db.get("files", args.id);

    if (!file) {
      throw new Error("File not found");
    }

    const project = await ctx.db.get("projects", file.projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    if (project.ownerId !== identity.subject) {
      throw new Error("Unauthorized to access this project");
    }

    // Check if a file or folder with the new name already exists in the same parent folder
    const siblings = await ctx.db
      .query("files")
      .withIndex("by_project_parent", (q) =>
        q.eq("projectId", file.projectId).eq("parentId", file.parentId),
      )
      .collect();
    // Exclude self so renaming to the same name doesn't falsely conflict
    if (
      siblings.some(
        (sibling) => sibling.name === args.newName && sibling._id !== args.id,
      )
    ) {
      throw new Error(
        "A file or folder with the same name already exists in this folder",
      );
    }

    const now = Date.now();

    await ctx.db.patch("files", args.id, {
      name: args.newName,
      updatedAt: now,
    });
    await ctx.db.patch("projects", file.projectId, { updatedAt: now });
  },
});

export const deleteFile = mutation({
  args: {
    id: v.id("files"),
  },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx);
    const file = await ctx.db.get("files", args.id);

    if (!file) {
      throw new Error("File not found");
    }

    const project = await ctx.db.get("projects", file.projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    if (project.ownerId !== identity.subject) {
      throw new Error("Unauthorized to access this project");
    }

    // Recursively delete file/folder and all descendants
    const deleteRecursive = async (fileId: Id<"files">) => {
      const file = await ctx.db.get("files", fileId);
      if (!file) {
        throw new Error("File not found");
      }

      // If the file is a folder, recursively delete all its children
      if (file.type === "folder") {
        const children = await ctx.db
          .query("files")
          .withIndex("by_project_parent", (q) =>
            q.eq("projectId", file.projectId).eq("parentId", fileId),
          )
          .collect();

        for (const child of children) {
          await deleteRecursive(child._id);
        }
      }

      // Delete storage file if it exists
      if (file.storageId) {
        await ctx.storage.delete(file.storageId);
      }

      // Delete the files/folder itself
      await ctx.db.delete("files", fileId);

    };

    await deleteRecursive(args.id);

    await ctx.db.patch("projects", file.projectId, { updatedAt: Date.now() });
  },
});

export const updateFile = mutation({
  args: {
    id: v.id("files"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx);
    const file = await ctx.db.get("files", args.id);

    if (!file) {
      throw new Error("File not found");
    }

    const project = await ctx.db.get("projects", file.projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    if (project.ownerId !== identity.subject) {
      throw new Error("Unauthorized to access this project");
    }

    const now = Date.now();

    await ctx.db.patch("files", args.id, {
      content: args.content,
      updatedAt: now,
    });
    await ctx.db.patch("projects", file.projectId, { updatedAt: now });
  },
})
