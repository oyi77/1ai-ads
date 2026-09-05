import { describe, expect, it } from 'vitest';
import { redactSecretsForLogs } from '../../../../server/lib/platform-client.js';

describe('platform log redaction', () => {
  it('redacts access tokens from logged URLs', () => {
    const redacted = redactSecretsForLogs('https://example.test/me?access_token=EAAsecretTokenValue123&fields=id');
    expect(redacted).toBe('https://example.test/me?access_token=[REDACTED]&fields=id');
  });

  it('redacts Meta tokens echoed inside logged API error payloads', () => {
    const redacted = redactSecretsForLogs({
      error: { message: 'Malformed access token EAAsecretTokenValue123' },
    });
    expect(redacted.error.message).toBe('Malformed access token EAA[REDACTED]');
  });
});
