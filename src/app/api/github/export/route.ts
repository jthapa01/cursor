import { z } from "zod";
import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { inngest } from "@/inngest/client";
import { Id } from "../../../../../convex/_generated/dataModel";

const requestSchema = z.object({
  projectId: z.string(),
  repoName: z.string().min(1).max(100),
  visibility: z.enum(["public", "private"]).default("private"),
  description: z.string().max(350).optional(),
});

export async function POST(request: Request) {
  try {
    const { userId, has } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const hasPro = has({ plan: "pro" });
    if (!hasPro) {
      return NextResponse.json(
        { error: "GitHub export is only available for Pro users" },
        { status: 403 },
      );
    };
    
    const body = await request.json();
    const { projectId, repoName, visibility, description } =
      requestSchema.parse(body);

    const client = await clerkClient();
    const tokens = await client.users.getUserOauthAccessToken(userId, "github");
    const githubToken = tokens.data[0]?.token;

    if (!githubToken) {
      return NextResponse.json(
        {
          error: "GitHub token not found. Please connect your GitHub account.",
        },
        { status: 400 },
      );
    }

    const internalKey = process.env.CURSOR_CONVEX_INTERNAL_KEY;
    if (!internalKey) {
      return NextResponse.json(
        { error: "Internal key not configured" },
        { status: 500 },
      );
    }

    const event = await inngest.send({
      name: "github/export.repo",
      data: {
        projectId: projectId as Id<"projects">,
        repoName,
        visibility,
        description,
        githubToken,
        internalKey,
      },
    });
    return NextResponse.json({
      success: true,
      projectId,
      eventId: event.ids[0],
    });
  } catch (error) {
    console.error("Failed to start GitHub export:", error);
    return NextResponse.json(
      {
        error:
          "Failed to start export. Please ensure the Inngest dev server is running and try again.",
      },
      { status: 500 },
    );
  }
}
