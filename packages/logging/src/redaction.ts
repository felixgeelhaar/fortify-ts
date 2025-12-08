import { z } from 'zod';
import { type LogContext, type FortifyLogger } from './logger.js';

/**
 * Maximum allowed complexity for regex patterns to prevent ReDoS attacks.
 * Patterns exceeding this threshold will be rejected.
 */
const MAX_PATTERN_LENGTH = 100;

/**
 * Check if two pattern alternatives could overlap (common ReDoS vulnerability).
 * Returns true if the alternatives share a common prefix or could match similar strings.
 */
function hasOverlappingAlternatives(alt1: string, alt2: string): boolean {
  // Direct prefix overlap: "foo" vs "food" or "a" vs "ab"
  if (alt1.startsWith(alt2) || alt2.startsWith(alt1)) {
    return true;
  }

  // Common prefix check (first 2+ chars match)
  const minLen = Math.min(alt1.length, alt2.length);
  if (minLen >= 2 && alt1.substring(0, 2) === alt2.substring(0, 2)) {
    return true;
  }

  // Single char alternatives that match same character
  if (alt1.length === 1 && alt2.length === 1 && alt1 === alt2) {
    return true;
  }

  return false;
}

/**
 * Check if a regex pattern is potentially vulnerable to ReDoS.
 * Uses multiple heuristics to detect common ReDoS patterns:
 * - Nested quantifiers: (a+)+, (a*)+, (a+?)+
 * - Overlapping alternations: (a|a)+, (foo|food)+
 * - Bounded nested repetition: (a{1,10}){1,10}
 *
 * @param pattern - The regex pattern to check
 * @returns True if the pattern appears safe
 */
function isSafePattern(pattern: RegExp): boolean {
  const source = pattern.source;

  // Check pattern length
  if (source.length > MAX_PATTERN_LENGTH) {
    return false;
  }

  // Detect nested quantifiers - multiple patterns to catch variants
  // Basic: (a+)+, (a*)+, (a+)*
  if (/\([^)]*[+*][^)]*\)[+*?]/.test(source)) {
    return false;
  }

  // Lazy quantifiers nested: (a+?)+, (a*?)*
  if (/\([^)]*[+*]\?[^)]*\)[+*?]/.test(source)) {
    return false;
  }

  // Bounded nested: (a{1,10}){1,10}, (a{2,})+
  if (/\([^)]*\{[^}]+\}[^)]*\)\{[^}]+\}/.test(source)) {
    return false;
  }
  if (/\([^)]*\{[^}]+\}[^)]*\)[+*?]/.test(source)) {
    return false;
  }

  // Detect alternations with outer quantifiers and check for overlap
  const altWithQuantifier = /\(([^)]+)\)[+*?{]/g;
  let match;
  while ((match = altWithQuantifier.exec(source)) !== null) {
    const groupContent = match[1];
    if (groupContent?.includes('|')) {
      // Split alternatives and check for overlaps
      const alternatives = groupContent.split('|');
      for (let i = 0; i < alternatives.length; i++) {
        for (let j = i + 1; j < alternatives.length; j++) {
          const a1 = alternatives[i];
          const a2 = alternatives[j];
          if (a1 && a2 && hasOverlappingAlternatives(a1, a2)) {
            return false;
          }
        }
      }
    }
  }

  // Detect character class with quantifier inside group with quantifier: ([a-z]+)+
  if (/\(\[[^\]]+\][+*][^)]*\)[+*?]/.test(source)) {
    return false;
  }

  return true;
}

/**
 * Zod schema for validating regex patterns.
 * Ensures patterns are safe from ReDoS vulnerabilities.
 */
const safeRegexSchema = z.custom<RegExp>(
  (val): val is RegExp => {
    if (!(val instanceof RegExp)) {
      return false;
    }
    return isSafePattern(val);
  },
  {
    message:
      'Pattern is potentially unsafe (ReDoS vulnerability) or exceeds complexity limits',
  }
);

/**
 * Zod schema for redaction configuration.
 * Provides runtime validation with sensible defaults.
 */
