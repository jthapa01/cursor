import { useCallback, useEffect, useRef, useState } from "react";
import { WebContainer } from "@webcontainer/api";
import { buildFileTree, getFilePath } from "@/features/preview/utils/file-tree";
import { useFiles } from "@/features/projects/hooks/use-files";
import { Id } from "../../../../convex/_generated/dataModel";

// Singleton WebContainer instance.
// Only ONE WebContainer can run per browser tab, so it lives at module scope
// (shared across all components) rather than being created per-component.
let webcontainerInstance: WebContainer | null = null;
// In-flight boot promise so concurrent callers await the SAME boot instead of
// booting twice (booting a second time would throw).
let bootPromise: Promise<WebContainer> | null = null;

// Lazily boot (or reuse) the single WebContainer instance.
const getWebContainer = async (): Promise<WebContainer> => {
  // Already booted -> reuse it.
  if (webcontainerInstance) {
    return webcontainerInstance;
  }

  // First caller starts the boot; later callers reuse this same promise.
  if (!bootPromise) {
    // coep must match the Cross-Origin-Embedder-Policy header in next.config.ts;
    // required for the cross-origin isolation WebContainer depends on.
    bootPromise = WebContainer.boot({ coep: "credentialless" });
  }

  webcontainerInstance = await bootPromise;
  return webcontainerInstance;
};

// Tear down the instance and reset the singleton so the next boot is fresh.
const teardownWebContainer = () => {
  if (webcontainerInstance) {
    webcontainerInstance.teardown();
    webcontainerInstance = null;
  }
  bootPromise = null;
};

interface UseWebContainerProps {
  projectId: Id<"projects">;
  enabled: boolean;
  settings?: {
    installCommand?: string;
    devCommand?: string;
  };
}

export const useWebContainer = ({
  projectId,
  enabled,
  settings,
}: UseWebContainerProps) => {
  // Lifecycle status the UI reacts to (spinner, error banner, etc.)
  const [status, setStatus] = useState<
    "idle" | "booting" | "installing" | "running" | "error"
  >("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null); // Running dev-server URL (iframe src)
  const [error, setError] = useState<string | null>(null);
  const [restartKey, setRestartKey] = useState(0); // Bumped to force the boot effect to re-run
  const [terminalOutput, setTerminalOutput] = useState(""); // Accumulated logs -> fed to PreviewTerminal

  const webcontainerRef = useRef<WebContainer | null>(null);
  const hasStartedRef = useRef(false); // Guard so the boot sequence runs only once per start

  // Fetch files from Convex (live query - auto-updates on any file change)
  const files = useFiles(projectId);

  // Initial boot -> mount files -> install deps -> start dev server
  useEffect(() => {
    // Wait until enabled and files are loaded; skip if already started
    if (!enabled || !files || files.length === 0 || hasStartedRef.current) {
      return;
    }

    hasStartedRef.current = true; // Mark as started to prevent re-entry (re-renders / StrictMode)

    const start = async () => {
      try {
        setStatus("booting");
        setError(null);
        setTerminalOutput("");

        const appendOutput = (data: string) => {
          setTerminalOutput((prev) => prev + data);
        };

        // Boot (or reuse) the singleton container
        const container = await getWebContainer();
        webcontainerRef.current = container;

        // Convert flat Convex files -> nested tree and write them into the container FS
        const fileTree = buildFileTree(files);
        await container.mount(fileTree);

        // Fired when the dev server inside the container starts listening -> expose its URL
        container.on("server-ready", (port, url) => {
          setPreviewUrl(url);
          setStatus("running");
        });

        // 1) Install dependencies (default: `npm install`)
        setStatus("installing");
        const installCommand = settings?.installCommand || "npm install";
        const [installBin, ...installArgs] = installCommand.split(" "); // "npm install" -> "npm", ["install"]
        const installProcess = await container.spawn(installBin, installArgs);
        installProcess.output.pipeTo(
          new WritableStream({
            write(data) {
              appendOutput(data);
            },
          }),
        );
        const installExitCode = await installProcess.exit; // Wait for install to finish

        // Non-zero exit -> install failed; abort before starting the dev server
        if (installExitCode !== 0) {
          throw new Error(
            `${installCommand} failed with code ${installExitCode}`,
          );
        }

        // 2) Start the dev server (default: `npm run dev`) - runs indefinitely
        const devCommand = settings?.devCommand || "npm run dev";
        const [devBin, ...devArgs] = devCommand.split(" ");
        appendOutput(
          `\n$ Starting development server with command: ${devCommand}\n`,
        );
        const devProcess = await container.spawn(devBin, devArgs);
        devProcess.output.pipeTo(
          new WritableStream({
            write(data) {
              appendOutput(data);
            },
          }),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        setStatus("error");
      }
    };
    start();
  }, [
    enabled,
    files,
    restartKey,
    settings?.devCommand,
    settings?.installCommand,
    projectId,
  ]);

  // Hot-reload: when Convex files change while running, write updated
  // contents straight into the container FS (no reboot/reinstall).
  useEffect(() => {
    const container = webcontainerRef.current;
    if (!container || !files || status !== "running") return;

    const filesMap = new Map(files.map((f) => [f._id, f]));

    for (const file of files) {
      // Only sync text files (skip folders and binary/storage-backed files)
      if (file.type !== "file" || file.storageId || !file.content) continue;

      const filePath = getFilePath(file, filesMap); // e.g. "src/index.js"
      container.fs.writeFile(filePath, file.content);
    }
  }, [files, status]);

  // Reset local state when disabled (e.g. preview panel closed)
  useEffect(() => {
    if (!enabled) {
      hasStartedRef.current = false; // Allow a fresh start next time it's enabled
      setStatus("idle");
      setPreviewUrl(null);
      setError(null);
    }
  }, [enabled]);

  // Full restart: tear down the container and re-run the boot effect from scratch
  const restart = useCallback(() => {
    teardownWebContainer();
    webcontainerRef.current = null;
    hasStartedRef.current = false;
    setStatus("idle");
    setPreviewUrl(null);
    setError(null);
    setRestartKey((k) => k + 1);
  }, []);

  return {
    status,
    previewUrl,
    error,
    restart,
    terminalOutput,
  };
};
