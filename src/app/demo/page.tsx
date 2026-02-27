// localhost:3000/demo
"use client";

import { Button } from "@/components/ui/button";
import { useState } from "react";
import * as Sentry from "@sentry/nextjs";
import { useAuth } from "@clerk/nextjs";

export default function DemoPage() {
  const { userId } = useAuth();
  const [loading, setLoading] = useState(false);
  const [loading2, setLoading2] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleBlocking = async () => {
    setLoading(true);
    setResult(null);
    const res = await fetch("/api/demo/blocking", {
      method: "POST"
    });
    const data = await res.json();
    setResult(JSON.stringify(data, null, 2));
    setLoading(false);
  };

  const handleBackground = async () => {
    setLoading2(true);
    setResult(null);
    const res = await fetch("/api/demo/background", {
      method: "POST"
    });
    const data = await res.json();
    setResult(JSON.stringify(data, null, 2));
    setLoading2(false);
  };

  // 1. Client error - throws in the browser
  const handleClientError = () => {
    Sentry.logger.info("User attempting to click on client function", { userId });
    throw new Error("Client error: Something went wrong on the client!");
  };

  // 2. API error - triggers server-side error
  const handleApiError = async () => {
    await fetch("/api/demo/error", { method: "POST" });
  };

  // 3. Inngest error - triggers an error event in an Inngest function
  const handleInngestError = async () => {
    await fetch("/api/demo/inngest-error", { method: "POST" });
  };

  return (
    <div className="p-8 space-y-4">
      <div className="space-x-4">
        <Button disabled={loading} onClick={handleBlocking}>
          {loading ? "Loading..." : "Run Blocking Function"}
        </Button>
        <Button disabled={loading2} onClick={handleBackground}>
          {loading2 ? "Loading..." : "Run Background Function"}
        </Button>
        <Button variant="destructive" onClick={handleClientError}>Throw Client Error</Button>
        <Button variant="destructive" onClick={handleApiError}>Trigger API Error</Button>
        <Button variant="destructive" onClick={handleInngestError}>Trigger Inngest Error</Button>
      </div>
      {result && (
        <pre className="p-4 bg-muted rounded-md text-sm whitespace-pre-wrap max-w-2xl">
          {result}
        </pre>
      )}
    </div>
  );
};
