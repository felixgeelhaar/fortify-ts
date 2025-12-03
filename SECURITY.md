# Security Policy

## Supported Versions

We release patches for security vulnerabilities in the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 0.x.x   | :white_check_mark: |

## Reporting a Vulnerability

We take the security of Fortify TS seriously. If you believe you have found a security vulnerability, please report it to us as described below.

### Please Do

- **Report security vulnerabilities privately** by emailing [security@example.com] or using GitHub's private vulnerability reporting feature
- Provide detailed information about the vulnerability
- Include steps to reproduce if possible
- Allow reasonable time for us to respond and fix the issue before public disclosure

### Please Don't

- Open public GitHub issues for security vulnerabilities
- Exploit the vulnerability beyond what is necessary to demonstrate it
- Share information about the vulnerability with others before it's fixed

## What to Include

When reporting a vulnerability, please include:

1. **Description** of the vulnerability
2. **Steps to reproduce** the issue
3. **Potential impact** of the vulnerability
4. **Suggested fix** (if you have one)
5. **Your contact information** for follow-up questions

## Response Timeline

- **Initial Response**: Within 48 hours
- **Status Update**: Within 7 days
- **Resolution Target**: Within 30 days (depending on complexity)

## Security Best Practices

When using Fortify TS in your applications:

### Rate Limiting

- Always use rate limiting on public-facing APIs
- Configure appropriate limits based on your use case
- Consider per-user and per-IP rate limits

### Circuit Breaker

- Set appropriate failure thresholds
- Monitor circuit breaker state changes
- Configure reasonable timeout values

### Timeout

- Always set timeouts on external calls
- Use appropriate timeout values for your SLAs
- Handle timeout errors gracefully

### Input Validation

- Validate all configuration inputs
- Use Zod schemas for runtime validation
- Don't trust user-provided configuration without validation

## Disclosure Policy

When we receive a security bug report, we will:

1. Confirm the problem and determine affected versions
2. Audit code to find any similar problems
3. Prepare fixes for all supported versions
4. Release new versions and publish security advisory

## Recognition

We appreciate the security research community's efforts in helping keep Fortify TS and its users safe. Contributors who report valid security issues will be acknowledged in our release notes (unless they prefer to remain anonymous).

## Contact

For security-related inquiries, please contact:

- Email: [security@example.com]
- GitHub Security Advisories: [https://github.com/felixgeelhaar/fortify-ts/security/advisories](https://github.com/felixgeelhaar/fortify-ts/security/advisories)
