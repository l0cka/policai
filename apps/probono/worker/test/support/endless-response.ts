import type { ServerResponse } from 'node:http';

export function writeForever(res: ServerResponse): Promise<void> {
  const chunk = Buffer.alloc(64 * 1024, ' ');
  const closed = new Promise<void>((resolve) => res.on('close', () => resolve()));
  const pump = () => {
    while (!res.destroyed && res.write(chunk));
    if (!res.destroyed) res.once('drain', pump);
  };
  pump();
  return closed;
}
