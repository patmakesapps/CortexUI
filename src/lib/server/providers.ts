import { CortexProvider } from "@/lib/memory/cortex-provider";
import type { MemoryProvider } from "@/lib/memory/memory-provider";
import type { LlmProvider } from "@/lib/llm/llm-provider";
import { DefaultLlmProvider } from "@/lib/llm/default-llm-provider";

let memoryProvider: MemoryProvider | null = null;
let llmProvider: LlmProvider | null = null;

export function getMemoryProvider(): MemoryProvider {
  if (memoryProvider) return memoryProvider;

  const backend = process.env.CORTEX_MEMORY_BACKEND ?? "cortex";
  switch (backend) {
    case "cortex":
      memoryProvider = new CortexProvider();
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
