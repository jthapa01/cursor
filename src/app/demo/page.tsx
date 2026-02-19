// localhost:3000/demo
"use client";

import { Button } from "@/components/ui/button";
import { useState } from "react";

export default function DemoPage() {
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

  return (
    <div className="p-8 space-y-4">
      <div className="space-x-4">
        <Button disabled={loading} onClick={handleBlocking}>
          {loading ? "Loading..." : "Run Blocking Function"}
        </Button>
        <Button disabled={loading2} onClick={handleBackground}>
          {loading2 ? "Loading..." : "Run Background Function"}
        </Button>
      </div>
      {result && (
        <pre className="p-4 bg-muted rounded-md text-sm whitespace-pre-wrap max-w-2xl">
          {result}
        </pre>
      )}
    </div>
  );
};
