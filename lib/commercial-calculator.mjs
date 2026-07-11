const METHOD_FORMULAS = {
  official_revenue: "공개 누적매출 ÷ 관측 개월",
  official_sales: "공식 누적 판매량 ÷ 관측 개월 × 적용 가격",
  order_count: "확인 주문수 ÷ 관측 개월 × 적용 가격",
  review_backcast: "리뷰수 ÷ 리뷰 작성률 ÷ 관측 개월 × 적용 가격",
  traffic_backcast: "조회수 × 구매전환율 ÷ 관측 개월 × 적용 가격",
  engagement_backcast: "댓글·관심 신호 × 구매전환율 ÷ 관측 개월 × 적용 가격",
  insufficient: "계산 가능한 수요 신호 확인 필요"
};

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function rounded(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(number(value) * factor) / factor;
}

function ordered(lowCandidate, baseCandidate, highCandidate) {
  const values = [number(lowCandidate), number(baseCandidate), number(highCandidate)];
  return {low: Math.min(...values), base: values[1], high: Math.max(...values)};
}

function currency(value, code) {
  if (!Number.isFinite(value)) return "확인 필요";
  const roundedValue = Math.round(value);
  if (code === "KRW") return `${roundedValue.toLocaleString("ko-KR")}원`;
  return `${code || "KRW"} ${roundedValue.toLocaleString("en-US")}`;
}

export function calculateSalesEstimate(estimate = {}) {
  const method = METHOD_FORMULAS[estimate.method] ? estimate.method : "insufficient";
  const input = estimate.calculationInput || {};
  const periodMonths = Math.max(number(input.periodMonths, 1), 0.01);
  const price = number(input.price);
  const signalValue = number(input.signalValue);
  const rates = [number(input.rateLow), number(input.rateBase), number(input.rateHigh)];
  const code = String(input.currency || "KRW").toUpperCase().slice(0, 8);
  let units = {low: 0, base: 0, high: 0};
  let revenue = {low: 0, base: 0, high: 0};

  if (method === "official_revenue") {
    const monthlyRevenue = number(input.reportedRevenue) / periodMonths;
    revenue = {low: monthlyRevenue, base: monthlyRevenue, high: monthlyRevenue};
    const monthlyUnits = price > 0 ? monthlyRevenue / price : 0;
    units = {low: monthlyUnits, base: monthlyUnits, high: monthlyUnits};
  } else if (["official_sales", "order_count"].includes(method)) {
    const monthlyUnits = signalValue / periodMonths;
    units = {low: monthlyUnits, base: monthlyUnits, high: monthlyUnits};
    revenue = {low: monthlyUnits * price, base: monthlyUnits * price, high: monthlyUnits * price};
  } else if (method === "review_backcast") {
    const calculated = rates.map((rate) => rate > 0 ? signalValue / rate / periodMonths : 0);
    units = ordered(calculated[0], calculated[1], calculated[2]);
    revenue = ordered(units.low * price, units.base * price, units.high * price);
  } else if (["traffic_backcast", "engagement_backcast"].includes(method)) {
    const calculated = rates.map((rate) => signalValue * rate / periodMonths);
    units = ordered(calculated[0], calculated[1], calculated[2]);
    revenue = ordered(units.low * price, units.base * price, units.high * price);
  }

  const verified = method !== "insufficient" && revenue.base > 0;
  const monthlyUnits = Object.fromEntries(Object.entries(units).map(([key, value]) => [key, rounded(value)]));
  const monthlyRevenue = Object.fromEntries(Object.entries(revenue).map(([key, value]) => [key, Math.round(value)]));
  return {
    ...estimate,
    formula: METHOD_FORMULAS[method],
    low: verified ? currency(monthlyRevenue.low, code) : "확인 필요",
    base: verified ? currency(monthlyRevenue.base, code) : "확인 필요",
    high: verified ? currency(monthlyRevenue.high, code) : "확인 필요",
    calculated: {verified, currency: code, monthlyUnits, monthlyRevenue}
  };
}

export function calculateReportSales(report) {
  return {
    ...report,
    competitors: (report.competitors || []).map((item) => ({
      ...item,
      salesEstimate: calculateSalesEstimate(item.salesEstimate)
    }))
  };
}

export {METHOD_FORMULAS};
