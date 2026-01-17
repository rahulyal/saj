/**
 * SAJ Library Module
 *
 * Entry point for all SAJ library exports.
 * Provides LLM integration, flow orchestration, and utilities.
 */

// LLM Adapter - lightweight structured output support for OpenAI and Anthropic
export {
  createLLMClient,
  openai,
  anthropic,
  fromEnv,
  isError,
  zodToJsonSchema,
  type LLMProvider,
  type LLMConfig,
  type LLMResponse,
  type LLMError,
  type StructuredOutputOptions,
} from "./llm.ts";

// SAJ Flow - LLM-powered SAJ program generation and execution
export {
  createGenerateSajStep,
  createExecuteSajStep,
  createGenerateAndRunFlow,
  createIterativeFlow,
  type StepMeta,
  type RunMeta,
  type StepContext,
  type Step,
  type GenerateSajInput,
  type GenerateSajOutput,
  type GenerateSajConfig,
  type ExecuteSajInput,
  type ExecuteSajOutput,
  type GenerateAndRunInput,
  type GenerateAndRunOutput,
  type IterativeFlowInput,
  type IterativeFlowOutput,
} from "./saj-flow.ts";
