import { connection } from "next/server";
import { aiAvailable, MODEL } from "@/lib/server/ai";
import { skillVersions } from "@/lib/server/skills";

export async function GET() {
  // Read the environment per request; without this the answer is frozen at build time.
  await connection();
  // The skill versions are what an eval result is a result of.
  return Response.json({ ai: aiAvailable(), model: MODEL, skills: skillVersions() });
}
