import { Handlers } from "$fresh/server.ts";
import { SajProgram } from "../../schema.ts";
import { runProgram, createDenoKvHandlers, createInMemoryHandlers } from "../../evaluator.ts";

// Use Deno KV in production, in-memory for dev
let kv: Deno.Kv | null = null;

async function getHandlers() {
  if (Deno.env.get("DENO_DEPLOYMENT_ID")) {
    // Running on Deno Deploy - use KV
    if (!kv) {
      kv = await Deno.openKv();
    }
    return createDenoKvHandlers(kv);
  }
  // Local development - use in-memory
  return createInMemoryHandlers();
}

export const handler: Handlers = {
  async POST(req) {
    try {
      const body = await req.json();

      // Validate the program
      const parsed = SajProgram.safeParse(body.program);
      if (!parsed.success) {
        return Response.json(
          { error: "Invalid SAJ program", details: parsed.error.format() },
          { status: 400 }
        );
      }

      const handlers = await getHandlers();
      const env = body.env ?? {};

      const startTime = performance.now();
      const result = await runProgram(parsed.data, { env, handlers });
      const durationMs = Math.round(performance.now() - startTime);

      return Response.json({
        success: true,
        result: result.result,
        env: result.env,
        logs: result.logs,
        meta: { durationMs },
      });
    } catch (error) {
      return Response.json(
        { error: "Execution failed", message: (error as Error).message },
        { status: 500 }
      );
    }
  },
};
