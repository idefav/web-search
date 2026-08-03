declare module "openclaw/plugin-sdk/plugin-entry" {
  export type OpenClawConfig = Record<string, unknown>;
  export interface OpenClawPluginApi {
    pluginConfig?: Record<string, unknown>;
    registerWebSearchProvider(provider: import("openclaw/plugin-sdk/provider-web-search").WebSearchProviderPlugin): void;
    registerWebFetchProvider(provider: import("openclaw/plugin-sdk/provider-web-fetch").WebFetchProviderPlugin): void;
  }
  export function definePluginEntry<T>(definition: T): T;
}

declare module "openclaw/plugin-sdk/provider-web-search" {
  export interface WebSearchProviderPlugin {
    id: string;
    label: string;
    hint: string;
    requiresCredential?: boolean;
    credentialLabel?: string;
    envVars: string[];
    placeholder: string;
    signupUrl: string;
    docsUrl?: string;
    credentialPath: string;
    getCredentialValue(config?: Record<string, unknown>): unknown;
    setCredentialValue(config: Record<string, unknown>, value: unknown): void;
    getConfiguredCredentialValue?(config?: import("openclaw/plugin-sdk/plugin-entry").OpenClawConfig): unknown;
    setConfiguredCredentialValue?(config: import("openclaw/plugin-sdk/plugin-entry").OpenClawConfig, value: unknown): void;
    createTool(context: { searchConfig?: Record<string, unknown> }): {
      description: string;
      parameters: unknown;
      execute(args: Record<string, unknown>, context?: { signal?: AbortSignal }): Promise<Record<string, unknown>>;
    } | null;
  }
  export function wrapWebContent(content: string, source?: "web_search" | "web_fetch"): string;
}

declare module "openclaw/plugin-sdk/provider-web-fetch" {
  export interface WebFetchProviderPlugin {
    id: string;
    label: string;
    hint: string;
    requiresCredential?: boolean;
    credentialLabel?: string;
    envVars: string[];
    placeholder: string;
    signupUrl: string;
    docsUrl?: string;
    credentialPath: string;
    getCredentialValue(config?: Record<string, unknown>): unknown;
    setCredentialValue(config: Record<string, unknown>, value: unknown): void;
    getConfiguredCredentialValue?(config?: import("openclaw/plugin-sdk/plugin-entry").OpenClawConfig): unknown;
    setConfiguredCredentialValue?(config: import("openclaw/plugin-sdk/plugin-entry").OpenClawConfig, value: unknown): void;
    createTool(context: { fetchConfig?: Record<string, unknown> }): {
      description: string;
      parameters: unknown;
      execute(args: Record<string, unknown>): Promise<Record<string, unknown>>;
    } | null;
  }
}
