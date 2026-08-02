import { FilePromptPipeline } from "../foundation/prompts/PromptPipeline.js";
/** Backward-compatible facade for the foundation prompt pipeline. */
export class PromptComposer { private readonly pipeline = new FilePromptPipeline(); compose(root: string, variables: Record<string, string> = {}): Promise<string> { return this.pipeline.compose(root, variables); } }
