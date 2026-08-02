import { z } from "zod";

const domainSchema = z.string().min(1).max(253);

export const searchRequestSchema = z.object({
  query: z.string().trim().min(1).max(500),
  count: z.number().int().min(1).max(10).default(5),
  freshness: z.enum(["day", "week", "month", "year"]).optional(),
  include_domains: z.array(domainSchema).max(5).default([]),
  exclude_domains: z.array(domainSchema).max(5).default([]),
  language: z.string().regex(/^[a-zA-Z]{2}$/).transform((value) => value.toLowerCase()).optional(),
  country: z.string().regex(/^[a-zA-Z]{2}$/).transform((value) => value.toUpperCase()).optional()
}).strict();

export const searchResultSchema = z.object({
  rank: z.number().int().positive(),
  title: z.string(),
  url: z.string().url(),
  display_url: z.string().optional(),
  snippet: z.string().optional()
});

export const searchResponseSchema = z.object({
  request_id: z.string(),
  query: z.string(),
  provider: z.string().min(1),
  fetched_at: z.string(),
  results: z.array(searchResultSchema),
  warnings: z.array(z.string())
});

export const fetchRequestSchema = z.object({
  url: z.string().min(1).max(2048),
  offset: z.number().int().nonnegative().default(0),
  max_chars: z.number().int().min(1).max(40_000).default(20_000)
}).strict();

export const fetchResponseSchema = z.object({
  request_id: z.string(),
  requested_url: z.string(),
  final_url: z.string(),
  content_format: z.literal("accessibility_text"),
  content: z.string(),
  total_chars: z.number().int().nonnegative(),
  truncated: z.boolean(),
  next_offset: z.number().int().nonnegative().nullable(),
  fetched_at: z.string()
});

export type SearchRequest = z.infer<typeof searchRequestSchema>;
export type SearchResult = z.infer<typeof searchResultSchema>;
export type SearchResponse = z.infer<typeof searchResponseSchema>;
export type FetchRequest = z.infer<typeof fetchRequestSchema>;
export type FetchResponse = z.infer<typeof fetchResponseSchema>;

export const errorCodes = [
  "invalid_input",
  "unauthorized",
  "unsafe_url",
  "busy",
  "upstream_timeout",
  "upstream_unavailable",
  "search_blocked",
  "fetch_blocked",
  "upstream_contract_changed",
  "unsupported_content"
] as const;

export type ErrorCode = (typeof errorCodes)[number];

export interface ErrorResponse {
  request_id: string;
  error: {
    code: ErrorCode;
    message: string;
    retryable: boolean;
    retry_after_seconds?: number;
  };
}
