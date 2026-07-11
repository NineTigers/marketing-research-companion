import {lookup} from "node:dns/promises";
import {isIP} from "node:net";

const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = new Map([
  ["image/png", ".png"], ["image/jpeg", ".jpg"], ["image/webp", ".webp"]
]);

function privateIpv4(address) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  return parts[0] === 0 || parts[0] === 10 || parts[0] === 127 ||
    (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) || parts[0] >= 224;
}

function privateIp(address) {
  if (isIP(address) === 4) return privateIpv4(address);
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase();
    return normalized === "::" || normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb");
  }
  return true;
}

export async function assertPublicUrl(value, dnsLookup = lookup) {
  let url;
  try { url = new URL(value); }
  catch (_) { throw new Error("올바른 제품 이미지 주소가 아닙니다."); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error("공개 HTTP(S) 주소만 사용할 수 있습니다.");
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) throw new Error("로컬 주소에는 접근하지 않습니다.");
  if (isIP(hostname)) {
    if (privateIp(hostname)) throw new Error("사설 네트워크 주소에는 접근하지 않습니다.");
  } else {
    const addresses = await dnsLookup(hostname, {all: true});
    if (!addresses.length || addresses.some((item) => privateIp(item.address))) throw new Error("공개 네트워크 주소를 확인할 수 없습니다.");
  }
  return url;
}

async function readLimited(response, limit) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > limit) throw new Error("응답 파일이 허용 크기를 초과합니다.");
  if (!response.body?.getReader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > limit) throw new Error("응답 파일이 허용 크기를 초과합니다.");
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new Error("응답 파일이 허용 크기를 초과합니다.");
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

async function safeFetch(urlValue, {fetchImpl = fetch, maxBytes, accept, dnsLookup = lookup} = {}) {
  let url = await assertPublicUrl(urlValue, dnsLookup);
  for (let redirect = 0; redirect <= 4; redirect += 1) {
    const response = await fetchImpl(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
      headers: {"user-agent": "MarketingResearchCompanion/3.0", accept}
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("리디렉션 주소가 없습니다.");
      url = await assertPublicUrl(new URL(location, url).href, dnsLookup);
      continue;
    }
    if (!response.ok) throw new Error(`원문 응답 ${response.status}`);
    return {response, buffer: await readLimited(response, maxBytes), finalUrl: url.href};
  }
  throw new Error("리디렉션 횟수가 너무 많습니다.");
}

function decodeHtml(value) {
  return String(value || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function metaImages(html, baseUrl) {
  const results = [];
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const attrs = {};
    for (const match of tag.matchAll(/([:\w-]+)\s*=\s*(["'])(.*?)\2/gi)) attrs[match[1].toLowerCase()] = match[3];
    const key = String(attrs.property || attrs.name || "").toLowerCase();
    if (["og:image", "og:image:secure_url", "twitter:image", "twitter:image:src"].includes(key) && attrs.content) {
      try { results.push(new URL(decodeHtml(attrs.content), baseUrl).href); }
      catch (_) { /* Ignore malformed page metadata. */ }
    }
  }
  return results;
}

function collectJsonImages(value, results) {
  if (typeof value === "string" && /^https?:/i.test(value)) results.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectJsonImages(item, results));
  else if (value && typeof value === "object") {
    if (value.image) collectJsonImages(value.image, results);
    if (value.contentUrl) collectJsonImages(value.contentUrl, results);
    if (value.url && /image/i.test(String(value["@type"] || ""))) collectJsonImages(value.url, results);
  }
}

function jsonLdImages(html) {
  const results = [];
  const pattern = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) {
    try { collectJsonImages(JSON.parse(match[1]), results); }
    catch (_) { /* Ignore malformed JSON-LD blocks. */ }
  }
  return results;
}

export function extractProductImageCandidates(html, pageUrl) {
  return [...new Set([...metaImages(html, pageUrl), ...jsonLdImages(html)])];
}

export async function collectOfficialProductImages({jobId, report, store, fetchImpl = fetch, dnsLookup = lookup}) {
  const visuals = [];
  for (let index = 0; index < (report.competitors || []).length; index += 1) {
    const competitor = report.competitors[index];
    const record = {index, brand: competitor.brand, product: competitor.product, official: null, generated: null, warning: null};
    try {
      const productUrl = (await assertPublicUrl(competitor.productUrl, dnsLookup)).href;
      const page = await safeFetch(productUrl, {fetchImpl, dnsLookup, maxBytes: MAX_HTML_BYTES, accept: "text/html,application/xhtml+xml"});
      const html = page.buffer.toString("utf8");
      const candidates = competitor.officialImageUrl
        ? [competitor.officialImageUrl, ...extractProductImageCandidates(html, page.finalUrl)]
        : extractProductImageCandidates(html, page.finalUrl);
      let downloaded = null;
      for (const candidate of [...new Set(candidates)]) {
        try {
          const image = await safeFetch(candidate, {fetchImpl, dnsLookup, maxBytes: MAX_IMAGE_BYTES, accept: "image/avif,image/webp,image/png,image/jpeg"});
          const mime = String(image.response.headers.get("content-type") || "").split(";")[0].toLowerCase();
          const extension = IMAGE_TYPES.get(mime);
          if (!extension) continue;
          const name = `competitor-${index + 1}-official${extension}`;
          const asset = await store.writeJobAssetBuffer(jobId, name, image.buffer);
          downloaded = {
            url: `/api/jobs/${jobId}/assets/${asset.name}`,
            localPath: asset.path,
            originalUrl: image.finalUrl,
            sourceUrl: page.finalUrl,
            checkedAt: competitor.officialImageCheckedAt || competitor.checkedAt || new Date().toISOString().slice(0, 10)
          };
          break;
        } catch (_) { /* Try the next official-page image candidate. */ }
      }
      if (!downloaded) throw new Error("판매 페이지에서 사용 가능한 공식 제품 이미지를 회수하지 못했습니다.");
      record.official = downloaded;
    } catch (error) {
      record.warning = error.message;
    }
    visuals.push(record);
  }
  return visuals;
}
