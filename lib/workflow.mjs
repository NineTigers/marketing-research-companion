import {randomUUID} from "node:crypto";
import {renderReport} from "./report-renderer.mjs";
import {calculateReportSales} from "./commercial-calculator.mjs";
import {collectOfficialProductImages} from "./product-images.mjs";

export const AGENT_DEFINITIONS = [
  {id: "scope", label: "상품·고객 범위", owner: "마케팅 전략 책임자"},
  {id: "market", label: "시장 신호 조사", owner: "시장 조사 담당"},
  {id: "competitor", label: "경쟁 제품 분석", owner: "경쟁 분석 담당"},
  {id: "voc", label: "고객 VOC 분석", owner: "고객 인사이트 담당"},
  {id: "synthesis", label: "상품·가격 제안", owner: "상품 전략 담당"},
  {id: "visual", label: "제품 이미지 근거", owner: "비주얼 기획 담당"},
  {id: "safety", label: "연령·안전 검토", owner: "안전 검토 담당"},
  {id: "strategy", label: "사업 판단 검토", owner: "전략팀"},
  {id: "teacher", label: "근거·설명 품질", owner: "티처팀"},
  {id: "report", label: "대표 보고서 작성", owner: "마케팅팀장"}
];

function initialAgents(request) {
  return AGENT_DEFINITIONS.map((agent) => ({
    ...agent,
    status: "waiting",
    startedAt: null,
    completedAt: null,
    note: agent.id === "visual" ? (request.generateImages ? "공식 이미지와 동일 제품 사용 장면 수집" : "공식 제품 이미지만 수집") : ""
  }));
}

export function normalizeRequest(input) {
  const clean = (value, max = 5000) => String(value || "").trim().slice(0, max);
  const list = (value, maxItems = 20) => Array.isArray(value) ? value.map((item) => clean(item, 500)).filter(Boolean).slice(0, maxItems) : [];
  const allowedTasks = new Set(["voc", "market", "md", "distribution", "recommendation", "evidence"]);
  const allowedCharts = new Set(["bar", "stacked", "line", "scatter", "range", "matrix"]);
  const chartPlan = Array.isArray(input.chartPlan) ? input.chartPlan.map((item) => ({
    evidenceId: clean(item?.evidenceId, 100),
    evidenceLabel: clean(item?.evidenceLabel, 200),
    chartType: clean(item?.chartType, 30),
    chartLabel: clean(item?.chartLabel, 100)
  })).filter((item) => item.evidenceId && allowedCharts.has(item.chartType)).slice(0, 10) : [];
  const rawTaskId = clean(input.taskId, 100);
  const request = {
    product: clean(input.product, 200),
    stage: clean(input.stage, 200),
    taskId: allowedTasks.has(rawTaskId) ? rawTaskId : "custom",
    taskLabel: clean(input.taskLabel, 200),
    decision: clean(input.decision, 300),
    marketRegion: clean(input.marketRegion, 200) || "대한민국 우선, 글로벌 벤치마크 보완",
    context: clean(input.context, 5000),
    evidence: list(input.evidence, 20),
    vocText: clean(input.vocText, 30000),
    sourceUrls: list(input.sourceUrls, 20).filter((url) => {
      try { return ["http:", "https:"].includes(new URL(url).protocol); }
      catch (_) { return false; }
    }),
    depth: ["quick", "standard", "deep"].includes(input.depth) ? input.depth : "standard",
    generateImages: input.generateImages === true,
    chartPlan
  };
  const missing = ["product", "stage", "decision"].filter((key) => !request[key]);
  if (missing.length) throw new Error("필수 입력이 없습니다: " + missing.join(", "));
  return request;
}

export function createJobRecord(request, config) {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    code: "RSH-" + now.slice(0, 10).replaceAll("-", "") + "-" + Math.random().toString(36).slice(2, 6).toUpperCase(),
    status: "queued",
    mode: config.mode,
    model: config.mode === "codex" ? config.model : "deterministic-demo",
    reasoningEffort: config.mode === "codex" ? config.reasoningEffort : "deterministic",
    request,
    agents: initialAgents(request),
    sources: [],
    quality: {warnings: [], checks: []},
    reportUrl: null,
    generatedImage: null,
    productVisuals: [],
    error: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null
  };
}

