export interface Tool { readonly name: string; readonly description: string; readonly permissions: string[]; execute(input: unknown): Promise<unknown>; }
