const stringArray = {type: "array", items: {type: "string"}};

const cluster = {
  type: "object",
  additionalProperties: false,
  required: ["label", "observedLanguage", "frequencySignal", "mentionCount", "sampleSize", "sharePercent", "channels", "period", "need", "productImplication", "confidence", "sourceRefs"],
  properties: {
    label: {type: "string"},
    observedLanguage: stringArray,
    frequencySignal: {type: "string"},
    mentionCount: {type: "number", minimum: 0},
    sampleSize: {type: "number", minimum: 0},
    sharePercent: {type: "number", minimum: 0, maximum: 100},
    channels: stringArray,
    period: {type: "string"},
    need: {type: "string"},
    productImplication: {type: "string"},
    confidence: {type: "string", enum: ["high", "medium", "low"]},
    sourceRefs: stringArray
  }
};

const salesEstimate = {
  type: "object",
  additionalProperties: false,
  required: ["method", "period", "basis", "formula", "inputs", "priceBasis", "demandSignals", "assumptions", "low", "base", "high", "confidence", "calculationInput", "sourceRefs", "limitations"],
  properties: {
    method: {type: "string", enum: ["official_revenue", "official_sales", "order_count", "review_backcast", "traffic_backcast", "engagement_backcast", "insufficient"]},
    period: {type: "string"},
    basis: {type: "string"},
    formula: {type: "string"},
    inputs: stringArray,
    priceBasis: {type: "string"},
    demandSignals: stringArray,
    assumptions: stringArray,
    low: {type: "string"},
    base: {type: "string"},
    high: {type: "string"},
    confidence: {type: "string", enum: ["high", "medium", "low"]},
    calculationInput: {
      type: "object",
      additionalProperties: false,
      required: ["currency", "periodMonths", "price", "signalValue", "rateLow", "rateBase", "rateHigh", "reportedRevenue"],
      properties: {
        currency: {type: "string"},
        periodMonths: {type: "number", minimum: 0},
        price: {type: "number", minimum: 0},
        signalValue: {type: "number", minimum: 0},
        rateLow: {type: "number", minimum: 0},
        rateBase: {type: "number", minimum: 0},
        rateHigh: {type: "number", minimum: 0},
        reportedRevenue: {type: "number", minimum: 0}
      }
    },
    sourceRefs: stringArray,
    limitations: stringArray
  }
};

const taskCandidate = {
  type: "object",
  additionalProperties: false,
  required: ["brand", "product", "productUrl", "price", "decision", "rationale", "tradeoff", "sourceRefs"],
  properties: {
    brand: {type: "string"}, product: {type: "string"}, productUrl: {type: "string"}, price: {type: "string"},
    decision: {type: "string"}, rationale: {type: "string"}, tradeoff: {type: "string"}, sourceRefs: stringArray
  }
};

const taskOutcome = {
  type: "object",
  additionalProperties: false,
  required: ["taskId", "summary", "recommendationItems", "mdCandidates", "distributionCandidates", "evidenceChecks", "opportunities"],
  properties: {
    taskId: {type: "string", enum: ["voc", "market", "md", "distribution", "recommendation", "evidence", "custom"]},
    summary: {type: "string"},
    recommendationItems: {type: "array", items: taskCandidate},
    mdCandidates: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["brand", "product", "productUrl", "decision", "demand", "moq", "unitCost", "expectedMargin", "risk", "nextAction", "sourceRefs"],
        properties: {
          brand: {type: "string"}, product: {type: "string"}, productUrl: {type: "string"},
          decision: {type: "string", enum: ["PASS", "HOLD", "FAIL"]}, demand: {type: "string"}, moq: {type: "string"},
          unitCost: {type: "string"}, expectedMargin: {type: "string"}, risk: {type: "string"}, nextAction: {type: "string"}, sourceRefs: stringArray
        }
      }
    },
    distributionCandidates: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["rank", "brand", "product", "productUrl", "ninetyDayGmv", "expectedMargin", "negotiationTerms", "claimRisk", "stopCondition", "sourceRefs"],
        properties: {
          rank: {type: "number", minimum: 1}, brand: {type: "string"}, product: {type: "string"}, productUrl: {type: "string"},
          ninetyDayGmv: {type: "string"}, expectedMargin: {type: "string"}, negotiationTerms: {type: "string"},
          claimRisk: {type: "string"}, stopCondition: {type: "string"}, sourceRefs: stringArray
        }
      }
    },
    evidenceChecks: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["brand", "product", "productUrl", "status", "matched", "mismatches", "sourceRefs"],
        properties: {
          brand: {type: "string"}, product: {type: "string"}, productUrl: {type: "string"},
          status: {type: "string", enum: ["MATCH", "PARTIAL", "MISMATCH"]}, matched: stringArray, mismatches: stringArray, sourceRefs: stringArray
        }
      }
    },
    opportunities: stringArray
  }
};

