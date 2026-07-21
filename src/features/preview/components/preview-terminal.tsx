"use client";

import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

import "@xterm/xterm/css/xterm.css";

interface PreviewTerminalProps {
  output: string;
}

export const PreviewTerminal = ({ output }: PreviewTerminalProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const lastLengthRef = useRef(0);

  // Initialize the terminal when the component mounts
  useEffect(() => {
    if (containerRef.current && !terminalRef.current) {
      const terminal = new Terminal({
        convertEol: true,        // treat "\n" as "\r\n" so lines break correctly
        disableStdin: true,      // read-only: user can't type into it
        fontSize: 12,
        fontFamily: "monospace",
        theme: { background: "#1f2228" },
      });

      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(containerRef.current);

      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;

      // Write existing output on mount
    if (output) {
      terminal.write(output);
      lastLengthRef.current = output.length;
    }

    requestAnimationFrame(() => fitAddon.fit());

    const resizeObserver = new ResizeObserver(() => fitAddon.fit());
    resizeObserver.observe(containerRef.current);

    // cleanup on unmount
    return () => {
      resizeObserver.disconnect();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
    // "output" does not need to be a dependency since it is not intended
    // to update anything, just used on mount
    }
  }, []);

   // Write output
  useEffect(() => {
    if (!terminalRef.current) return;

    // Reset case: output got shorter than what we've written -> it was cleared/replaced
    if (output.length < lastLengthRef.current) {
      terminalRef.current.clear();
      lastLengthRef.current = 0;
    }

    // Append only the NEW tail, not the whole string
    const newData = output.slice(lastLengthRef.current);
    if (newData) {
      terminalRef.current.write(newData);
      lastLengthRef.current = output.length;
    }
  }, [output]);

  return (
    <div
      ref={containerRef}
      className="flex-1 min-h-0 p-3 [&_.xterm]:h-full! [&_.xterm-viewport]:h-full! [&_.xterm-screen]:h-full! bg-sidebar"
    />
  );
};