function mergeSources(groups) {
  const seen = new Set();
  return groups.flat().filter((source) => {
    if (!source?.url || seen.has(source.url)) return false;
    seen.add(source.url);
    return true;
  });
}

function gatherSourceRefs(value, output = []) {
  if (Array.isArray(value)) value.forEach((item) => gatherSourceRefs(item, output));
  else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (key === "sourceRefs" && Array.isArray(item)) output.push(...item);
      else gatherSourceRefs(item, output);
    }
  }
  return output;
}

function validWebUrl(value) {
  try { return ["http:", "https:"].includes(new URL(value).protocol); }
  catch (_) { return false; }
}

function qualityReview(report, sources, mode, request, productVisuals) {
  const warnings = [];
  const checks = [];
  const check = (label, pass, warning) => {
    checks.push({label, pass});
    if (!pass && warning) warnings.push(warning);
  };
  check("시장 근거", report.marketSignals.length >= 2, "시장 신호가 2개 미만입니다.");
  check("경쟁 제품", report.competitors.length >= 3, "비교 가능한 경쟁 제품이 3개 미만입니다.");
  const sourceSet = new Set((sources || []).map((source) => source.url));
  check("출처 원문", mode === "demo" || sources.every((source) => validWebUrl(source.url) && source.title && source.sourceType && /^\d{4}-\d{2}-\d{2}/.test(source.checkedAt)), "URL·제목·유형·확인일이 완전하지 않은 출처가 있습니다.");
  check("출처 참조 무결성", gatherSourceRefs(report).every((ref) => sourceSet.has(ref)), "보고서가 근거 목록에 없는 URL을 참조합니다.");
  check("제품별 판매 근거", mode === "demo" || report.competitors.every((item) => validWebUrl(item.productUrl) && item.checkedAt && sourceSet.has(item.productUrl)), "실제 판매 URL이 근거 목록과 연결되지 않은 경쟁 제품이 있습니다.");
  check("제품별 매출 산식", report.competitors.every((item) => item.salesEstimate?.formula && item.salesEstimate?.sourceRefs?.length), "제품별 매출 추정 산식 또는 입력 출처가 비어 있습니다.");
  check("매출 역산 단계", report.competitors.every((item) => {
    const estimate = item.salesEstimate || {};
    return estimate.method && estimate.period && estimate.priceBasis && estimate.inputs?.length && estimate.demandSignals?.length && estimate.assumptions?.length;
  }), "공식 판매량·구매 수·리뷰·조회·댓글 신호 중 적용 단계와 가격 근거가 완전하게 기록되지 않았습니다.");
  check("매출 계산 검산", mode === "demo" || report.competitors.some((item) => item.salesEstimate?.calculated?.verified), "경쟁 제품 중 산식으로 검산된 월 판매량·매출 추정치가 없습니다.");
  check("VOC 만족·불만", report.voc.satisfaction.length > 0 && report.voc.dissatisfaction.length > 0, "VOC의 만족 또는 불만 분석이 비어 있습니다.");
  check("VOC 출처 연결", report.voc.satisfaction.concat(report.voc.dissatisfaction).every((item) => item.sourceRefs?.length), "VOC 클러스터 중 원문 출처가 연결되지 않은 항목이 있습니다.");
  check("VOC 표본 정의", mode === "demo" || (report.voc.sampleSize > 0 && report.voc.collectionPeriod && report.voc.channels?.length), "VOC 표본수·수집기간·채널이 완전하지 않습니다.");
  const vocRows = report.voc.satisfaction.concat(report.voc.dissatisfaction, report.voc.repeatedKeywords);
  check("VOC 빈도 검산", vocRows.every((item) => item.sampleSize > 0 && Math.abs(item.sharePercent - item.mentionCount / item.sampleSize * 100) <= 2), "VOC 언급수·표본수·비중 계산이 일치하지 않습니다.");
  check("페르소나", report.personas.length > 0, "구매 페르소나가 없습니다.");
  check("성공 원인 근거", report.successCauses.every((item) => item.sourceRefs?.length), "성공 원인 중 출처가 연결되지 않은 항목이 있습니다.");
  check("상품 스펙", report.productProposal.requiredSpecs.length > 0, "자사 필수 스펙이 없습니다.");
  check("가격·산식", Boolean(report.commercialEstimate.formula), "매출 추정 산식이 없습니다.");
  check("공식 제품 이미지", mode === "demo" || report.competitors.every((_, index) => productVisuals[index]?.official?.url), "공식 판매 페이지에서 회수한 제품 이미지가 없는 경쟁 제품이 있습니다.");
  if (request.generateImages) check("동일 제품 사용 장면", report.competitors.every((_, index) => productVisuals[index]?.generated?.url), "공식 제품 이미지를 참조한 동일 제품 사용 장면이 일부 누락되었습니다.");
  const outcome = report.taskOutcome || {};
  const competitorUrls = new Set(report.competitors.map((item) => item.productUrl));
  const outcomeCandidates = [
    ...(outcome.recommendationItems || []), ...(outcome.mdCandidates || []),
    ...(outcome.distributionCandidates || []), ...(outcome.evidenceChecks || [])
  ];
  check("업무 결과 일치", outcome.taskId === request.taskId, "선택한 업무와 보고서 결과 유형이 일치하지 않습니다.");
  check("후보·이미지 연결", outcomeCandidates.every((item) => competitorUrls.has(item.productUrl) && sourceSet.has(item.productUrl)), "업무 후보가 경쟁 제품·공식 이미지·근거 목록과 동일한 상품 URL로 연결되지 않았습니다.");
  if (request.taskId === "recommendation") check("추천 제품 4~5개", outcome.recommendationItems?.length >= 4 && outcome.recommendationItems?.length <= 5 && outcome.recommendationItems.every((item) => validWebUrl(item.productUrl)), "실제 구매 링크가 있는 추천 제품 4~5개가 필요합니다.");
  if (request.taskId === "md") check("MD 소싱 판정", outcome.mdCandidates?.length >= 3 && outcome.mdCandidates.every((item) => ["PASS", "HOLD", "FAIL"].includes(item.decision) && item.moq && item.unitCost && item.expectedMargin), "MD 후보별 판정·MOQ·원가·마진이 완전하지 않습니다.");
  if (request.taskId === "distribution") check("유통 사업성", outcome.distributionCandidates?.length >= 3 && outcome.distributionCandidates.every((item) => item.ninetyDayGmv && item.expectedMargin && item.negotiationTerms && item.stopCondition), "유통 후보별 90일 GMV·마진·협상·중단 조건이 완전하지 않습니다.");
  if (request.taskId === "evidence") check("제품 증거 대조", outcome.evidenceChecks?.length >= 3, "제품별 일치·불일치 증거 대조가 3개 미만입니다.");
  if (["voc", "market", "custom"].includes(request.taskId)) check("기회·결론", Boolean(outcome.summary) && outcome.opportunities?.length > 0, "업무 결론과 기회 항목이 비어 있습니다.");
  check("요청 차트", (request.chartPlan || []).every((plan) => report.charts.some((chart) => chart.evidenceId === plan.evidenceId && chart.type === plan.chartType && chart.points?.length && chart.sourceRefs?.length)), "선택한 근거·차트 유형이 보고서 수치 차트에 반영되지 않았습니다.");
  check("출처", mode === "demo" || sources.filter((source) => /^https?:/.test(source.url)).length >= 3, "실시간 웹 출처가 3개 미만입니다.");
  if (mode === "demo") warnings.unshift("이 보고서는 데모 모드 결과입니다. 실제 시장 판단 전에 live 조사를 실행해야 합니다.");
  return {warnings, checks};
}

