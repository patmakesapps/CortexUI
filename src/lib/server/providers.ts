import { CortexHttpProvider } from "@/lib/memory/cortex-http-provider";
import type { MemoryProvider } from "@/lib/memory/memory-provider";
import type { LlmProvider } from "@/lib/llm/llm-provider";
import { DefaultLlmProvider } from "@/lib/llm/default-llm-provider";

let memoryProvider: MemoryProvider | null = null;
let llmProvider: LlmProvider | null = null;

export function getMemoryProvider(): MemoryProvider {
  if (memoryProvider) return memoryProvider;

  const backend = process.env.CORTEX_MEMORY_BACKEND ?? "cortex_http";
  switch (backend) {
    case "cortex_http":
      memoryProvider = new CortexHttpProvider();
      break;
    default:
      throw new Error(`Unsupported memory backend: ${backend}`);
  }
  return memoryProvider;
}

export function getLlmProvider(): LlmProvider {
  if (!llmProvider) {
    llmProvider = new DefaultLlmProvider();
  }
  return llmProvider;
}
