export interface Connector { readonly name: string; authenticate(): Promise<void>; connect(): Promise<void>; validate(): Promise<void>; healthCheck(): Promise<boolean>; disconnect(): Promise<void>; }
