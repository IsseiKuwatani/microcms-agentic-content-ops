export async function fetchJson(url, { apiKey = "", timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        ...(apiKey ? { "X-MICROCMS-API-KEY": apiKey } : {})
      },
      redirect: apiKey ? "error" : "follow",
      signal: controller.signal
    });
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text.slice(0, 500) };
    }
    return { ok: response.ok, status: response.status, url: response.url, body };
  } finally {
    clearTimeout(timeout);
  }
}

export function microcmsEndpoint(serviceDomain, endpoint) {
  if (!serviceDomain) throw new Error("MICROCMS_SERVICE_DOMAIN is required for a live audit");
  const parsed = new URL(`https://${serviceDomain}`);
  if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("MICROCMS_SERVICE_DOMAIN must be a hostname without credentials or a path");
  }
  if (!/^([a-z0-9-]+\.)+microcms\.io$/i.test(parsed.hostname)) {
    throw new Error("MICROCMS_SERVICE_DOMAIN must be a *.microcms.io hostname");
  }
  if (!/^[A-Za-z0-9_-]+$/.test(endpoint)) throw new Error("microCMS endpoint must contain only letters, numbers, hyphens, or underscores");
  return `https://${parsed.hostname}/api/v1/${endpoint}`;
}
