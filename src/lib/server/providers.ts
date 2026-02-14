import { CortexHttpProvider } from "@/lib/memory/cortex-http-provider";
import type { MemoryProvider } from "@/lib/memory/memory-provider";
import type { LlmProvider } from "@/lib/llm/llm-provider";
import { DefaultLlmProvider } from "@/lib/llm/default-llm-provider";

let llmProvider: LlmProvider | null = null;

export function getMemoryProvider(authorization?: string | null): MemoryProvider {
  const rawBackend = process.env.CORTEX_MEMORY_BACKEND ?? "cortex_http";
  const backend = rawBackend.trim().replace(/^['"]|['"]$/g, "").toLowerCase();
  switch (backend) {
    case "cortex_http":
    case "cortex-http":
    case "http":
      return new CortexHttpProvider({ authorization });
    default:
      throw new Error(`Unsupported memory backend: ${rawBackend}`);
  }
}

export function getLlmProvider(): LlmProvider {
  if (!llmProvider) {
    llmProvider = new DefaultLlmProvider();
  }
  return llmProvider;
}
