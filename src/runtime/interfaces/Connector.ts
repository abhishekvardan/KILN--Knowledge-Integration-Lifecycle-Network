export interface Connector { readonly name: string; connect(): Promise<void>; authenticate(): Promise<void>; validate(): Promise<void>; disconnect(): Promise<void>; }
