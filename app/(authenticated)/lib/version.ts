import packageJson from '../../../package.json';

export type AvailableUpdate = { version: string; url: string };

export default function getVersion() {
  return packageJson.version;
}

export function isNewerVersion(latest: string, current = getVersion()) {
  const parse = (version: string) =>
    version.replace(/^v/, '').split('.').map(Number);
  const latestParts = parse(latest);
  const currentParts = parse(current);

  if ([...latestParts, ...currentParts].some(Number.isNaN)) return false;

  for (let index = 0; index < 3; index++) {
    const difference = (latestParts[index] ?? 0) - (currentParts[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }

  return false;
}

export async function getAvailableUpdate(): Promise<AvailableUpdate | null> {
  try {
    const response = await fetch(
      'https://api.github.com/repos/artifacts-oss/daylog/releases/latest',
      {
        headers: { Accept: 'application/vnd.github+json' },
        next: { revalidate: 21600 },
      },
    );

    if (!response.ok) return null;

    const release = (await response.json()) as {
      tag_name?: string;
      html_url?: string;
    };

    if (!release.tag_name || !release.html_url || !isNewerVersion(release.tag_name)) {
      return null;
    }

    return { version: release.tag_name.replace(/^v/, ''), url: release.html_url };
  } catch {
    return null;
  }
}