export const redactionConfigSchema = z.object({
  /** Keys to redact from log context. Supports both exact matches and patterns. */
  keys: z.array(z.string()).readonly(),

  /** Patterns to match keys for redaction. Uses case-insensitive matching. */
  patterns: z.array(safeRegexSchema).readonly().optional(),

  /** Replacement value for redacted fields. @default '[REDACTED]' */
  replacement: z.string().default('[REDACTED]'),

  /** Whether to perform deep redaction on nested objects. @default true */
  deep: z.boolean().default(true),

  /** Maximum depth for nested object redaction. @default 10 */
  maxDepth: z.number().int().positive().max(20).default(10),

  /** Maximum number of keys to process per object (DoS protection). @default 100 */
  maxKeys: z.number().int().positive().max(500).default(100),

  /** Maximum array length to process (DoS protection). @default 100 */
  maxArrayLength: z.number().int().positive().max(500).default(100),

  /** Marker for circular references. @default '[Circular]' */
  circularMarker: z.string().default('[Circular]'),

  /** Marker for max depth exceeded. @default '[Max Depth Exceeded]' */
  maxDepthMarker: z.string().default('[Max Depth Exceeded]'),
});

/**
 * Configuration for log redaction.
 */
export type RedactionConfig = z.input<typeof redactionConfigSchema>;

/**
 * Parsed configuration with all defaults applied.
 */
export type ParsedRedactionConfig = z.output<typeof redactionConfigSchema>;

/**
 * Default sensitive keys that should be redacted from logs.
 * Covers authentication, PII, security-related data, cloud providers,
 * container orchestration, observability, and financial data.
 */
