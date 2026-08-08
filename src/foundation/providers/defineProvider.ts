import type { ProviderAdapter } from "../../runtime/interfaces/ProviderAdapter.js";

/** Escape hatch for plugging in a custom or third-party model provider beyond the built-ins. */
export function defineProvider(provider: ProviderAdapter): ProviderAdapter {
  return provider;
}