function safetyReview(request, report) {
  const text = `${request.product} ${request.stage} ${request.context}`;
  const warnings = [];
  if (/신생아|0\s*[~-]\s*3개월|수면|베개/.test(text)) {
    warnings.push("수면 인접 육아용품은 연령·사용 맥락·감독 조건과 최신 안전 지침을 별도로 확인해야 합니다.");
  }
  if (!(report.productProposal.blockedClaims || []).length) warnings.push("사용 금지·검토 필요 표현이 정의되지 않았습니다.");
  return warnings;
}

async function updateAgent(store, jobId, agentId, status, note = "") {
  const job = await store.getJob(jobId);
  const now = new Date().toISOString();
  const agents = job.agents.map((agent) => agent.id === agentId ? {
    ...agent,
    status,
    note,
    startedAt: status === "running" ? now : agent.startedAt,
    completedAt: ["completed", "warning", "failed", "cancelled"].includes(status) ? now : agent.completedAt
  } : agent);
  return store.updateJob(jobId, {agents, activeAgent: agentId});
}

function assertNotCancelled(signal) {
  if (signal?.aborted) throw new DOMException("Research cancelled", "AbortError");
}

export async function runResearchJob({jobId, store, provider, signal, imageCollector = collectOfficialProductImages}) {
  const starting = await store.getJob(jobId);
  const request = starting.request;
  try {
    await store.updateJob(jobId, {status: "running", startedAt: new Date().toISOString()});
    await updateAgent(store, jobId, "scope", "running");
    assertNotCancelled(signal);
    await updateAgent(store, jobId, "scope", "completed", `${request.product} · ${request.stage} · ${request.decision}`);

    let sources;
    let report;
    let generatedImage = null;
    let productVisuals = [];
    const visualWarnings = [];
    if (typeof provider.fullResearch === "function") {
      for (const kind of ["market", "competitor", "voc", "synthesis"]) {
        await updateAgent(store, jobId, kind, "running", "사용자 Codex 통합 조사에서 함께 검토 중");
      }
      const result = await provider.fullResearch({request, signal});
      sources = mergeSources([result.sources || []]);
      report = result.report;
      await store.updateJob(jobId, {sources});
      await updateAgent(store, jobId, "market", "completed", "시장 신호와 제품군 경계 확인");
      await updateAgent(store, jobId, "competitor", "completed", `${report.competitors.length}개 직접 경쟁 제품 비교`);
      await updateAgent(store, jobId, "voc", "completed", "만족·불만·반복 키워드와 원문 출처 연결");
      await updateAgent(store, jobId, "synthesis", "completed", "VOC·경쟁 근거를 상품·가격 제안으로 전환");
    } else {
      const research = {};
      const sourceGroups = [];
      for (const kind of ["market", "competitor", "voc"]) {
        assertNotCancelled(signal);
        await updateAgent(store, jobId, kind, "running");
        const result = await provider.webResearch({kind, request, depth: request.depth, signal});
        research[kind] = result.text;
        sourceGroups.push(result.sources);
        await updateAgent(store, jobId, kind, "completed", `${result.sources.length}개 근거 연결`);
        await store.updateJob(jobId, {sources: mergeSources(sourceGroups)});
      }
      sources = mergeSources(sourceGroups);
      assertNotCancelled(signal);
      await updateAgent(store, jobId, "synthesis", "running");
      report = await provider.synthesize({request, research, sources, signal});
      await updateAgent(store, jobId, "synthesis", "completed", "VOC·경쟁 근거를 상품·가격 제안으로 전환");
    }

    report = calculateReportSales(report);

    await updateAgent(store, jobId, "visual", "running", request.generateImages ? "공식 이미지 수집 및 동일 제품 사용 장면 생성 중" : "공식 판매 페이지 제품 이미지 수집 중");
    if (starting.mode === "codex" || imageCollector !== collectOfficialProductImages) {
      productVisuals = await imageCollector({jobId, report, store});
      for (const visual of productVisuals) if (visual.warning) visualWarnings.push(`${visual.brand} ${visual.product}: ${visual.warning}`);
      if (request.generateImages) {
        if (typeof provider.generateProductUsageImage !== "function") visualWarnings.push("현재 실행 모드는 동일 제품 사용 장면 생성을 지원하지 않습니다.");
        else for (const visual of productVisuals) {
          if (!visual.official?.localPath) continue;
          try {
            assertNotCancelled(signal);
            const result = await provider.generateProductUsageImage({request, competitor: report.competitors[visual.index], referenceImagePath: visual.official.localPath, signal});
            const asset = await store.writeGeneratedImage(jobId, result, `competitor-${visual.index + 1}-generated`);
            visual.generated = {url: `/api/jobs/${jobId}/assets/${asset.name}`, revisedPrompt: result.revisedPrompt || null, generatedAt: new Date().toISOString()};
          } catch (error) {
            if (error.name === "AbortError" || signal?.aborted) throw error;
            visualWarnings.push(`${visual.brand} ${visual.product} 사용 장면: ${error.message}`);
          }
        }
      }
    }
    const persistedVisuals = productVisuals.map((visual) => ({...visual, official: visual.official ? (({localPath, ...safe}) => safe)(visual.official) : null}));
    await store.updateJob(jobId, {productVisuals: persistedVisuals});
    await updateAgent(store, jobId, "visual", visualWarnings.length ? "warning" : "completed", request.generateImages ? `${persistedVisuals.filter((item) => item.generated).length}개 동일 제품 사용 장면 연결` : `${persistedVisuals.filter((item) => item.official).length}개 공식 제품 이미지 연결`);

    await updateAgent(store, jobId, "safety", "running");
    const safetyWarnings = safetyReview(request, report);
    await updateAgent(store, jobId, "safety", safetyWarnings.length ? "warning" : "completed", safetyWarnings.join(" "));

    await updateAgent(store, jobId, "strategy", "running");
    const strategyNote = `${report.decision.recommendation} / ${report.decision.requestedApproval}`;
    await updateAgent(store, jobId, "strategy", "completed", strategyNote);

    await updateAgent(store, jobId, "teacher", "running");
    const quality = qualityReview(report, sources, starting.mode, request, persistedVisuals);
    quality.warnings.push(...safetyWarnings, ...visualWarnings);
    await updateAgent(store, jobId, "teacher", quality.warnings.length ? "warning" : "completed", quality.warnings.length ? `${quality.warnings.length}개 확인 항목` : "근거·설명 기준 통과");

    await updateAgent(store, jobId, "report", "running");
    const current = await store.getJob(jobId);
    const html = renderReport({job: current, report, sources, quality});
    const artifacts = await store.writeReport(jobId, html, {request, report, sources, quality, generatedImage, productVisuals: persistedVisuals, mode: starting.mode, model: starting.model, reasoningEffort: starting.reasoningEffort});
    await updateAgent(store, jobId, "report", "completed", "대표 보고서 생성 완료");
    return store.updateJob(jobId, {
      status: quality.warnings.length ? "completed_with_warnings" : "completed",
      activeAgent: null,
      sources,
      productVisuals: persistedVisuals,
      quality,
      reportUrl: `/api/jobs/${jobId}/report`,
      reportDataPath: artifacts.dataPath,
      completedAt: new Date().toISOString()
    });
  } catch (error) {
    const cancelled = error.name === "AbortError" || signal?.aborted;
    const current = await store.getJob(jobId);
    const agents = current.agents.map((agent) => agent.status === "running" ? {...agent, status: cancelled ? "cancelled" : "failed", completedAt: new Date().toISOString()} : agent);
    await store.updateJob(jobId, {
      status: cancelled ? "cancelled" : "failed",
      agents,
      activeAgent: null,
      error: cancelled ? "사용자가 조사를 중단했습니다." : error.message,
      completedAt: new Date().toISOString()
    });
    return null;
  }
}
