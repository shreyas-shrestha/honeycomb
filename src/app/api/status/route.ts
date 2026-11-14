import { aiAvailable, MODEL } from "@/lib/server/ai";

export async function GET() {
  return Response.json({ ai: aiAvailable(), model: MODEL });
}
