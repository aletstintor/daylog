import { describe, expect, it } from 'vitest';
import { isNewerVersion } from './version';

describe('isNewerVersion', () => {
  it('only accepts a greater semantic version', () => {
    expect(isNewerVersion('v1.3.0', '1.2.0')).toBe(true);
    expect(isNewerVersion('1.2.0', '1.2.0')).toBe(false);
    expect(isNewerVersion('1.1.9', '1.2.0')).toBe(false);
    expect(isNewerVersion('invalid', '1.2.0')).toBe(false);
  });
});
