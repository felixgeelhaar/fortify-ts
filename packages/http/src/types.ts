/**
 * Generic HTTP request interface.
 * Framework-agnostic representation of an HTTP request.
 */
export interface HttpRequest {
  /** HTTP method (GET, POST, PUT, DELETE, etc.) */
  method: string;
  /** Request URL or path */
  url: string;
  /** Request headers */
  headers: Record<string, string | string[] | undefined>;
  /** Request body (if any) */
  body?: unknown;
  /** Client IP address (for rate limiting) */
  ip?: string;
  /** Additional context data */
  context?: Record<string, unknown>;
}

/**
 * Generic HTTP response interface.
 * Framework-agnostic representation of an HTTP response.
 */
export interface HttpResponse {
  /** HTTP status code */
  status: number;
  /** Response headers */
  headers: Record<string, string | string[]>;
  /** Response body (if any) */
  body?: unknown;
}

/**
 * HTTP handler function type.
 * Takes a request and returns a promise of a response.
 */
export type HttpHandler = (request: HttpRequest) => Promise<HttpResponse>;

/**
 * HTTP middleware function type.
 * Wraps a handler with additional behavior.
 */
export type HttpMiddleware = (handler: HttpHandler) => HttpHandler;

/**
 * Key extractor function type.
 * Extracts a rate limiting key from an HTTP request.
 */
export type KeyExtractor = (request: HttpRequest) => string;

/**
 * Extract rate limiting key from client IP address.
 *
 * @param request - HTTP request
 * @returns IP address or 'unknown'
 */
export const keyFromIp: KeyExtractor = (request: HttpRequest): string => {
  return request.ip ?? 'unknown';
};

/**
 * Create a key extractor that extracts from a specific header.
 *
 * @param header - Header name to extract key from
 * @param defaultValue - Default value if header is missing
 * @returns Key extractor function
 */
export function keyFromHeader(
  header: string,
  defaultValue: string = 'unknown'
): KeyExtractor {
  return (request: HttpRequest): string => {
    const value = request.headers[header.toLowerCase()];
    if (Array.isArray(value)) {
      return value[0] ?? defaultValue;
    }
    return value ?? defaultValue;
  };
}

/**
 * Create a key extractor that combines multiple extractors.
 *
 * @param extractors - Key extractors to combine
 * @param separator - Separator between keys
 * @returns Combined key extractor
 */
export function combineKeys(
  extractors: KeyExtractor[],
  separator: string = ':'
): KeyExtractor {
  return (request: HttpRequest): string => {
    return extractors.map((e) => e(request)).join(separator);
  };
}

/**
 * Standard HTTP error response factory.
 */
export function createErrorResponse(
  status: number,
  message: string,
  headers: Record<string, string> = {}
): HttpResponse {
  return {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: { error: message },
  };
}

/**
 * Pre-built error responses for common scenarios.
 */
export const HttpErrors = {
  /** 429 Too Many Requests */
  tooManyRequests: (retryAfter?: number): HttpResponse =>
    createErrorResponse(
      429,
      'Too Many Requests',
      retryAfter !== undefined ? { 'Retry-After': String(retryAfter) } : {}
    ),

  /** 503 Service Unavailable (circuit open) */
  serviceUnavailable: (): HttpResponse =>
    createErrorResponse(503, 'Service Unavailable'),

  /** 504 Gateway Timeout */
  gatewayTimeout: (): HttpResponse =>
    createErrorResponse(504, 'Gateway Timeout'),

  /** 503 Service Unavailable (bulkhead full) */
  capacityExceeded: (): HttpResponse =>
    createErrorResponse(503, 'Service at capacity, please retry later'),
} as const;