export const DEFAULT_SENSITIVE_KEYS: readonly string[] = [
  // Authentication
  'password',
  'passwd',
  'secret',
  'token',
  'apiKey',
  'api_key',
  'apikey',
  'authorization',
  'credential',
  'credentials',
  'privateKey',
  'private_key',
  'privatekey',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'sessionId',
  'session_id',
  'sessionid',
  'cookie',
  'bearer',
  // JWT and OAuth
  'jwt',
  'jwtToken',
  'jwt_token',
  'idToken',
  'id_token',
  'clientSecret',
  'client_secret',
  // OAuth 2.0 / PKCE
  'codeVerifier',
  'code_verifier',
  'codeChallenge',
  'code_challenge',
  'authorizationCode',
  'authorization_code',
  'oauthToken',
  'oauth_token',
  'oauthSecret',
  'oauth_secret',
  // SAML / OpenID Connect
  'samlAssertion',
  'saml_assertion',
  'samlResponse',
  'saml_response',
  'openidToken',
  'openid_token',
  'oidcToken',
  'oidc_token',
  // Service tokens (machine-to-machine)
  'serviceToken',
  'service_token',
  'machineToken',
  'machine_token',
  'serviceAccountToken',
  'service_account_token',
  'deploymentToken',
  'deployment_token',
  'registryToken',
  'registry_token',
  // CSRF protection
  'csrfToken',
  'csrf_token',
  'xsrfToken',
  'xsrf_token',
  '_csrf',
  // Webhooks and integrations
  'webhookSecret',
  'webhook_secret',
  'signingKey',
  'signing_key',
  'encryptionKey',
  'encryption_key',
  'passphrase',
  'masterKey',
  'master_key',
  // Database and connections
  'database_url',
  'databaseUrl',
  'connectionString',
  'connection_string',
  'mongoUri',
  'mongo_uri',
  'redisUrl',
  'redis_url',
  // PII - Personal Identifiable Information
  'ssn',
  'socialSecurityNumber',
  'social_security_number',
  'creditCard',
  'credit_card',
  'cardNumber',
  'card_number',
  'cvv',
  'cvc',
  'pin',
  'dateOfBirth',
  'date_of_birth',
  'dob',
  'ipAddress',
  'ip_address',
  'deviceId',
  'device_id',
  'fingerprint',
  'biometric',
  'faceId',
  'face_id',
  'touchId',
  'touch_id',
  // Additional PII (GDPR, HIPAA compliance)
  'passportNumber',
  'passport_number',
  'driversLicense',
  'drivers_license',
  'nationalId',
  'national_id',
  'healthRecord',
  'health_record',
  'medicalRecordNumber',
  'medical_record_number',
  'mrn',
  // Financial (PCI DSS compliance)
  'bankAccount',
  'bank_account',
  'routingNumber',
  'routing_number',
  'iban',
  'swift',
  'accountNumber',
  'account_number',
  // AWS
  'awsSecretKey',
  'aws_secret_key',
  'awsAccessKey',
  'aws_access_key',
  'awsSessionToken',
  'aws_session_token',
  'accessKeyId',
  'access_key_id',
  'secretAccessKey',
  'secret_access_key',
  // Google Cloud
  'gcpServiceAccountKey',
  'gcp_service_account_key',
  'googleApplicationCredentials',
  'google_application_credentials',
  // Azure
  'azureClientSecret',
  'azure_client_secret',
  'azureStorageKey',
  'azure_storage_key',
  'azureConnectionString',
  'azure_connection_string',
  // Modern cloud providers
  'cloudflareApiKey',
  'cloudflare_api_key',
  'cfApiToken',
  'cf_api_token',
  'vercelToken',
  'vercel_token',
  'netlifyToken',
  'netlify_token',
  'herokuApiKey',
  'heroku_api_key',
  'digitaloceanToken',
  'digitalocean_token',
  'doToken',
  'do_token',
  // Container & Kubernetes
  'registryPassword',
  'registry_password',
  'dockerhubToken',
  'dockerhub_token',
  'kubeconfig',
  'k8sToken',
  'k8s_token',
  'helmPassword',
  'helm_password',
  // Observability & Monitoring
  'datadogApiKey',
  'datadog_api_key',
  'datadogAppKey',
  'datadog_app_key',
  'newrelicLicenseKey',
  'newrelic_license_key',
  'sentryDsn',
  'sentry_dsn',
  'grafanaApiKey',
  'grafana_api_key',
  'prometheusToken',
  'prometheus_token',
  // Payment services
  'stripeSecretKey',
  'stripe_secret_key',
  'twilioAuthToken',
  'twilio_auth_token',
  'sendgridApiKey',
  'sendgrid_api_key',
  'plaidSecret',
  'plaid_secret',
  'squareToken',
  'square_token',
  'paypalSecret',
  'paypal_secret',
  'braintreeKey',
  'braintree_key',
  // Communication services
  'slackToken',
  'slack_token',
  'githubToken',
  'github_token',
  'gitlabToken',
  'gitlab_token',
  // API headers
  'x-api-key',
  'x-auth-token',
  'x-csrf-token',
  'x-xsrf-token',
];

/**
 * Default patterns for matching sensitive keys.
 * Uses word-ending patterns where appropriate to reduce false positives.
 * For example, /secret$/i won't match "secretary" but will match "secret" or "my_secret".
 * Uses lookahead/lookbehind alternatives for compound keys like "userPassword".
 */
