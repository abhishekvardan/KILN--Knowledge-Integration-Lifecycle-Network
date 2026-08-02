export type MemoryKind = "working" | "conversation" | "project" | "long-term" | "vector";
export interface MemoryStore { readonly kind: MemoryKind; get(key: string): Promise<unknown>; set(key: string, value: unknown): Promise<void>; clear?(): Promise<void>; }
