import { inngest } from "@/inngest/client";

export async function POST() {
  await inngest.send({ name: "demo/error", data: { message: "This is a demo error event for testing Sentry integration." } });

  return Response.json({ status: "error event sent" });
}