export const DEFAULT_SENSITIVE_PATTERNS: readonly RegExp[] = [
  // Authentication - use patterns that avoid false positives
  // Match "password" at end or followed by non-letter (handles userPassword, password_hash)
  /password(?![a-z])/i,
  /passwd(?![a-z])/i,
  // Match "secret" using negative lookahead for lowercase letters (case-sensitive lookahead)
  // Handles: secret, my_secret, secretKey, clientSecret but NOT secretary, secretion
  /secret(?![a-z])/,
  // Match "token" in compound words
  /token(?![a-z])/i, // accessToken, token, token_value but not tokenize
  /api[_-]?key/i,
  /authorization/i, // Full word to avoid "author"
  /credential/i,
  /private[_-]?key/i,
  /access[_-]?token/i,
  /refresh[_-]?token/i,
  /session[_-]?id/i,
  /bearer/i,
  /^jwt/i,
  // Connection strings
  /connection[_-]?string/i,
  /database[_-]?url/i,
  /mongo[_-]?uri/i,
  /redis[_-]?url/i,
  // Keys and secrets
  /signing[_-]?key/i,
  /encryption[_-]?key/i,
  /master[_-]?key/i,
  /webhook[_-]?secret/i,
  /client[_-]?secret/i,
  // OAuth/PKCE
  /code[_-]?verifier/i,
  /code[_-]?challenge/i,
  /oauth[_-]?token/i,
  /oauth[_-]?secret/i,
  // SAML / OpenID Connect
  /saml[_-]?assertion/i,
  /saml[_-]?response/i,
  /openid[_-]?token/i,
  /oidc[_-]?token/i,
  // Service tokens
  /service[_-]?account[_-]?token/i,
  /registry[_-]?token/i,
  /registry[_-]?password/i,
  // CSRF
  /csrf/i,
  /xsrf/i,
  // Cloud providers
  /aws[_-]?secret/i,
  /aws[_-]?access/i,
  /azure[_-]?secret/i,
  /azure[_-]?key/i,
  /gcp[_-]?key/i,
  /service[_-]?account[_-]?key/i,
  /cloudflare[_-]?api/i,
  /vercel[_-]?token/i,
  /netlify[_-]?token/i,
  /heroku[_-]?api/i,
  // Container & Kubernetes
  /kubeconfig/i,
  /k8s[_-]?token/i,
  // Observability
  /datadog[_-]?api[_-]?key/i,
  /datadog[_-]?app[_-]?key/i,
  /sentry[_-]?dsn/i,
  // PII patterns (GDPR, HIPAA)
  /passport[_-]?number/i,
  /drivers[_-]?license/i,
  /medical[_-]?record/i,
  // Financial (PCI DSS)
  /bank[_-]?account/i,
  /routing[_-]?number/i,
  /account[_-]?number/i,
  // API headers - anchor at start
  /^x-api-/i,
  /^x-auth-/i,
  /^x-csrf-/i,
  /^x-xsrf-/i,
];

/**
 * Keys that should never be used as object keys (prototype pollution protection).
 */
const UNSAFE_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

const DEFAULT_REPLACEMENT = '[REDACTED]';
const DEFAULT_MAX_DEPTH = 10;
const DEFAULT_MAX_KEYS = 100;
const DEFAULT_MAX_ARRAY_LENGTH = 100;
const DEFAULT_CIRCULAR_MARKER = '[Circular]';
const DEFAULT_MAX_DEPTH_MARKER = '[Max Depth Exceeded]';
const DEFAULT_TRUNCATED_MARKER = '[Truncated]';

/**
 * Type guard to check if a value is a plain object (not an array, null, Date, etc.)
 *
 * @param value - The value to check
 * @returns True if the value is a plain object
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  // Check if it's an array
  if (Array.isArray(value)) {
    return false;
  }

  // Check for plain object prototype
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === null || proto === Object.prototype;
}

/**
 * Check if a key is safe to use (prototype pollution protection).
 *
 * @param key - The key to check
 * @returns True if the key is safe to use
 */
function isSafeKey(key: string): boolean {
  return !UNSAFE_KEYS.has(key);
}

/**
 * Create a Set of lowercase keys for O(1) lookup.
 *
 * @param keys - Array of keys to convert
 * @returns Set of lowercase keys
 */
function createKeySet(keys: readonly string[]): Set<string> {
  const set = new Set<string>();
  for (const key of keys) {
    set.add(key.toLowerCase());
  }
  return set;
}

/**
 * Check if a key should be redacted.
 * Uses Set for O(1) exact match lookup, then falls back to pattern matching.
 *
 * @param key - The key to check
 * @param keySet - Set of lowercase keys for O(1) lookup
 * @param patterns - Patterns to match against
 * @returns True if the key should be redacted
 */
