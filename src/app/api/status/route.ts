import { connection } from "next/server";
import { aiAvailable, MODEL } from "@/lib/server/ai";

export async function GET() {
  // Read the environment per request; without this the answer is frozen at build time.
  await connection();
  return Response.json({ ai: aiAvailable(), model: MODEL });
}
