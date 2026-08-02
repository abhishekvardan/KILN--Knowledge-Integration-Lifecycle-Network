export interface ToolMetadata { name: string; description: string; version?: string; }
export interface Tool { readonly metadata: ToolMetadata; readonly permissions: string[]; readonly schema: unknown; execute(input: unknown): Promise<unknown>; }