function shouldRedact(
  key: string,
  keySet: Set<string>,
  patterns: readonly RegExp[]
): boolean {
  const lowerKey = key.toLowerCase();

  // Check exact matches (case-insensitive) - O(1) lookup
  if (keySet.has(lowerKey)) {
    return true;
  }

  // Check pattern matches - O(n) but only for patterns
  for (const pattern of patterns) {
    if (pattern.test(key)) {
      return true;
    }
  }

  return false;
}

/**
 * Redact sensitive values from a log context object.
 *
 * Handles:
 * - Circular references (returns configurable marker)
 * - Deep nested objects up to maxDepth
 * - Arrays with objects (with length limits)
 * - Prototype pollution protection
 * - Resource limits (maxKeys, maxArrayLength)
 *
 * @param context - The log context to redact
 * @param config - Redaction configuration
 * @returns New object with sensitive values redacted
 */
export function redactContext(
  context: LogContext,
  config: RedactionConfig
): LogContext {
  const {
    keys,
    patterns = [],
    replacement = DEFAULT_REPLACEMENT,
    deep = true,
    maxDepth = DEFAULT_MAX_DEPTH,
    maxKeys = DEFAULT_MAX_KEYS,
    maxArrayLength = DEFAULT_MAX_ARRAY_LENGTH,
    circularMarker = DEFAULT_CIRCULAR_MARKER,
    maxDepthMarker = DEFAULT_MAX_DEPTH_MARKER,
  } = config;

  // Create Set for O(1) key lookups (created once per redactContext call)
  const keySet = createKeySet(keys);

  // WeakSet to track visited objects for circular reference detection
  const visited = new WeakSet();

  function redactValue(value: unknown, key: string, depth: number): unknown {
    // Check if this key should be redacted
    if (shouldRedact(key, keySet, patterns)) {
      return replacement;
    }

    // Handle null/undefined
    if (value === null || value === undefined) {
      return value;
    }

    // Handle primitives
    if (typeof value !== 'object') {
      return value;
    }

    // Check depth limit
    if (depth >= maxDepth) {
      return maxDepthMarker;
    }

    // Check for circular reference
    if (visited.has(value)) {
      return circularMarker;
    }

    // Handle arrays
    if (Array.isArray(value)) {
      if (!deep) return value;
      visited.add(value);

      // Apply array length limit
      const limitedArray =
        value.length > maxArrayLength ? value.slice(0, maxArrayLength) : value;

      const result: unknown[] = limitedArray.map((item: unknown) =>
        isPlainObject(item)
          ? redactObject(item, depth + 1)
          : typeof item === 'object' && item !== null
            ? redactValue(item, '', depth + 1)
            : item
      );

      // Add truncation marker if array was limited
      if (value.length > maxArrayLength) {
        result.push(DEFAULT_TRUNCATED_MARKER);
      }

      return result;
    }

    // Handle plain objects
    if (isPlainObject(value) && deep) {
      return redactObject(value, depth + 1);
    }

    // For non-plain objects (Date, Error, custom classes), return as-is
    return value;
  }

  function redactObject(
    obj: Record<string, unknown>,
    depth: number
  ): Record<string, unknown> {
    // Check for circular reference
    if (visited.has(obj)) {
      return { [circularMarker]: true };
    }
    visited.add(obj);

    const result: Record<string, unknown> = {};
    let keyCount = 0;
    let truncated = false;

    for (const [key, value] of Object.entries(obj)) {
      // Skip unsafe keys (prototype pollution protection)
      if (!isSafeKey(key)) {
        continue;
      }

      // Apply key limit
      if (keyCount >= maxKeys) {
        truncated = true;
        break;
      }

      result[key] = redactValue(value, key, depth);
      keyCount++;
    }

    // Add truncation marker if keys were limited
    if (truncated) {
      result._truncated = true;
      result._totalKeys = Object.keys(obj).length;
    }

    return result;
  }

  return redactObject(context, 0);
}

/**
 * Validate redaction configuration using Zod schema.
 * Throws ZodError if configuration is invalid.
 *
 * @param config - Configuration to validate
 * @returns Parsed and validated configuration with defaults applied
 */
