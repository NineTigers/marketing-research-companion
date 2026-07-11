const stringArray = {type: "array", items: {type: "string"}};

const cluster = {
  type: "object",
  additionalProperties: false,
  required: ["label", "observedLanguage", "frequencySignal", "need", "productImplication", "confidence", "sourceRefs"],
  properties: {
    label: {type: "string"},
    observedLanguage: stringArray,
    frequencySignal: {type: "string"},
    need: {type: "string"},
    productImplication: {type: "string"},
    confidence: {type: "string", enum: ["high", "medium", "low"]},
    sourceRefs: stringArray
  }
};

const salesEstimate = {
  type: "object",
  additionalProperties: false,
  required: ["basis", "formula", "inputs", "low", "base", "high", "confidence", "sourceRefs", "limitations"],
  properties: {
    basis: {type: "string"},
    formula: {type: "string"},
    inputs: stringArray,
    low: {type: "string"},
    base: {type: "string"},
    high: {type: "string"},
    confidence: {type: "string", enum: ["high", "medium", "low"]},
    sourceRefs: stringArray,
    limitations: stringArray
  }
};

export const reportSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "title", "decision", "executiveSummary", "marketSignals", "competitors", "voc",
    "successCauses", "personas", "productProposal", "commercialEstimate", "risks", "nextActions"
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
      items: {
        type: "object",
        additionalProperties: false,
        required: ["brand", "product", "productUrl", "checkedAt", "price", "reviewSignal", "successFactors", "weakness", "salesEstimate", "sourceRefs"],
        properties: {
          brand: {type: "string"},
          product: {type: "string"},
          productUrl: {type: "string"},
          checkedAt: {type: "string"},
          price: {type: "string"},
          reviewSignal: {type: "string"},
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
      required: ["sampleNote", "satisfaction", "dissatisfaction", "repeatedKeywords"],
      properties: {
        sampleNote: {type: "string"},
        satisfaction: {type: "array", items: cluster},
        dissatisfaction: {type: "array", items: cluster},
        repeatedKeywords: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["keyword", "meaning", "frequencySignal", "sourceRefs"],
            properties: {
              keyword: {type: "string"},
              meaning: {type: "string"},
              frequencySignal: {type: "string"},
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
        required: ["cause", "type", "evidence", "implication"],
        properties: {
          cause: {type: "string"},
          type: {type: "string"},
          evidence: {type: "string"},
          implication: {type: "string"}
        }
      }
    },
    personas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "ageStage", "buyer", "purpose", "priorities", "anxieties", "proofNeeds"],
        properties: {
          name: {type: "string"},
          ageStage: {type: "string"},
          buyer: {type: "string"},
          purpose: {type: "string"},
          priorities: stringArray,
          anxieties: stringArray,
          proofNeeds: stringArray
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
    risks: stringArray,
    nextActions: stringArray
  }
};
