import { Inngest } from "inngest";
import { sentryMiddleware } from "@inngest/middleware-sentry";

// Create an inngest client to send and receive data from your functions.
// The TypeScript SDK defaults to Cloud mode. In local development we enable
// Dev mode so events are sent to the local Dev Server (localhost:8288) instead
// of Inngest Cloud, which otherwise rejects them with "401 Event key not found".
export const inngest = new Inngest({
  id: "cursor",
  isDev: process.env.NODE_ENV !== "production",
  middleware: [sentryMiddleware()],
});