export function validateRedactionConfig(
  config: RedactionConfig
): ParsedRedactionConfig {
  return redactionConfigSchema.parse(config);
}

/**
 * Safely validate redaction configuration.
 * Returns a result object instead of throwing.
 *
 * @param config - Configuration to validate
 * @returns SafeParse result with success status and data/error
 */
export function safeValidateRedactionConfig(
  config: unknown
): z.ZodSafeParseResult<ParsedRedactionConfig> {
  return redactionConfigSchema.safeParse(config);
}

/**
 * Create a redaction function with pre-configured settings.
 *
 * @param config - Redaction configuration
 * @returns Function that redacts context objects
 */
export function createRedactor(
  config: RedactionConfig
): (context: LogContext) => LogContext {
  return (context) => redactContext(context, config);
}

/**
 * Create a redactor with default sensitive keys and patterns.
 * Validates additional patterns for ReDoS safety.
 *
 * @param additionalKeys - Additional keys to redact
 * @param additionalPatterns - Additional patterns to match (validated for ReDoS safety)
 * @param replacement - Replacement value for redacted fields
 * @returns Function that redacts context objects
 * @throws Error if any additional pattern is potentially unsafe (ReDoS vulnerability)
 */
export function createDefaultRedactor(
  additionalKeys: readonly string[] = [],
  additionalPatterns: readonly RegExp[] = [],
  replacement: string = DEFAULT_REPLACEMENT
): (context: LogContext) => LogContext {
  // Validate additional patterns for ReDoS safety
  for (const pattern of additionalPatterns) {
    if (!isSafePattern(pattern)) {
      throw new Error(
        `Unsafe pattern detected: ${pattern.source}. Pattern may be vulnerable to ReDoS attacks.`
      );
    }
  }

  return createRedactor({
    keys: [...DEFAULT_SENSITIVE_KEYS, ...additionalKeys],
    patterns: [...DEFAULT_SENSITIVE_PATTERNS, ...additionalPatterns],
    replacement,
    deep: true,
  });
}

/**
 * Wrap a logger with automatic context redaction.
 *
 * @param logger - The logger to wrap
 * @param redactor - Function to redact context objects
 * @returns Logger that automatically redacts sensitive data
 */
export function withRedaction(
  logger: FortifyLogger,
  redactor: (context: LogContext) => LogContext
): FortifyLogger {
  // Bind methods to preserve 'this' context and avoid unbound method warnings
  const boundDebug = logger.debug.bind(logger);
  const boundInfo = logger.info.bind(logger);
  const boundWarn = logger.warn.bind(logger);
  const boundError = logger.error.bind(logger);
  const boundChild = logger.child.bind(logger);

  const wrapMethod =
    (method: (msg: string, context?: LogContext) => void) =>
    (msg: string, context?: LogContext): void => {
      if (context) {
        method(msg, redactor(context));
      } else {
        method(msg);
      }
    };

  const wrappedLogger: FortifyLogger = {
    debug: wrapMethod(boundDebug),
    info: wrapMethod(boundInfo),
    warn: wrapMethod(boundWarn),
    error: wrapMethod(boundError),
    child(bindings: LogContext): FortifyLogger {
      // Redact bindings when creating child logger
      const redactedBindings = redactor(bindings);
      const childLogger = boundChild(redactedBindings);
      return withRedaction(childLogger, redactor);
    },
  };

  return wrappedLogger;
}

/**
 * Create a logger with default redaction settings.
 *
 * @param logger - The logger to wrap
 * @param additionalKeys - Additional keys to redact
 * @param additionalPatterns - Additional patterns to match
 * @returns Logger that automatically redacts sensitive data
 */
export function withDefaultRedaction(
  logger: FortifyLogger,
  additionalKeys: readonly string[] = [],
  additionalPatterns: readonly RegExp[] = []
): FortifyLogger {
  const redactor = createDefaultRedactor(additionalKeys, additionalPatterns);
  return withRedaction(logger, redactor);
}
