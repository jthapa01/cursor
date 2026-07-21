import { FileSystemTree } from "@webcontainer/api";

import { Doc, Id } from "../../../../convex/_generated/dataModel";

type FileDoc = Doc<"files">;

/**
 * Convert flat Convex files to nested FileSystemTree for WebContainer
 */
export const buildFileTree = (files: FileDoc[]): FileSystemTree => {
  const tree: FileSystemTree = {};
  const filesMap = new Map(files.map((file) => [file._id, file]));

  const getPath = (file: FileDoc): string[] => {
    const parts: string[] = [file.name]; // start with the file's own name
    let parentId = file.parentId;
    while (parentId) {
      // keep going while there's a parent
      const parentFile = filesMap.get(parentId);
      if (!parentFile) break; // safety: parent missing -> stop
      parts.unshift(parentFile.name); // prepend parent name to the FRONT
      parentId = parentFile.parentId; // move up one level
    }
    return parts; // [root, ..., file]
  };

  for (const file of files) {
    const pathParts = getPath(file);
    let currentLevel = tree; // cursor: where in the nested tree we currently are
    for (let i = 0; i < pathParts.length; i++) {
      const part = pathParts[i];
      const isLast = i === pathParts.length - 1;

      if (isLast) {
        // Last segment is the file/folder itself - drop its node here
        if (file.type === "folder") {
          currentLevel[part] = { directory: {} };
        } else if (!file.storageId && file.content !== undefined) {
          // Only inline text files; binary files (storageId) are skipped
          currentLevel[part] = { file: { contents: file.content } };
        }
      } else {
        // Intermediate segment is a parent folder on the way down
        if (!currentLevel[part]) {
          currentLevel[part] = { directory: {} }; // auto-create missing folder
        }
        const node = currentLevel[part];
        if ("directory" in node) {
          currentLevel = node.directory; // descend into that folder
        }
      }
    }
  }

  return tree;
};

/**
 * Get full path for a file by traversing parent chain
 */
export const getFilePath = (
  file: FileDoc,
  filesMap: Map<Id<"files">, FileDoc>,
): string => {
  const parts: string[] = [file.name];
  let parentId = file.parentId;

  while (parentId) {
    const parent = filesMap.get(parentId);
    if (!parent) break;
    parts.unshift(parent.name);
    parentId = parent.parentId;
  }

  return parts.join("/");
};
