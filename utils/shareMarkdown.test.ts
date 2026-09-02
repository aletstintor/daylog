import { describe, expect, it } from 'vitest';
import { getSharedFileUrl, processSharedMarkdown } from './shareMarkdown';

const TOKEN = 'tok123';

describe('getSharedFileUrl', () => {
  it('builds a proxy url for a relative path', () => {
    expect(getSharedFileUrl('files/report.pdf', TOKEN)).toBe(
      '/api/v1/share/tok123/image/files/report.pdf',
    );
  });

  it('keeps an already-absolute path once', () => {
    expect(getSharedFileUrl('/files/report.pdf', TOKEN)).toBe(
      '/api/v1/share/tok123/image/files/report.pdf',
    );
  });

  it.each(['http://x/a.png', 'https://x/a.png', 'data:image/png;base64,AAAA', '/api/v1/share/tok/image/a'])(
    'passes through %s unchanged',
    (url) => {
      expect(getSharedFileUrl(url, TOKEN)).toBe(url);
    },
  );
});

describe('processSharedMarkdown', () => {
  it('returns an empty string for empty content', () => {
    expect(processSharedMarkdown('', TOKEN)).toBe('');
  });

  it('rewrites an internal images api reference', () => {
    const md = '![alt](/api/v1/images?filePath=files%2Fa%20b.png)';
    expect(processSharedMarkdown(md, TOKEN)).toBe(
      '![alt](/api/v1/share/tok123/image/files/a b.png)',
    );
  });

  it('rewrites an internal storage api reference', () => {
    const md = '[doc](/api/v1/storage?key=files%2Freport.pdf)';
    expect(processSharedMarkdown(md, TOKEN)).toBe(
      '[doc](/api/v1/share/tok123/image/files/report.pdf)',
    );
  });

  it('rewrites a plain-path image but leaves a plain-path link', () => {
    const md = '![img](/uploads/a.png) and [link](/uploads/a.png)';
    expect(processSharedMarkdown(md, TOKEN)).toBe(
      '![img](/api/v1/share/tok123/image/uploads/a.png) and [link](/uploads/a.png)',
    );
  });

  it('leaves external and already-proxied urls untouched', () => {
    const md = '![a](https://cdn.example.com/a.png) ![b](/api/v1/share/tok123/image/x.png)';
    expect(processSharedMarkdown(md, TOKEN)).toBe(md);
  });
});
