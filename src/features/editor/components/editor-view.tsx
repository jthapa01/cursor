import Image from "next/image";
import { useRef, useEffect } from "react";
import { useFile, useUpdateFile } from "@/features/projects/hooks/use-files";
import { CodeEditor } from "./code-editor";
import { useEditor } from "../hooks/use-editor";
import { TopNavigation } from "./top-navigation";
import { FileBreadcrumbs } from "./file-breadcrumbs";
import { Id } from "../../../../convex/_generated/dataModel";

const DEBOUNCE_MS = 1500;

export const EditorView = ({ projectId }: { projectId: Id<"projects"> }) => {
  const { activeTabId, closeTab } = useEditor(projectId);
  const activeFile = useFile(activeTabId);
  const updateFile = useUpdateFile();
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const isActiveFileBinary = activeFile && activeFile.storageId;
  const isActiveFileText = activeFile && !activeFile.storageId;

  // Close a tab whose file has been deleted (getFile resolves to null).
  // `undefined` means the query is still loading, so only act on an explicit null.
  useEffect(() => {
    if (activeTabId && activeFile === null) {
      closeTab(activeTabId);
    }
  }, [activeTabId, activeFile, closeTab]);

  // Cleanup pending debounce timer on unmount or file change
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [activeFile]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center">
        <TopNavigation projectId={projectId} />
      </div>
      {activeTabId && <FileBreadcrumbs projectId={projectId} />}
      <div className="flex-1 min-h-0 bg-background">
        {!activeFile && (
          <div className="size-full flex items-center justify-center">
            <Image src="/logo-alt.svg" alt="Cursor" width={50} height={50} className="opacity-25" />
          </div>
        )}
        {isActiveFileText && (
          <CodeEditor
            key={activeFile._id}
            fileName={activeFile.name}
            initialValue={activeFile!.content}
            onChange={(content: string) => {
              if (debounceTimer.current) {
                clearTimeout(debounceTimer.current);
              }
              debounceTimer.current = setTimeout(() => {
                updateFile({ id: activeFile._id, content });
              }, DEBOUNCE_MS);
            }}
          />
        )}
        {isActiveFileBinary && (
          <p>TODO: Implement binary preview</p>
        )}
      </div>
    </div>
  )
};
