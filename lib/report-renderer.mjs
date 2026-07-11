function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[char]);
}

function isWebUrl(value) {
  try { return ["http:", "https:"].includes(new URL(value).protocol); }
  catch (_) { return false; }
}

function list(items, className = "") {
  return `<ul class="${className}">${(items || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function confidence(value) {
  return ({high: "높음", medium: "중간", low: "낮음"})[value] || value;
}

function sourceLinks(refs, sourceMap) {
  const links = (refs || []).map((ref) => sourceMap.get(ref)).filter(Boolean);
  if (!links.length) return '<span class="source-missing">출처 연결 확인 필요</span>';
  return links.map((source) => isWebUrl(source.url)
    ? `<a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.title)}</a>`
    : `<span>${escapeHtml(source.title)}</span>`).join(" · ");
}

function clusterRows(items, sourceMap) {
  return (items || []).map((item) => `<tr>
    <td><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.frequencySignal)} · 신뢰도 ${escapeHtml(confidence(item.confidence))}</small></td>
    <td>${escapeHtml((item.observedLanguage || []).join(" · "))}</td>
    <td>${escapeHtml(item.need)}</td>
    <td>${escapeHtml(item.productImplication)}</td>
    <td class="sources">${sourceLinks(item.sourceRefs, sourceMap)}</td>
  </tr>`).join("");
}

export function renderReport({job, report, sources, quality}) {
  const sourceMap = new Map((sources || []).map((source) => [source.url, source]));
  const modeLabel = job.mode === "codex" ? "사용자 Codex 조사" : "데모 분석";
  const legacyEffort = job.model === "gpt-5.6-terra" ? "high" : "legacy setting";
  const modelLabel = job.mode === "codex" ? `${job.model || "legacy-default"} · ${job.reasoningEffort || legacyEffort}` : "deterministic-demo";
  const statusLabel = quality.warnings.length ? "검토 항목 있음" : "제출 가능";
  const generatedAt = new Intl.DateTimeFormat("ko-KR", {dateStyle: "long", timeStyle: "short"}).format(new Date(job.updatedAt));
  const marketRows = report.marketSignals.map((item) => `<tr><td><strong>${escapeHtml(item.signal)}</strong></td><td>${escapeHtml(item.evidence)}</td><td>${escapeHtml(item.implication)}</td><td class="sources">${sourceLinks(item.sourceRefs, sourceMap)}</td></tr>`).join("");
  const competitorRows = report.competitors.map((item) => {
    const estimate = item.salesEstimate || {};
    const productLink = isWebUrl(item.productUrl) ? `<a href="${escapeHtml(item.productUrl)}" target="_blank" rel="noreferrer">상품 페이지</a>` : "상품 URL 확인 필요";
    return `<tr><td><strong>${escapeHtml(item.brand)}</strong><span>${escapeHtml(item.product)}</span><small>${escapeHtml(item.checkedAt)} · ${productLink}</small></td><td>${escapeHtml(item.price)}<small>${escapeHtml(item.reviewSignal)}</small></td><td>${escapeHtml(item.successFactors.join(" · "))}</td><td><strong>${escapeHtml(estimate.base)}</strong><small>${escapeHtml(estimate.low)} / ${escapeHtml(estimate.high)}</small><small>${escapeHtml(estimate.formula)}</small><div class="sources">${sourceLinks(estimate.sourceRefs, sourceMap)}</div></td><td>${escapeHtml(item.weakness)}</td><td class="sources">${sourceLinks(item.sourceRefs, sourceMap)}</td></tr>`;
  }).join("");
  const sourceRows = (sources || []).map((source, index) => `<li><span>${String(index + 1).padStart(2, "0")}</span><div><strong>${escapeHtml(source.title)}</strong><small>${escapeHtml(source.sourceType || "web")} · ${escapeHtml(String(source.checkedAt || "").slice(0, 10))}</small>${isWebUrl(source.url) ? `<a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.url)}</a>` : `<em>${escapeHtml(source.url)}</em>`}</div></li>`).join("");
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${escapeHtml(report.title)}</title>
<style>
:root{--ink:#18221d;--muted:#65716a;--line:#d5ded8;--paper:#f3f5f3;--surface:#fff;--green:#1f6d5c;--green-soft:#e4f1ec;--coral:#b64d39;--amber:#8b5d18;--blue:#315f87}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;line-height:1.6;letter-spacing:0}a{color:var(--blue);overflow-wrap:anywhere}.top{border-bottom:1px solid var(--line);background:#fff}.top-inner,main{width:min(1240px,calc(100% - 40px));margin:auto}.top-inner{display:flex;justify-content:space-between;gap:20px;padding:18px 0}.brand{font-weight:900}.meta{display:flex;gap:8px;flex-wrap:wrap}.badge,.print{padding:5px 8px;border:1px solid var(--line);border-radius:6px;font-size:12px;font-weight:800}.badge.live{color:var(--green);background:var(--green-soft)}.print{background:#fff;cursor:pointer}main{padding:42px 0 70px}.hero{padding-bottom:34px;border-bottom:1px solid var(--line)}.hero h1{max-width:900px;margin:8px 0 12px;font-size:42px;line-height:1.15}.eyebrow{margin:0;color:var(--green);font-size:12px;font-weight:900}.hero p{max-width:800px;color:var(--muted)}.decision{display:grid;grid-template-columns:1.4fr 1fr .55fr;gap:1px;margin-top:24px;border:1px solid var(--line);background:var(--line)}.decision div{padding:18px;background:#fff}.decision small,.metric small,td small{display:block;color:var(--muted);font-size:11px}.decision strong{font-size:18px}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;padding:28px 0}.summary article{padding:18px;border-left:4px solid var(--green);background:#fff}.section{padding:30px 0;border-top:1px solid var(--line)}.section-head{display:flex;align-items:end;justify-content:space-between;gap:20px;margin-bottom:14px}.section h2{margin:0;font-size:27px}.section-head p{max-width:620px;margin:0;color:var(--muted);font-size:13px}.table-wrap{overflow:auto;border:1px solid var(--line);background:#fff}table{width:100%;border-collapse:collapse;min-width:960px}th,td{padding:13px 14px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top;font-size:13px}th{background:#edf2ef;font-size:11px}td span{display:block}.sources{font-size:11px}.source-missing{color:var(--amber)}.two{display:grid;grid-template-columns:1fr 1fr;gap:18px}.band{padding:20px;border:1px solid var(--line);background:#fff}.band h3{margin:0 0 12px}.band ul{margin:0;padding-left:19px}.persona-list,.cause-list,.test-list{display:grid;gap:10px}.persona,.cause,.test{padding:16px;border:1px solid var(--line);background:#fff}.persona h3,.cause h3,.test h3{margin:0 0 6px;font-size:16px}.persona p,.cause p,.test p{margin:4px 0;color:#3d4942;font-size:13px}.spec-grid{display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:14px}.commercial{display:grid;grid-template-columns:1.4fr repeat(3,.7fr);gap:1px;border:1px solid var(--line);background:var(--line)}.commercial div{padding:16px;background:#fff}.commercial strong{display:block}.source-list{list-style:none;margin:0;padding:0;border-top:1px solid var(--line)}.source-list li{display:grid;grid-template-columns:42px 1fr;gap:12px;padding:13px 0;border-bottom:1px solid var(--line)}.source-list li>span{color:var(--muted);font-size:12px}.source-list strong,.source-list small,.source-list a,.source-list em{display:block}.source-list small{color:var(--muted)}.quality{padding:18px;border:1px solid #e1c98e;background:#fff8e9}.quality h3{margin:0 0 8px}.quality ul{margin:0;padding-left:18px}@media(max-width:760px){.top-inner{display:grid}.hero h1{font-size:31px}.decision,.summary,.two,.spec-grid,.commercial{grid-template-columns:1fr}.top-inner,main{width:min(100% - 24px,1240px)}main{padding-top:28px}.section-head{display:block}.section-head p{margin-top:7px}.summary{gap:8px}}
.summary article small{display:block;margin-bottom:7px;color:var(--muted)}.two>*{min-width:0}.table-wrap{max-width:100%}
@media print{body{background:#fff}.top{position:static}.badge{border-color:#999}.print{display:none}.section{break-inside:avoid}.table-wrap{overflow:visible}main{width:100%;padding:20px}}
</style></head><body>
<header class="top"><div class="top-inner"><div class="brand">마케팅팀 대표 보고</div><div class="meta"><span class="badge ${job.mode === "codex" ? "live" : ""}">${modeLabel}</span><span class="badge">${escapeHtml(modelLabel)}</span><span class="badge">${statusLabel}</span><span class="badge">${escapeHtml(generatedAt)}</span><button class="print" type="button" onclick="window.print()">PDF 저장</button></div></div></header>
<main><section class="hero"><p class="eyebrow">${escapeHtml(job.request.product)} · ${escapeHtml(job.request.stage)}</p><h1>${escapeHtml(report.title)}</h1><p>${escapeHtml(report.executiveSummary[0] || "")}</p><div class="decision"><div><small>마케팅팀 제안</small><strong>${escapeHtml(report.decision.recommendation)}</strong></div><div><small>대표 승인 요청</small><strong>${escapeHtml(report.decision.requestedApproval)}</strong></div><div><small>신뢰도</small><strong>${escapeHtml(confidence(report.decision.confidence))}</strong></div></div></section>
<section class="summary">${report.executiveSummary.slice(0,3).map((item, index) => `<article><small>${String(index + 1).padStart(2,"0")}</small><strong>${escapeHtml(item)}</strong></article>`).join("")}</section>
<section class="section"><div class="section-head"><h2>시장 신호</h2><p>관측된 사실과 사업적 의미를 분리했습니다.</p></div><div class="table-wrap"><table><thead><tr><th>신호</th><th>근거</th><th>우리에게 의미하는 것</th><th>출처</th></tr></thead><tbody>${marketRows}</tbody></table></div></section>
<section class="section"><div class="section-head"><h2>경쟁 제품 비교</h2><p>실제 판매 URL·가격·리뷰·제품별 매출 추정·약점을 같은 기준으로 비교했습니다.</p></div><div class="table-wrap"><table><thead><tr><th>브랜드·제품</th><th>가격·리뷰</th><th>성공 요인</th><th>월매출 추정</th><th>약점</th><th>출처</th></tr></thead><tbody>${competitorRows}</tbody></table></div></section>
<section class="section"><div class="section-head"><h2>고객 반응</h2><p>${escapeHtml(report.voc.sampleNote)}</p></div><div class="two"><div><h3>만족 포인트</h3><div class="table-wrap"><table><thead><tr><th>주제</th><th>고객 언어</th><th>숨은 필요</th><th>제품 반영</th><th>출처</th></tr></thead><tbody>${clusterRows(report.voc.satisfaction, sourceMap)}</tbody></table></div></div><div><h3>불만 포인트</h3><div class="table-wrap"><table><thead><tr><th>주제</th><th>고객 언어</th><th>숨은 필요</th><th>제품 반영</th><th>출처</th></tr></thead><tbody>${clusterRows(report.voc.dissatisfaction, sourceMap)}</tbody></table></div></div></div></section>
<section class="section"><div class="section-head"><h2>성공 원인</h2><p>인기라는 결과 대신 제품·가격·채널·마케팅 요인을 분해했습니다.</p></div><div class="cause-list">${report.successCauses.map((item) => `<article class="cause"><h3>${escapeHtml(item.cause)} <small>${escapeHtml(item.type)}</small></h3><p><strong>근거</strong> ${escapeHtml(item.evidence)}</p><p><strong>우리의 적용</strong> ${escapeHtml(item.implication)}</p></article>`).join("")}</div></section>
<section class="section"><div class="section-head"><h2>구매 고객</h2><p>연령·발달 단계와 구매 목적을 함께 정의했습니다.</p></div><div class="persona-list">${report.personas.map((item) => `<article class="persona"><h3>${escapeHtml(item.name)}</h3><p><strong>${escapeHtml(item.ageStage)}</strong> · ${escapeHtml(item.buyer)} · ${escapeHtml(item.purpose)}</p><p><strong>우선순위</strong> ${escapeHtml(item.priorities.join(" · "))}</p><p><strong>불안</strong> ${escapeHtml(item.anxieties.join(" · "))}</p><p><strong>필요한 증거</strong> ${escapeHtml(item.proofNeeds.join(" · "))}</p></article>`).join("")}</div></section>
<section class="section"><div class="section-head"><h2>우리 브랜드 상품 제안</h2><p>${escapeHtml(report.productProposal.concept)} · ${escapeHtml(report.productProposal.targetUser)}</p></div><div class="spec-grid"><div class="band"><h3>필수 스펙</h3>${list(report.productProposal.requiredSpecs)}</div><div class="band"><h3>선택 스펙</h3>${list(report.productProposal.optionalSpecs)}</div><div class="band"><h3>사용하지 않을 표현</h3>${list(report.productProposal.blockedClaims)}</div></div><div class="band" style="margin-top:14px"><h3>가격 포지셔닝</h3><p>${escapeHtml(report.productProposal.pricePositioning)}</p></div></section>
<section class="section"><div class="section-head"><h2>매출 추정 기준</h2><p>단일 숫자가 아니라 산식과 가정 범위를 공개합니다.</p></div><div class="commercial"><div><small>산식</small><strong>${escapeHtml(report.commercialEstimate.formula)}</strong><span>${escapeHtml(report.commercialEstimate.basis)}</span></div><div><small>보수</small><strong>${escapeHtml(report.commercialEstimate.low)}</strong></div><div><small>기준</small><strong>${escapeHtml(report.commercialEstimate.base)}</strong></div><div><small>낙관</small><strong>${escapeHtml(report.commercialEstimate.high)}</strong></div></div><div class="two" style="margin-top:14px"><div class="band"><h3>가정</h3>${list(report.commercialEstimate.assumptions)}</div><div class="band"><h3>한계</h3>${list(report.commercialEstimate.limitations)}</div></div></section>
<section class="section"><div class="section-head"><h2>런칭 검증</h2><p>큰 투자 전에 작은 행동 데이터로 판단합니다.</p></div><div class="test-list">${report.productProposal.launchTests.map((item) => `<article class="test"><h3>${escapeHtml(item.hypothesis)}</h3><p><strong>대상</strong> ${escapeHtml(item.audience)} · <strong>제안</strong> ${escapeHtml(item.offer)}</p><p><strong>지표</strong> ${escapeHtml(item.metric)}</p><p><strong>판정</strong> ${escapeHtml(item.decisionRule)}</p></article>`).join("")}</div></section>
<section class="section"><div class="two"><div class="band"><h2>리스크</h2>${list(report.risks)}</div><div class="band"><h2>다음 행동</h2>${list(report.nextActions)}</div></div></section>
${quality.warnings.length ? `<section class="section"><aside class="quality"><h3>제출 전 확인할 항목</h3>${list(quality.warnings)}</aside></section>` : ""}
<section class="section"><div class="section-head"><h2>근거 목록</h2><p>모든 웹 근거는 확인일과 함께 보관합니다.</p></div><ol class="source-list">${sourceRows}</ol></section>
</main></body></html>`;
}

export {escapeHtml};
