import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  redactContext,
  createRedactor,
  createDefaultRedactor,
  withRedaction,
  withDefaultRedaction,
  DEFAULT_SENSITIVE_KEYS,
  DEFAULT_SENSITIVE_PATTERNS,
  validateRedactionConfig,
  safeValidateRedactionConfig,
  redactionConfigSchema,
  type RedactionConfig,
} from '../src/redaction.js';
import { type FortifyLogger, type LogContext } from '../src/logger.js';

describe('redaction', () => {
  describe('redactContext', () => {
    it('should redact exact key matches', () => {
      const config: RedactionConfig = {
        keys: ['password', 'secret'],
      };

      const context = {
        username: 'john',
        password: 'secret123',
        secret: 'mysecret',
      };

      const result = redactContext(context, config);

      expect(result).toEqual({
        username: 'john',
        password: '[REDACTED]',
        secret: '[REDACTED]',
      });
    });

    it('should be case-insensitive for key matches', () => {
      const config: RedactionConfig = {
        keys: ['PASSWORD', 'Secret'],
      };

      const context = {
        password: 'value1',
        PASSWORD: 'value2',
        Password: 'value3',
      };

      const result = redactContext(context, config);

      expect(result.password).toBe('[REDACTED]');
      expect(result.PASSWORD).toBe('[REDACTED]');
      expect(result.Password).toBe('[REDACTED]');
    });

    it('should redact pattern matches', () => {
      const config: RedactionConfig = {
        keys: [],
        patterns: [/api[_-]?key/i, /token/i],
      };

      const context = {
        apiKey: 'key1',
        api_key: 'key2',
        accessToken: 'token1',
        username: 'john',
      };

      const result = redactContext(context, config);

      expect(result).toEqual({
        apiKey: '[REDACTED]',
        api_key: '[REDACTED]',
        accessToken: '[REDACTED]',
        username: 'john',
      });
    });

    it('should use custom replacement value', () => {
      const config: RedactionConfig = {
        keys: ['password'],
        replacement: '***HIDDEN***',
      };

      const context = { password: 'secret' };
      const result = redactContext(context, config);

      expect(result.password).toBe('***HIDDEN***');
    });

    it('should redact nested objects by default', () => {
      const config: RedactionConfig = {
        keys: ['password', 'token'],
      };

      const context = {
        user: {
          name: 'john',
          password: 'secret',
          auth: {
            token: 'mytoken',
          },
        },
      };

      const result = redactContext(context, config);

      expect(result).toEqual({
        user: {
          name: 'john',
          password: '[REDACTED]',
          auth: {
            token: '[REDACTED]',
          },
        },
      });
    });

    it('should not redact nested objects when deep=false', () => {
      const config: RedactionConfig = {
        keys: ['password'],
        deep: false,
      };

      const context = {
        password: 'secret',
        user: {
          password: 'nested-secret',
        },
      };

      const result = redactContext(context, config);

      expect(result).toEqual({
        password: '[REDACTED]',
        user: {
          password: 'nested-secret',
        },
      });
    });

    it('should handle arrays with objects', () => {
      const config: RedactionConfig = {
        keys: ['password'],
      };

      const context = {
        users: [
          { name: 'john', password: 'secret1' },
          { name: 'jane', password: 'secret2' },
        ],
      };

      const result = redactContext(context, config);

      expect(result).toEqual({
        users: [
          { name: 'john', password: '[REDACTED]' },
          { name: 'jane', password: '[REDACTED]' },
        ],
      });
    });

    it('should handle null and undefined values', () => {
      const config: RedactionConfig = {
        keys: ['password'],
      };

      const context = {
        password: null,
        token: undefined,
        value: 'test',
      };

      const result = redactContext(context, config);

      expect(result).toEqual({
        password: '[REDACTED]',
        token: undefined,
        value: 'test',
      });
    });

    it('should preserve primitive values in arrays', () => {
      const config: RedactionConfig = {
        keys: ['password'],
      };

      const context = {
        ids: [1, 2, 3],
        tags: ['a', 'b', 'c'],
      };

      const result = redactContext(context, config);

      expect(result).toEqual({
        ids: [1, 2, 3],
        tags: ['a', 'b', 'c'],
      });
    });

    it('should not modify the original context', () => {
      const config: RedactionConfig = {
        keys: ['password'],
      };

      const context = {
        password: 'secret',
        nested: { password: 'nested-secret' },
      };

      const original = JSON.stringify(context);
      redactContext(context, config);

      expect(JSON.stringify(context)).toBe(original);
    });

    it('should handle circular references', () => {
      const config: RedactionConfig = {
        keys: ['password'],
      };

      interface CircularObj {
        name: string;
        password: string;
        self?: CircularObj;
      }

      const context: CircularObj = {
        name: 'test',
        password: 'secret',
      };
      context.self = context;

      const result = redactContext(context as LogContext, config);

      expect(result.name).toBe('test');
      expect(result.password).toBe('[REDACTED]');
      expect(result.self).toBe('[Circular]');
    });

    it('should handle deeply nested circular references', () => {
      const config: RedactionConfig = {
        keys: ['password'],
      };

      interface DeepCircular {
        level: number;
        password?: string;
        child?: DeepCircular;
        parent?: DeepCircular;
      }

      const root: DeepCircular = { level: 1, password: 'secret1' };
      const child: DeepCircular = { level: 2, password: 'secret2', parent: root };
      root.child = child;

      const result = redactContext(root as LogContext, config);

      expect(result.level).toBe(1);
      expect(result.password).toBe('[REDACTED]');
      expect((result.child as Record<string, unknown>).level).toBe(2);
      expect((result.child as Record<string, unknown>).password).toBe('[REDACTED]');
      expect((result.child as Record<string, unknown>).parent).toBe('[Circular]');
    });

    it('should handle max depth limit', () => {
      const config: RedactionConfig = {
        keys: ['password'],
        maxDepth: 2,
      };

      const context = {
        level1: {
          level2: {
            level3: {
              password: 'deep-secret',
            },
          },
        },
      };

      const result = redactContext(context, config);

      // With maxDepth=2:
      // - root object starts at depth 0
      // - level1 is processed at depth 1
      // - level2 is processed at depth 2, which equals maxDepth
      // - So level3 (would be depth 3) is '[Max Depth Exceeded]'
      expect(result.level1).toBeDefined();
      const level1 = result.level1 as Record<string, unknown>;
      const level2 = level1.level2 as Record<string, unknown>;
      expect(level2.level3).toBe('[Max Depth Exceeded]');
    });

    it('should skip prototype pollution keys', () => {
      const config: RedactionConfig = {
        keys: ['password'],
      };

      // Create an object with dangerous keys using Object.create(null) to avoid prototype
      const context = Object.create(null) as LogContext;
      context.normal = 'value';
      context.password = 'secret';
      context.__proto__ = { malicious: true };
      context.constructor = { evil: true };
      context.prototype = { bad: true };

      const result = redactContext(context, config);

      expect(result.normal).toBe('value');
      expect(result.password).toBe('[REDACTED]');
      // The dangerous keys should not exist in the result (not copied)
      expect(Object.prototype.hasOwnProperty.call(result, '__proto__')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(result, 'constructor')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(result, 'prototype')).toBe(false);
    });

    it('should handle Date objects without recursing into them', () => {
      const config: RedactionConfig = {
        keys: ['password'],
      };

      const date = new Date('2024-01-01');
      const context = {
        createdAt: date,
        password: 'secret',
      };

      const result = redactContext(context, config);

      expect(result.createdAt).toBe(date);
      expect(result.password).toBe('[REDACTED]');
    });

    it('should handle Error objects without recursing into them', () => {
      const config: RedactionConfig = {
        keys: ['password'],
      };

      const error = new Error('test error');
      const context = {
        error,
        password: 'secret',
      };

      const result = redactContext(context, config);

      expect(result.error).toBe(error);
      expect(result.password).toBe('[REDACTED]');
    });

    it('should handle arrays with circular references', () => {
      const config: RedactionConfig = {
        keys: ['password'],
      };

      const arr: unknown[] = [{ password: 'secret' }];
      (arr[0] as Record<string, unknown>).self = arr;

      const context = { items: arr };

      const result = redactContext(context, config);

      expect(Array.isArray(result.items)).toBe(true);
      const items = result.items as unknown[];
      expect((items[0] as Record<string, unknown>).password).toBe('[REDACTED]');
      expect((items[0] as Record<string, unknown>).self).toBe('[Circular]');
    });
  });

  describe('createRedactor', () => {
    it('should create a reusable redactor function', () => {
      const redact = createRedactor({
        keys: ['password'],
      });

      const result1 = redact({ password: 'secret1' });
      const result2 = redact({ password: 'secret2' });

      expect(result1.password).toBe('[REDACTED]');
      expect(result2.password).toBe('[REDACTED]');
    });
  });

  describe('createDefaultRedactor', () => {
    it('should redact default sensitive keys', () => {
      const redact = createDefaultRedactor();

      const context = {
        username: 'john',
        password: 'secret',
        apiKey: 'key123',
        token: 'token123',
        authorization: 'bearer xyz',
      };

      const result = redact(context);

      expect(result.username).toBe('john');
      expect(result.password).toBe('[REDACTED]');
      expect(result.apiKey).toBe('[REDACTED]');
      expect(result.token).toBe('[REDACTED]');
      expect(result.authorization).toBe('[REDACTED]');
    });

    it('should redact additional custom keys', () => {
      const redact = createDefaultRedactor(['customSecret']);

      const context = {
        customSecret: 'secret',
        password: 'pass',
      };

      const result = redact(context);

      expect(result.customSecret).toBe('[REDACTED]');
      expect(result.password).toBe('[REDACTED]');
    });

    it('should redact additional custom patterns', () => {
      const redact = createDefaultRedactor([], [/^x-custom-/i]);

      const context = {
        'x-custom-header': 'value',
        'X-Custom-Auth': 'auth',
        normalKey: 'normal',
      };

      const result = redact(context);

      expect(result['x-custom-header']).toBe('[REDACTED]');
      expect(result['X-Custom-Auth']).toBe('[REDACTED]');
      expect(result.normalKey).toBe('normal');
    });

    it('should use custom replacement value', () => {
      const redact = createDefaultRedactor([], [], '****');

      const context = { password: 'secret' };
      const result = redact(context);

      expect(result.password).toBe('****');
    });
  });

  describe('DEFAULT_SENSITIVE_KEYS', () => {
    it('should include common sensitive keys', () => {
      expect(DEFAULT_SENSITIVE_KEYS).toContain('password');
      expect(DEFAULT_SENSITIVE_KEYS).toContain('secret');
      expect(DEFAULT_SENSITIVE_KEYS).toContain('token');
      expect(DEFAULT_SENSITIVE_KEYS).toContain('apiKey');
      expect(DEFAULT_SENSITIVE_KEYS).toContain('authorization');
      expect(DEFAULT_SENSITIVE_KEYS).toContain('credential');
    });

    it('should include JWT and OAuth keys', () => {
      expect(DEFAULT_SENSITIVE_KEYS).toContain('jwt');
      expect(DEFAULT_SENSITIVE_KEYS).toContain('jwtToken');
      expect(DEFAULT_SENSITIVE_KEYS).toContain('idToken');
      expect(DEFAULT_SENSITIVE_KEYS).toContain('clientSecret');
    });

    it('should include webhook and integration keys', () => {
      expect(DEFAULT_SENSITIVE_KEYS).toContain('webhookSecret');
      expect(DEFAULT_SENSITIVE_KEYS).toContain('signingKey');
      expect(DEFAULT_SENSITIVE_KEYS).toContain('encryptionKey');
      expect(DEFAULT_SENSITIVE_KEYS).toContain('passphrase');
    });

    it('should include database and connection keys', () => {
      expect(DEFAULT_SENSITIVE_KEYS).toContain('database_url');
      expect(DEFAULT_SENSITIVE_KEYS).toContain('connectionString');
    });

    it('should include PII keys', () => {
      expect(DEFAULT_SENSITIVE_KEYS).toContain('ssn');
      expect(DEFAULT_SENSITIVE_KEYS).toContain('dateOfBirth');
      expect(DEFAULT_SENSITIVE_KEYS).toContain('ipAddress');
      expect(DEFAULT_SENSITIVE_KEYS).toContain('deviceId');
      expect(DEFAULT_SENSITIVE_KEYS).toContain('fingerprint');
    });

    it('should include AWS keys', () => {
      expect(DEFAULT_SENSITIVE_KEYS).toContain('awsSecretKey');
      expect(DEFAULT_SENSITIVE_KEYS).toContain('awsAccessKey');
    });
  });

  describe('DEFAULT_SENSITIVE_PATTERNS', () => {
    it('should match common sensitive patterns', () => {
      const matchesAny = (key: string): boolean =>
        DEFAULT_SENSITIVE_PATTERNS.some((pattern) => pattern.test(key));

      expect(matchesAny('userPassword')).toBe(true);
      expect(matchesAny('my_secret')).toBe(true);
      expect(matchesAny('accessToken')).toBe(true);
      expect(matchesAny('API_KEY')).toBe(true);
      expect(matchesAny('access_token')).toBe(true);
      expect(matchesAny('normalField')).toBe(false);
    });

    it('should match JWT patterns', () => {
      const matchesAny = (key: string): boolean =>
        DEFAULT_SENSITIVE_PATTERNS.some((pattern) => pattern.test(key));

      expect(matchesAny('jwtToken')).toBe(true);
      expect(matchesAny('JWT_SECRET')).toBe(true);
    });

    it('should match connection patterns', () => {
      const matchesAny = (key: string): boolean =>
        DEFAULT_SENSITIVE_PATTERNS.some((pattern) => pattern.test(key));

      expect(matchesAny('connection_string')).toBe(true);
      expect(matchesAny('connectionString')).toBe(true);
      expect(matchesAny('database_url')).toBe(true);
      expect(matchesAny('DATABASE_URL')).toBe(true);
    });

    it('should match webhook and signing patterns', () => {
      const matchesAny = (key: string): boolean =>
        DEFAULT_SENSITIVE_PATTERNS.some((pattern) => pattern.test(key));

      expect(matchesAny('webhook_secret')).toBe(true);
      expect(matchesAny('signing_key')).toBe(true);
      expect(matchesAny('encryption_key')).toBe(true);
      expect(matchesAny('client_secret')).toBe(true);
    });

    it('should match x-api and x-auth header patterns', () => {
      const matchesAny = (key: string): boolean =>
        DEFAULT_SENSITIVE_PATTERNS.some((pattern) => pattern.test(key));

      expect(matchesAny('x-api-key')).toBe(true);
      expect(matchesAny('x-api-secret')).toBe(true);
      expect(matchesAny('x-auth-token')).toBe(true);
    });
  });

  describe('withRedaction', () => {
    function createMockLogger(): FortifyLogger & {
      calls: { level: string; msg: string; context?: LogContext }[];
    } {
      const calls: { level: string; msg: string; context?: LogContext }[] =
        [];

      return {
        calls,
        debug(msg: string, context?: LogContext) {
          calls.push({ level: 'debug', msg, context });
        },
        info(msg: string, context?: LogContext) {
          calls.push({ level: 'info', msg, context });
        },
        warn(msg: string, context?: LogContext) {
          calls.push({ level: 'warn', msg, context });
        },
        error(msg: string, context?: LogContext) {
          calls.push({ level: 'error', msg, context });
        },
        child(bindings: LogContext): FortifyLogger {
          const childCalls = calls;
          return {
            debug(msg: string, context?: LogContext) {
              childCalls.push({
                level: 'debug',
                msg,
                context: { ...bindings, ...context },
              });
            },
            info(msg: string, context?: LogContext) {
              childCalls.push({
                level: 'info',
                msg,
                context: { ...bindings, ...context },
              });
            },
            warn(msg: string, context?: LogContext) {
              childCalls.push({
                level: 'warn',
                msg,
                context: { ...bindings, ...context },
              });
            },
            error(msg: string, context?: LogContext) {
              childCalls.push({
                level: 'error',
                msg,
                context: { ...bindings, ...context },
              });
            },
            child(_childBindings: LogContext): FortifyLogger {
              return this;
            },
          };
        },
      };
    }

    it('should redact context in all log methods', () => {
      const mockLogger = createMockLogger();
      const redactor = createRedactor({ keys: ['password'] });
      const logger = withRedaction(mockLogger, redactor);

      logger.debug('debug msg', { password: 'secret', user: 'john' });
      logger.info('info msg', { password: 'secret', user: 'john' });
      logger.warn('warn msg', { password: 'secret', user: 'john' });
      logger.error('error msg', { password: 'secret', user: 'john' });

      expect(mockLogger.calls).toHaveLength(4);
      for (const call of mockLogger.calls) {
        expect(call.context?.password).toBe('[REDACTED]');
        expect(call.context?.user).toBe('john');
      }
    });

    it('should handle logs without context', () => {
      const mockLogger = createMockLogger();
      const redactor = createRedactor({ keys: ['password'] });
      const logger = withRedaction(mockLogger, redactor);

      logger.info('message without context');

      expect(mockLogger.calls).toHaveLength(1);
      expect(mockLogger.calls[0]?.context).toBeUndefined();
    });

    it('should redact child logger bindings', () => {
      const mockLogger = createMockLogger();
      const redactor = createRedactor({ keys: ['token'] });
      const logger = withRedaction(mockLogger, redactor);

      const child = logger.child({ token: 'secret-token', service: 'auth' });
      child.info('child message');

      expect(mockLogger.calls).toHaveLength(1);
      expect(mockLogger.calls[0]?.context?.token).toBe('[REDACTED]');
      expect(mockLogger.calls[0]?.context?.service).toBe('auth');
    });
  });

  describe('withDefaultRedaction', () => {
    it('should wrap logger with default redaction', () => {
      const calls: { msg: string; context?: LogContext }[] = [];
      const mockLogger: FortifyLogger = {
        debug: (msg, ctx) => calls.push({ msg, context: ctx }),
        info: (msg, ctx) => calls.push({ msg, context: ctx }),
        warn: (msg, ctx) => calls.push({ msg, context: ctx }),
        error: (msg, ctx) => calls.push({ msg, context: ctx }),
        child: () => mockLogger,
      };

      const logger = withDefaultRedaction(mockLogger);

      logger.info('test', { password: 'secret', name: 'john' });

      expect(calls[0]?.context?.password).toBe('[REDACTED]');
      expect(calls[0]?.context?.name).toBe('john');
    });
  });

  describe('configurable markers', () => {
    it('should use custom circular marker', () => {
      const config: RedactionConfig = {
        keys: ['password'],
        circularMarker: '<<CIRCULAR_REF>>',
      };

      interface CircularObj {
        name: string;
        self?: CircularObj;
      }

      const context: CircularObj = { name: 'test' };
      context.self = context;

      const result = redactContext(context as LogContext, config);

      expect(result.self).toBe('<<CIRCULAR_REF>>');
    });

    it('should use custom max depth marker', () => {
      const config: RedactionConfig = {
        keys: [],
        maxDepth: 1,
        maxDepthMarker: '<<TOO_DEEP>>',
      };

      // With maxDepth=1:
      // - root object is depth 0
      // - level1 is depth 1, which equals maxDepth, so level2 object becomes <<TOO_DEEP>>
      const context = {
        level1: {
          level2: {
            deep: 'value',
          },
        },
      };

      const result = redactContext(context, config);

      const level1 = result.level1 as Record<string, unknown>;
      expect(level1.level2).toBe('<<TOO_DEEP>>');
    });
  });

  describe('resource limits', () => {
    it('should truncate objects with too many keys', () => {
      const config: RedactionConfig = {
        keys: [],
        maxKeys: 5,
      };

      const context: Record<string, string> = {};
      for (let i = 0; i < 10; i++) {
        context[`key${String(i)}`] = `value${String(i)}`;
      }

      const result = redactContext(context, config);

      // Should have 5 keys + 2 truncation markers
      expect(Object.keys(result).length).toBe(7);
      expect(result._truncated).toBe(true);
      expect(result._totalKeys).toBe(10);
    });

    it('should truncate arrays that are too long', () => {
      const config: RedactionConfig = {
        keys: [],
        maxArrayLength: 3,
      };

      const context = {
        items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      };

      const result = redactContext(context, config);

      const items = result.items as unknown[];
      expect(items.length).toBe(4); // 3 items + truncation marker
      expect(items[items.length - 1]).toBe('[Truncated]');
    });

    it('should not add truncation marker when within limits', () => {
      const config: RedactionConfig = {
        keys: [],
        maxKeys: 100,
        maxArrayLength: 100,
      };

      const context = {
        items: [1, 2, 3],
        key1: 'value1',
        key2: 'value2',
      };

      const result = redactContext(context, config);

      expect(result._truncated).toBeUndefined();
      const items = result.items as unknown[];
      expect(items.length).toBe(3);
    });
  });

  describe('extended sensitive keys', () => {
    it('should include PKCE/OAuth 2.0 keys', () => {
      expect(DEFAULT_SENSITIVE_KEYS).toContain('codeVerifier');
      expect(DEFAULT_SENSITIVE_KEYS).toContain('code_verifier');
      expect(DEFAULT_SENSITIVE_KEYS).toContain('codeChallenge');
      expect(DEFAULT_SENSITIVE_KEYS).toContain('code_challenge');
      expect(DEFAULT_SENSITIVE_KEYS).toContain('oauthToken');
      expect(DEFAULT_SENSITIVE_KEYS).toContain('oauthSecret');
    });

    it('should include CSRF keys', () => {
      expect(DEFAULT_SENSITIVE_KEYS).toContain('csrfToken');
      expect(DEFAULT_SENSITIVE_KEYS).toContain('csrf_token');
      expect(DEFAULT_SENSITIVE_KEYS).toContain('xsrfToken');
      expect(DEFAULT_SENSITIVE_KEYS).toContain('_csrf');
    });

    it('should include cloud provider keys', () => {
      // AWS
      expect(DEFAULT_SENSITIVE_KEYS).toContain('awsSessionToken');
      // GCP
      expect(DEFAULT_SENSITIVE_KEYS).toContain('gcpServiceAccountKey');
      expect(DEFAULT_SENSITIVE_KEYS).toContain('googleApplicationCredentials');
      // Azure
      expect(DEFAULT_SENSITIVE_KEYS).toContain('azureClientSecret');
      expect(DEFAULT_SENSITIVE_KEYS).toContain('azureStorageKey');
      expect(DEFAULT_SENSITIVE_KEYS).toContain('azureConnectionString');
    });

    it('should include third-party service keys', () => {
      expect(DEFAULT_SENSITIVE_KEYS).toContain('stripeSecretKey');
      expect(DEFAULT_SENSITIVE_KEYS).toContain('twilioAuthToken');
      expect(DEFAULT_SENSITIVE_KEYS).toContain('sendgridApiKey');
      expect(DEFAULT_SENSITIVE_KEYS).toContain('slackToken');
      expect(DEFAULT_SENSITIVE_KEYS).toContain('githubToken');
      expect(DEFAULT_SENSITIVE_KEYS).toContain('gitlabToken');
    });

    it('should include additional PII keys', () => {
      expect(DEFAULT_SENSITIVE_KEYS).toContain('biometric');
      expect(DEFAULT_SENSITIVE_KEYS).toContain('faceId');
      expect(DEFAULT_SENSITIVE_KEYS).toContain('touchId');
    });
  });

  describe('word boundary patterns (false positive prevention)', () => {
    it('should NOT match words that contain sensitive substrings', () => {
      const matchesAny = (key: string): boolean =>
        DEFAULT_SENSITIVE_PATTERNS.some((pattern) => pattern.test(key));

      // "auth" should not match "author" (we use full "authorization" pattern)
      expect(matchesAny('author')).toBe(false);
      expect(matchesAny('authority')).toBe(false);

      // "secret" should not match "secretary" (fixed with lookahead pattern)
      expect(matchesAny('secretary')).toBe(false);
      expect(matchesAny('secretion')).toBe(false);

      // "token" should not match "tokenize"
      expect(matchesAny('tokenize')).toBe(false);
      expect(matchesAny('tokenizer')).toBe(false);

      // "password" should not match "passwordless" approach names
      expect(matchesAny('passwordless')).toBe(false);
    });

    it('should match sensitive patterns in compound keys', () => {
      const matchesAny = (key: string): boolean =>
        DEFAULT_SENSITIVE_PATTERNS.some((pattern) => pattern.test(key));

      // These should all match
      expect(matchesAny('secret')).toBe(true);
      expect(matchesAny('my_secret')).toBe(true);
      expect(matchesAny('secretKey')).toBe(true);
      expect(matchesAny('userPassword')).toBe(true);
      expect(matchesAny('password_hash')).toBe(true);
      expect(matchesAny('accessToken')).toBe(true);
      expect(matchesAny('api_token')).toBe(true);
    });

    it('should match new patterns (PKCE, CSRF, cloud)', () => {
      const matchesAny = (key: string): boolean =>
        DEFAULT_SENSITIVE_PATTERNS.some((pattern) => pattern.test(key));

      // PKCE/OAuth
      expect(matchesAny('code_verifier')).toBe(true);
      expect(matchesAny('codeChallenge')).toBe(true);
      expect(matchesAny('oauth_token')).toBe(true);

      // CSRF
      expect(matchesAny('csrfToken')).toBe(true);
      expect(matchesAny('xsrfToken')).toBe(true);

      // Cloud
      expect(matchesAny('aws_secret_key')).toBe(true);
      expect(matchesAny('azure_secret')).toBe(true);
      expect(matchesAny('gcp_key')).toBe(true);
      expect(matchesAny('service_account_key')).toBe(true);
    });
  });

  describe('validateRedactionConfig', () => {
    it('should validate and return config with defaults', () => {
      const config = validateRedactionConfig({
        keys: ['password'],
      });

      expect(config.keys).toEqual(['password']);
      expect(config.replacement).toBe('[REDACTED]');
      expect(config.deep).toBe(true);
      expect(config.maxDepth).toBe(10);
      expect(config.maxKeys).toBe(100);
      expect(config.maxArrayLength).toBe(100);
      expect(config.circularMarker).toBe('[Circular]');
      expect(config.maxDepthMarker).toBe('[Max Depth Exceeded]');
    });

    it('should throw on invalid config', () => {
      expect(() =>
        validateRedactionConfig({
          keys: ['password'],
          maxDepth: -1, // Invalid: must be positive
        })
      ).toThrow();

      expect(() =>
        validateRedactionConfig({
          keys: ['password'],
          maxKeys: 0, // Invalid: must be positive
        })
      ).toThrow();
    });

    it('should reject maxDepth over 20', () => {
      expect(() =>
        validateRedactionConfig({
          keys: ['password'],
          maxDepth: 21,
        })
      ).toThrow();
    });

    it('should reject maxKeys over 500', () => {
      expect(() =>
        validateRedactionConfig({
          keys: ['password'],
          maxKeys: 501,
        })
      ).toThrow();
    });
  });

  describe('safeValidateRedactionConfig', () => {
    it('should return success result for valid config', () => {
      const result = safeValidateRedactionConfig({
        keys: ['password'],
        replacement: '***',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.keys).toEqual(['password']);
        expect(result.data.replacement).toBe('***');
      }
    });

    it('should return error result for invalid config', () => {
      const result = safeValidateRedactionConfig({
        keys: ['password'],
        maxDepth: -1,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });

    it('should return error for completely invalid input', () => {
      const result = safeValidateRedactionConfig('not an object');

      expect(result.success).toBe(false);
    });
  });

  describe('ReDoS protection', () => {
    it('should accept safe patterns', () => {
      const result = safeValidateRedactionConfig({
        keys: [],
        patterns: [/^password$/i, /api[_-]?key/i, /\btoken\b/i],
      });

      expect(result.success).toBe(true);
    });

    it('should reject patterns that are too long', () => {
      const longPattern = new RegExp('a'.repeat(101));

      const result = safeValidateRedactionConfig({
        keys: [],
        patterns: [longPattern],
      });

      expect(result.success).toBe(false);
    });
  });

  describe('redactionConfigSchema', () => {
    it('should be a valid zod schema', () => {
      expect(redactionConfigSchema).toBeDefined();
      expect(typeof redactionConfigSchema.parse).toBe('function');
      expect(typeof redactionConfigSchema.safeParse).toBe('function');
    });
  });

  describe('property-based tests', () => {
    it('should never expose redacted keys regardless of input structure', () => {
      fc.assert(
        fc.property(
          fc.dictionary(fc.string(), fc.jsonValue()),
          (obj) => {
            const config: RedactionConfig = {
              keys: ['password', 'secret', 'token'],
            };

            // Add some sensitive keys to the object
            const testObj = {
              ...obj,
              password: 'sensitive_password',
              secret: 'sensitive_secret',
              token: 'sensitive_token',
            };

            const result = redactContext(testObj, config);

            // These should always be redacted
            expect(result.password).toBe('[REDACTED]');
            expect(result.secret).toBe('[REDACTED]');
            expect(result.token).toBe('[REDACTED]');
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should preserve non-sensitive keys', () => {
      fc.assert(
        fc.property(fc.string(), fc.string(), (key, value) => {
          // Skip if key is a sensitive key or unsafe key
          const sensitiveKeys = ['password', 'secret', 'token', '__proto__', 'constructor', 'prototype'];
          if (sensitiveKeys.includes(key.toLowerCase())) {
            return true; // Skip this test case
          }

          const config: RedactionConfig = {
            keys: ['password'],
          };

          const context = { [key]: value };
          const result = redactContext(context, config);

          return result[key] === value;
        }),
        { numRuns: 100 }
      );
    });

    it('should not modify original context', () => {
      fc.assert(
        fc.property(
          fc.dictionary(fc.string(), fc.jsonValue()),
          (obj) => {
            const config: RedactionConfig = {
              keys: ['password'],
            };

            const original = JSON.stringify(obj);
            redactContext(obj as LogContext, config);

            return JSON.stringify(obj) === original;
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle deeply nested objects without stack overflow', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 15 }), (depth) => {
          const config: RedactionConfig = {
            keys: ['password'],
            maxDepth: 10,
          };

          // Create a deeply nested object
          let obj: Record<string, unknown> = { password: 'secret' };
          for (let i = 0; i < depth; i++) {
            obj = { nested: obj };
          }

          // Should not throw and should return a valid object
          const result = redactContext(obj, config);
          return Object.keys(result).length > 0;
        }),
        { numRuns: 20 }
      );
    });
  });
});