const chart = {
  type: "object",
  additionalProperties: false,
  required: ["evidenceId", "type", "title", "unit", "note", "sourceRefs", "points"],
  properties: {
    evidenceId: {type: "string"},
    type: {type: "string", enum: ["bar", "stacked", "line", "scatter", "range", "matrix"]},
    title: {type: "string"}, unit: {type: "string"}, note: {type: "string"}, sourceRefs: stringArray,
    points: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["label", "value", "secondaryValue", "low", "high", "group"],
        properties: {
          label: {type: "string"}, value: {type: "number"}, secondaryValue: {type: "number"},
          low: {type: "number"}, high: {type: "number"}, group: {type: "string"}
        }
      }
    }
  }
};

export const reportSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "title", "decision", "executiveSummary", "marketSignals", "competitors", "voc",
    "successCauses", "personas", "productProposal", "commercialEstimate", "taskOutcome", "charts", "risks", "nextActions"
  ],
  properties: {
    title: {type: "string"},
    decision: {
      type: "object",
      additionalProperties: false,
      required: ["recommendation", "requestedApproval", "confidence"],
      properties: {
        recommendation: {type: "string"},
        requestedApproval: {type: "string"},
        confidence: {type: "string", enum: ["high", "medium", "low"]}
      }
    },
    executiveSummary: stringArray,
    marketSignals: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["signal", "evidence", "implication", "sourceRefs"],
        properties: {
          signal: {type: "string"},
          evidence: {type: "string"},
          implication: {type: "string"},
          sourceRefs: stringArray
        }
      }
    },
    competitors: {
      type: "array",
      minItems: 3,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["brand", "product", "productUrl", "checkedAt", "price", "reviewSignal", "officialImageUrl", "officialImageSourceUrl", "officialImageCheckedAt", "successFactors", "weakness", "salesEstimate", "sourceRefs"],
        properties: {
          brand: {type: "string"},
          product: {type: "string"},
          productUrl: {type: "string"},
          checkedAt: {type: "string"},
          price: {type: "string"},
          reviewSignal: {type: "string"},
          officialImageUrl: {type: "string"},
          officialImageSourceUrl: {type: "string"},
          officialImageCheckedAt: {type: "string"},
          successFactors: stringArray,
          weakness: {type: "string"},
          salesEstimate,
          sourceRefs: stringArray
        }
      }
    },
    voc: {
      type: "object",
      additionalProperties: false,
      required: ["sampleNote", "sampleSize", "collectionPeriod", "channels", "satisfaction", "dissatisfaction", "repeatedKeywords"],
      properties: {
        sampleNote: {type: "string"},
        sampleSize: {type: "number", minimum: 0},
        collectionPeriod: {type: "string"},
        channels: stringArray,
        satisfaction: {type: "array", items: cluster},
        dissatisfaction: {type: "array", items: cluster},
        repeatedKeywords: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["keyword", "meaning", "frequencySignal", "mentionCount", "sampleSize", "sharePercent", "sourceRefs"],
            properties: {
              keyword: {type: "string"},
              meaning: {type: "string"},
              frequencySignal: {type: "string"},
              mentionCount: {type: "number", minimum: 0},
              sampleSize: {type: "number", minimum: 0},
              sharePercent: {type: "number", minimum: 0, maximum: 100},
              sourceRefs: stringArray
            }
          }
        }
      }
    },
    successCauses: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["cause", "type", "evidence", "implication", "sourceRefs"],
        properties: {
          cause: {type: "string"},
          type: {type: "string"},
          evidence: {type: "string"},
          implication: {type: "string"},
          sourceRefs: stringArray
        }
      }
    },
    personas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "ageStage", "buyer", "purpose", "priorities", "anxieties", "proofNeeds", "sourceRefs"],
        properties: {
          name: {type: "string"},
          ageStage: {type: "string"},
          buyer: {type: "string"},
          purpose: {type: "string"},
          priorities: stringArray,
          anxieties: stringArray,
          proofNeeds: stringArray,
          sourceRefs: stringArray
        }
      }
    },
    productProposal: {
      type: "object",
      additionalProperties: false,
      required: ["concept", "targetUser", "requiredSpecs", "optionalSpecs", "blockedClaims", "pricePositioning", "launchTests"],
      properties: {
        concept: {type: "string"},
        targetUser: {type: "string"},
        requiredSpecs: stringArray,
        optionalSpecs: stringArray,
        blockedClaims: stringArray,
        pricePositioning: {type: "string"},
        launchTests: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["hypothesis", "audience", "offer", "metric", "decisionRule"],
            properties: {
              hypothesis: {type: "string"},
              audience: {type: "string"},
              offer: {type: "string"},
              metric: {type: "string"},
              decisionRule: {type: "string"}
            }
          }
        }
      }
    },
    commercialEstimate: {
      type: "object",
      additionalProperties: false,
      required: ["basis", "formula", "low", "base", "high", "assumptions", "limitations"],
      properties: {
        basis: {type: "string"},
        formula: {type: "string"},
        low: {type: "string"},
        base: {type: "string"},
        high: {type: "string"},
        assumptions: stringArray,
        limitations: stringArray
      }
    },
    taskOutcome,
    charts: {type: "array", items: chart},
    risks: stringArray,
    nextActions: stringArray
  }
};
