import { Inngest } from "inngest";
import { sentryMiddleware } from "@inngest/middleware-sentry";

// Create an inngest client to send and receive data from your functions.
export const inngest = new Inngest({
  id: "cursor",
  middleware: [sentryMiddleware()],
});