export function tunnelOrigin(log) {
  return log.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];
}

export async function tunnelReady(origin, fetcher = fetch) {
  if (!origin || !/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(origin)) return false;
  try {
    const response = await fetcher(`${origin}/health`, { signal: AbortSignal.timeout(8000) });
    return response.ok && (await response.json()).ready === true;
  } catch { return false; }
}
