import { CortexHttpProvider } from "@/lib/memory/cortex-http-provider";
import type { MemoryProvider } from "@/lib/memory/memory-provider";
import type { LlmProvider } from "@/lib/llm/llm-provider";
import { DefaultLlmProvider } from "@/lib/llm/default-llm-provider";

let llmProvider: LlmProvider | null = null;

export function getMemoryProvider(authorization?: string | null): MemoryProvider {
  const backend = process.env.CORTEX_MEMORY_BACKEND ?? "cortex_http";
  switch (backend) {
    case "cortex_http":
      return new CortexHttpProvider({ authorization });
    default:
      throw new Error(`Unsupported memory backend: ${backend}`);
  }
}

export function getLlmProvider(): LlmProvider {
  if (!llmProvider) {
    llmProvider = new DefaultLlmProvider();
  }
  return llmProvider;
}
