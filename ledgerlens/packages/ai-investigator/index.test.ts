import {describe,expect,it} from "bun:test";
import {
  generateInvestigationReport,
  generateExecutiveSummary,
  askInvestigationQuestion,
  getAiProviderInfo,
  getActiveProvider
} from "./index";
import {
  FinancialRecord,
  ReconciliationResult,
  CandidateMatch,
  ReconciliationSummary
} from "@ledgerlens/shared";
describe("AI Investigator Package",()=>{
  const mockOrder:FinancialRecord={
    id:"ord_100",
    type:"ORDER",
    amount:10050,
    currency:"USD",
    timestamp:new Date("2026-01-01T10:00:00Z"),
    reference:"REF-100",
    merchantId:"merch_1"
  };
  const mockPayment:FinancialRecord={
    id:"pay_100",
    type:"PAYMENT",
    amount:10050,
    currency:"USD",
    timestamp:new Date("2026-01-01T10:02:00Z"),
    reference:"REF-100",
    paymentMethod:"card"
  };
  const mockCandidate:CandidateMatch={
    sourceRecordId:"ord_100",
    targetRecordId:"pay_100",
    sourceType:"ORDER",
    targetType:"PAYMENT",
    reasons:["EXACT_REFERENCE","CURRENCY_COMPATIBLE","AMOUNT_COMPATIBLE","TIME_WINDOW_COMPATIBLE"]
  };
  const resolvedResult:ReconciliationResult={
    sourceRecordId:"ord_100",
    sourceType:"ORDER",
    status:"RESOLVED",
    matchedRecordIds:["pay_100"],
    candidateRecordIds:["pay_100"],
    evidenceScore:140,
    reasons:["EXACT_REFERENCE","CURRENCY_COMPATIBLE","AMOUNT_COMPATIBLE","TIME_WINDOW_COMPATIBLE"]
  };
  const ambiguousResult:ReconciliationResult={
    sourceRecordId:"ord_100",
    sourceType:"ORDER",
    status:"AMBIGUOUS",
    matchedRecordIds:[],
    candidateRecordIds:["pay_100a","pay_100b"],
    evidenceScore:140,
    reasons:[]
  };
  const unmatchedResult:ReconciliationResult={
    sourceRecordId:"ord_100",
    sourceType:"ORDER",
    status:"UNMATCHED",
    matchedRecordIds:[],
    candidateRecordIds:[],
    evidenceScore:0,
    reasons:[]
  };
  it("defaults to deterministic-fallback when no API key is provided",()=>{
    const info=getAiProviderInfo({preferredProvider:"deterministic-fallback"});
    expect(info.provider).toBe("deterministic-fallback");
    expect(info.isAiConfigured).toBe(false);
  });
  it("generates structured investigation report for RESOLVED status",async()=>{
    const report=await generateInvestigationReport({
      record:mockOrder,
      result:resolvedResult,
      candidates:[mockCandidate]
    },{preferredProvider:"deterministic-fallback"});
    expect(report.riskLevel).toBe("LOW");
    expect(report.summary).toContain("ord_100");
    expect(report.summary).toContain("pay_100");
    expect(report.keyEvidence.length).toBeGreaterThan(0);
    expect(report.recommendedAction.length).toBeGreaterThan(0);
    expect(report.questionsToInvestigate.length).toBeGreaterThan(0);
    expect(report.provider).toBe("deterministic-fallback");
  });
  it("generates structured investigation report for AMBIGUOUS status with HIGH risk",async()=>{
    const report=await generateInvestigationReport({
      record:mockOrder,
      result:ambiguousResult,
      candidates:[
        {...mockCandidate,targetRecordId:"pay_100a"},
        {...mockCandidate,targetRecordId:"pay_100b"}
      ]
    },{preferredProvider:"deterministic-fallback"});
    expect(report.riskLevel).toBe("HIGH");
    expect(report.summary).toContain("competing candidates");
    expect(report.whyThisStatus).toContain("tied for the highest evidence score");
    expect(report.recommendedAction).toContain("Hold");
    expect(report.questionsToInvestigate.length).toBeGreaterThan(0);
  });
  it("generates structured investigation report for UNMATCHED status",async()=>{
    const report=await generateInvestigationReport({
      record:mockOrder,
      result:unmatchedResult,
      candidates:[]
    },{preferredProvider:"deterministic-fallback"});
    expect(report.summary).toContain("could not be matched");
    expect(report.whyThisStatus).toContain("Zero candidates");
    expect(report.recommendedAction).toContain("exception review");
  });
  it("generates executive summary with exact counts",async()=>{
    const summaryData:ReconciliationSummary={
      totalInputRecords:100,
      acceptedRecords:98,
      rejectedRecords:2,
      resolved:80,
      ambiguous:10,
      unmatched:8,
      candidateCount:95
    };
    const exec=await generateExecutiveSummary(summaryData,{preferredProvider:"deterministic-fallback"});
    expect(exec.overview).toContain("100");
    expect(exec.overview).toContain("80");
    expect(exec.keyFindings.length).toBeGreaterThanOrEqual(3);
    expect(exec.attentionRequired.length).toBeGreaterThanOrEqual(1);
    expect(exec.recommendedNextSteps.length).toBeGreaterThanOrEqual(1);
  });
  it("answers contextual investigation questions accurately in fallback mode",async()=>{
    const whyAnswer=await askInvestigationQuestion("Why was this record resolved?",{
      record:mockOrder,
      result:resolvedResult,
      candidates:[mockCandidate]
    },{preferredProvider:"deterministic-fallback"});
    expect(whyAnswer.answer).toContain("RESOLVED");
    expect(whyAnswer.answer).toContain("pay_100");
    const riskAnswer=await askInvestigationQuestion("What is the risk level?",{
      record:mockOrder,
      result:ambiguousResult,
      candidates:[]
    },{preferredProvider:"deterministic-fallback"});
    expect(riskAnswer.answer).toContain("Risk is HIGH");
    const actionAnswer=await askInvestigationQuestion("What action should the analyst take?",{
      record:mockOrder,
      result:unmatchedResult,
      candidates:[]
    },{preferredProvider:"deterministic-fallback"});
    expect(actionAnswer.answer).toContain("action");
  });
  it("falls back gracefully when AI key is invalid or network fails",async()=>{
    const report=await generateInvestigationReport({
      record:mockOrder,
      result:resolvedResult,
      candidates:[mockCandidate]
    },{
      preferredProvider:"gemini",
      geminiApiKey:"invalid_dummy_key_for_test",
      timeoutMs:500
    });
    expect(report.summary.length).toBeGreaterThan(0);
    expect(report.provider).toBe("deterministic-fallback");
  });
});
