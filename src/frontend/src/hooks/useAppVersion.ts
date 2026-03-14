import { useEffect, useState } from 'react';

export function useAppVersion(): string | null {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    fetch('/version.txt')
      .then((res) => {
        if (!res.ok || !res.headers.get('content-type')?.includes('text/plain')) {
          return null;
        }

        return res.text();
      })
      .then((text) => {
        if (text) {
          const firstLine = text.split('\n')[0];
          if (firstLine?.trim() && /^\d{2}\.\d{3,4}\.\d{1,4}$/.test(firstLine.trim())) {
            setVersion(firstLine.trim());
          }
        }
      })
      .catch(() => { /* version.txt not available — that's fine */ });
  }, []);

  return version;
}
