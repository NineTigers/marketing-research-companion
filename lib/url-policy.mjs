const AUTH_HOSTS = ["chatgpt.com", "openai.com"];

function hostMatches(hostname, allowed) {
  return hostname === allowed || hostname.endsWith(`.${allowed}`);
}

export function isAllowedAuthUrl(value) {
  let url;
  try { url = new URL(value); }
  catch (_) { return false; }
  return url.protocol === "https:"
    && !url.username
    && !url.password
    && AUTH_HOSTS.some((host) => hostMatches(url.hostname.toLowerCase(), host));
}

export function isAllowedExternalUrl(value) {
  let url;
  try { url = new URL(value); }
  catch (_) { return false; }
  return url.protocol === "https:" && !url.username && !url.password;
}

export function isSameOriginUrl(value, origin) {
  try { return new URL(value).origin === new URL(origin).origin; }
  catch (_) { return false; }
}
