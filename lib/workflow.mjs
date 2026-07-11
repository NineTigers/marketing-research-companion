import {randomUUID} from "node:crypto";
import {renderReport} from "./report-renderer.mjs";

export const AGENT_DEFINITIONS = [
  {id: "scope", label: "상품·고객 범위", owner: "마케팅 전략 책임자"},
  {id: "market", label: "시장 신호 조사", owner: "시장 조사 담당"},
  {id: "competitor", label: "경쟁 제품 분석", owner: "경쟁 분석 담당"},
  {id: "voc", label: "고객 VOC 분석", owner: "고객 인사이트 담당"},
  {id: "synthesis", label: "상품·가격 제안", owner: "상품 전략 담당"},
  {id: "visual", label: "상품 사용 장면", owner: "비주얼 기획 담당"},
  {id: "safety", label: "연령·안전 검토", owner: "안전 검토 담당"},
  {id: "strategy", label: "사업 판단 검토", owner: "전략팀"},
  {id: "teacher", label: "근거·설명 품질", owner: "티처팀"},
  {id: "report", label: "대표 보고서 작성", owner: "마케팅팀장"}
];

function initialAgents(request) {
  return AGENT_DEFINITIONS.map((agent) => ({
    ...agent,
    status: agent.id === "visual" && !request.generateImages ? "skipped" : "waiting",
    startedAt: null,
    completedAt: agent.id === "visual" && !request.generateImages ? new Date().toISOString() : null,
    note: agent.id === "visual" && !request.generateImages ? "선택하지 않음" : ""
  }));
}

export function normalizeRequest(input) {
  const clean = (value, max = 5000) => String(value || "").trim().slice(0, max);
  const list = (value, maxItems = 20) => Array.isArray(value) ? value.map((item) => clean(item, 500)).filter(Boolean).slice(0, maxItems) : [];
  const request = {
    product: clean(input.product, 200),
    stage: clean(input.stage, 200),
    taskId: clean(input.taskId, 100),
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
    generateImages: input.generateImages === true
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

function qualityReview(report, sources, mode, request, generatedImage) {
  const warnings = [];
  const checks = [];
  const check = (label, pass, warning) => {
    checks.push({label, pass});
    if (!pass && warning) warnings.push(warning);
  };
  check("시장 근거", report.marketSignals.length >= 2, "시장 신호가 2개 미만입니다.");
  check("경쟁 제품", report.competitors.length >= 3, "비교 가능한 경쟁 제품이 3개 미만입니다.");
  check("제품별 판매 근거", mode === "demo" || report.competitors.every((item) => /^https?:/.test(item.productUrl) && item.checkedAt), "실제 판매 URL 또는 확인일이 없는 경쟁 제품이 있습니다.");
  check("제품별 매출 산식", report.competitors.every((item) => item.salesEstimate?.formula && item.salesEstimate?.sourceRefs?.length), "제품별 매출 추정 산식 또는 입력 출처가 비어 있습니다.");
  check("매출 역산 단계", report.competitors.every((item) => {
    const estimate = item.salesEstimate || {};
    return estimate.method && estimate.period && estimate.priceBasis && estimate.inputs?.length && estimate.demandSignals?.length && estimate.assumptions?.length;
  }), "공식 판매량·구매 수·리뷰·조회·댓글 신호 중 적용 단계와 가격 근거가 완전하게 기록되지 않았습니다.");
  check("매출 추정 실행", mode === "demo" || report.competitors.some((item) => item.salesEstimate?.method !== "insufficient"), "경쟁 제품 중 계산 가능한 매출 추정치가 없습니다.");
  check("VOC 만족·불만", report.voc.satisfaction.length > 0 && report.voc.dissatisfaction.length > 0, "VOC의 만족 또는 불만 분석이 비어 있습니다.");
  check("VOC 출처 연결", report.voc.satisfaction.concat(report.voc.dissatisfaction).every((item) => item.sourceRefs?.length), "VOC 클러스터 중 원문 출처가 연결되지 않은 항목이 있습니다.");
  check("페르소나", report.personas.length > 0, "구매 페르소나가 없습니다.");
  check("상품 스펙", report.productProposal.requiredSpecs.length > 0, "자사 필수 스펙이 없습니다.");
  check("가격·산식", Boolean(report.commercialEstimate.formula), "매출 추정 산식이 없습니다.");
  if (request.generateImages) check("선택 이미지 생성", Boolean(generatedImage?.url), "선택한 상품 사용 장면 이미지를 생성하지 못했습니다.");
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

export async function runResearchJob({jobId, store, provider, signal}) {
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

    if (request.generateImages) {
      await updateAgent(store, jobId, "visual", "running", "자사 제안 스펙을 사용 장면으로 구현 중");
      try {
        if (typeof provider.generateProductImage !== "function") throw new Error("현재 실행 모드는 이미지 생성을 지원하지 않습니다.");
        assertNotCancelled(signal);
        const result = await provider.generateProductImage({request, report, signal});
        const asset = await store.writeGeneratedImage(jobId, result);
        generatedImage = {
          url: `/api/jobs/${jobId}/assets/${asset.name}`,
          revisedPrompt: result.revisedPrompt || null,
          generatedAt: new Date().toISOString()
        };
        await store.updateJob(jobId, {generatedImage});
        await updateAgent(store, jobId, "visual", "completed", "자사 제안 상품 실사용 이미지 생성 완료");
      } catch (error) {
        if (error.name === "AbortError" || signal?.aborted) throw error;
        visualWarnings.push(`상품 사용 장면 이미지: ${error.message}`);
        await updateAgent(store, jobId, "visual", "warning", error.message);
      }
    }

    await updateAgent(store, jobId, "safety", "running");
    const safetyWarnings = safetyReview(request, report);
    await updateAgent(store, jobId, "safety", safetyWarnings.length ? "warning" : "completed", safetyWarnings.join(" "));

    await updateAgent(store, jobId, "strategy", "running");
    const strategyNote = `${report.decision.recommendation} / ${report.decision.requestedApproval}`;
    await updateAgent(store, jobId, "strategy", "completed", strategyNote);

    await updateAgent(store, jobId, "teacher", "running");
    const quality = qualityReview(report, sources, starting.mode, request, generatedImage);
    quality.warnings.push(...safetyWarnings, ...visualWarnings);
    await updateAgent(store, jobId, "teacher", quality.warnings.length ? "warning" : "completed", quality.warnings.length ? `${quality.warnings.length}개 확인 항목` : "근거·설명 기준 통과");

    await updateAgent(store, jobId, "report", "running");
    const current = await store.getJob(jobId);
    const html = renderReport({job: current, report, sources, quality});
    const artifacts = await store.writeReport(jobId, html, {request, report, sources, quality, generatedImage, mode: starting.mode, model: starting.model, reasoningEffort: starting.reasoningEffort});
    await updateAgent(store, jobId, "report", "completed", "대표 보고서 생성 완료");
    return store.updateJob(jobId, {
      status: quality.warnings.length ? "completed_with_warnings" : "completed",
      activeAgent: null,
      sources,
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
