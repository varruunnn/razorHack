import {test,expect} from "bun:test";
import {discoverCandidates,resolveCandidates,MAX_TIME_WINDOW_MS,REASON_WEIGHTS} from "./index";
import {Order,Payment,Settlement,BankEntry,Refund,Adjustment,FinancialRecord,CandidateMatch} from "@ledgerlens/shared";
import {generateDataset} from "@ledgerlens/synthetic-data";
test("Same input produces identical output for discoverCandidates",()=>{
  const records:FinancialRecord[]=[
    {id:"ord_1",type:"ORDER",amount:10000,currency:"INR",timestamp:new Date("2026-01-01T00:00:00Z"),merchantId:"m_1",reference:"ref_1"},
    {id:"pay_1",type:"PAYMENT",amount:10000,currency:"INR",timestamp:new Date("2026-01-01T00:01:00Z"),paymentMethod:"card",reference:"ref_1"}
  ];
  const res1=discoverCandidates(records);
  const res2=discoverCandidates(records);
  expect(res1).toEqual(res2);
});
test("Input records are not mutated during discoverCandidates",()=>{
  const records:FinancialRecord[]=[
    {id:"ord_1",type:"ORDER",amount:10000,currency:"INR",timestamp:new Date("2026-01-01T00:00:00Z"),merchantId:"m_1",reference:"ref_1"},
    {id:"pay_1",type:"PAYMENT",amount:10000,currency:"INR",timestamp:new Date("2026-01-01T00:01:00Z"),paymentMethod:"card",reference:"ref_1"}
  ];
  const copy=JSON.parse(JSON.stringify(records));
  discoverCandidates(records);
  expect(JSON.parse(JSON.stringify(records))).toEqual(copy);
});
test("Unsupported type combinations never become candidates",()=>{
  const records:FinancialRecord[]=[
    {id:"ord_1",type:"ORDER",amount:10000,currency:"INR",timestamp:new Date("2026-01-01T00:00:00Z"),merchantId:"m_1",reference:"ref_1"},
    {id:"bnk_1",type:"BANK_ENTRY",amount:10000,currency:"INR",timestamp:new Date("2026-01-01T00:01:00Z"),bankReference:"b_1",reference:"ref_1"},
    {id:"stl_1",type:"SETTLEMENT",amount:10000,currency:"INR",timestamp:new Date("2026-01-01T00:02:00Z"),fees:0,reference:"ref_1"},
    {id:"pay_1",type:"PAYMENT",amount:10000,currency:"INR",timestamp:new Date("2026-01-01T00:03:00Z"),paymentMethod:"card",reference:"ref_1"}
  ];
  const candidates=discoverCandidates(records);
  for(let i=0;i<candidates.length;i++){
    const c=candidates[i];
    expect(
      (c.sourceType==="ORDER"&&c.targetType==="PAYMENT")||
      (c.sourceType==="PAYMENT"&&(c.targetType==="SETTLEMENT"||c.targetType==="REFUND"||c.targetType==="ADJUSTMENT"))||
      (c.sourceType==="SETTLEMENT"&&c.targetType==="BANK_ENTRY")
    ).toBe(true);
  }
});
test("Different currencies never become candidates",()=>{
  const records:FinancialRecord[]=[
    {id:"ord_1",type:"ORDER",amount:10000,currency:"INR",timestamp:new Date("2026-01-01T00:00:00Z"),merchantId:"m_1",reference:"ref_1"},
    {id:"pay_1",type:"PAYMENT",amount:10000,currency:"USD",timestamp:new Date("2026-01-01T00:01:00Z"),paymentMethod:"card",reference:"ref_1"}
  ];
  const candidates=discoverCandidates(records);
  expect(candidates.length).toBe(0);
});
test("Target before source never becomes a candidate",()=>{
  const records:FinancialRecord[]=[
    {id:"ord_1",type:"ORDER",amount:10000,currency:"INR",timestamp:new Date("2026-01-01T01:00:00Z"),merchantId:"m_1",reference:"ref_1"},
    {id:"pay_1",type:"PAYMENT",amount:10000,currency:"INR",timestamp:new Date("2026-01-01T00:00:00Z"),paymentMethod:"card",reference:"ref_1"}
  ];
  const candidates=discoverCandidates(records);
  expect(candidates.length).toBe(0);
});
test("Target outside the 7-day window never becomes a candidate",()=>{
  const t0=new Date("2026-01-01T00:00:00Z");
  const tWithin=new Date(t0.getTime()+MAX_TIME_WINDOW_MS);
  const tOutside=new Date(t0.getTime()+MAX_TIME_WINDOW_MS+1000);
  const records:FinancialRecord[]=[
    {id:"ord_1",type:"ORDER",amount:10000,currency:"INR",timestamp:t0,merchantId:"m_1",reference:"ref_1"},
    {id:"pay_within",type:"PAYMENT",amount:10000,currency:"INR",timestamp:tWithin,paymentMethod:"card",reference:"ref_1"},
    {id:"pay_outside",type:"PAYMENT",amount:10000,currency:"INR",timestamp:tOutside,paymentMethod:"card",reference:"ref_1"}
  ];
  const candidates=discoverCandidates(records);
  expect(candidates.some(c=>c.targetRecordId==="pay_within")).toBe(true);
  expect(candidates.some(c=>c.targetRecordId==="pay_outside")).toBe(false);
});
test("ORDER -> PAYMENT exact amount compatibility works",()=>{
  const records:FinancialRecord[]=[
    {id:"ord_1",type:"ORDER",amount:10000,currency:"INR",timestamp:new Date("2026-01-01T00:00:00Z"),merchantId:"m_1",reference:"ref_1"},
    {id:"pay_1",type:"PAYMENT",amount:10000,currency:"INR",timestamp:new Date("2026-01-01T00:01:00Z"),paymentMethod:"card",reference:"ref_1"}
  ];
  const candidates=discoverCandidates(records);
  expect(candidates.length).toBe(1);
  expect(candidates[0].sourceRecordId).toBe("ord_1");
  expect(candidates[0].targetRecordId).toBe("pay_1");
});
test("ORDER -> PAYMENT different amount does not produce a candidate",()=>{
  const records:FinancialRecord[]=[
    {id:"ord_1",type:"ORDER",amount:10000,currency:"INR",timestamp:new Date("2026-01-01T00:00:00Z"),merchantId:"m_1",reference:"ref_1"},
    {id:"pay_1",type:"PAYMENT",amount:9000,currency:"INR",timestamp:new Date("2026-01-01T00:01:00Z"),paymentMethod:"card",reference:"ref_1"}
  ];
  const candidates=discoverCandidates(records);
  expect(candidates.length).toBe(0);
});
test("PAYMENT -> SETTLEMENT allows target.amount <= source.amount",()=>{
  const records:FinancialRecord[]=[
    {id:"pay_1",type:"PAYMENT",amount:10000,currency:"INR",timestamp:new Date("2026-01-01T00:00:00Z"),paymentMethod:"card",reference:"ref_1"},
    {id:"stl_equal",type:"SETTLEMENT",amount:10000,currency:"INR",timestamp:new Date("2026-01-01T01:00:00Z"),fees:0,reference:"ref_1"},
    {id:"stl_less",type:"SETTLEMENT",amount:9500,currency:"INR",timestamp:new Date("2026-01-01T02:00:00Z"),fees:500,reference:"ref_1"}
  ];
  const candidates=discoverCandidates(records);
  expect(candidates.some(c=>c.targetRecordId==="stl_equal")).toBe(true);
  expect(candidates.some(c=>c.targetRecordId==="stl_less")).toBe(true);
});
test("PAYMENT -> SETTLEMENT rejects target.amount > source.amount",()=>{
  const records:FinancialRecord[]=[
    {id:"pay_1",type:"PAYMENT",amount:10000,currency:"INR",timestamp:new Date("2026-01-01T00:00:00Z"),paymentMethod:"card",reference:"ref_1"},
    {id:"stl_more",type:"SETTLEMENT",amount:10500,currency:"INR",timestamp:new Date("2026-01-01T01:00:00Z"),fees:0,reference:"ref_1"}
  ];
  const candidates=discoverCandidates(records);
  expect(candidates.length).toBe(0);
});
test("PAYMENT -> REFUND allows target.amount <= source.amount and rejects greater",()=>{
  const records:FinancialRecord[]=[
    {id:"pay_1",type:"PAYMENT",amount:10000,currency:"INR",timestamp:new Date("2026-01-01T00:00:00Z"),paymentMethod:"card",reference:"ref_1"},
    {id:"ref_ok",type:"REFUND",amount:3000,currency:"INR",timestamp:new Date("2026-01-01T01:00:00Z"),reference:"ref_1"},
    {id:"ref_too_big",type:"REFUND",amount:15000,currency:"INR",timestamp:new Date("2026-01-01T02:00:00Z"),reference:"ref_1"}
  ];
  const candidates=discoverCandidates(records);
  expect(candidates.some(c=>c.targetRecordId==="ref_ok")).toBe(true);
  expect(candidates.some(c=>c.targetRecordId==="ref_too_big")).toBe(false);
});
test("PAYMENT -> ADJUSTMENT correctly handles both positive and negative adjustment amounts using absolute value",()=>{
  const records:FinancialRecord[]=[
    {id:"pay_1",type:"PAYMENT",amount:10000,currency:"INR",timestamp:new Date("2026-01-01T00:00:00Z"),paymentMethod:"card",reference:"ref_1"},
    {id:"adj_pos",type:"ADJUSTMENT",amount:500,currency:"INR",timestamp:new Date("2026-01-01T01:00:00Z"),reason:"fee_rebate",reference:"ref_1"},
    {id:"adj_neg",type:"ADJUSTMENT",amount:-500,currency:"INR",timestamp:new Date("2026-01-01T02:00:00Z"),reason:"dispute",reference:"ref_1"},
    {id:"adj_too_big_pos",type:"ADJUSTMENT",amount:15000,currency:"INR",timestamp:new Date("2026-01-01T03:00:00Z"),reason:"large",reference:"ref_1"},
    {id:"adj_too_big_neg",type:"ADJUSTMENT",amount:-15000,currency:"INR",timestamp:new Date("2026-01-01T04:00:00Z"),reason:"large_neg",reference:"ref_1"}
  ];
  const candidates=discoverCandidates(records);
  expect(candidates.some(c=>c.targetRecordId==="adj_pos")).toBe(true);
  expect(candidates.some(c=>c.targetRecordId==="adj_neg")).toBe(true);
  expect(candidates.some(c=>c.targetRecordId==="adj_too_big_pos")).toBe(false);
  expect(candidates.some(c=>c.targetRecordId==="adj_too_big_neg")).toBe(false);
});
test("SETTLEMENT -> BANK_ENTRY requires exact amount equality",()=>{
  const records:FinancialRecord[]=[
    {id:"stl_1",type:"SETTLEMENT",amount:9500,currency:"INR",timestamp:new Date("2026-01-01T00:00:00Z"),fees:500,reference:"ref_1"},
    {id:"bnk_match",type:"BANK_ENTRY",amount:9500,currency:"INR",timestamp:new Date("2026-01-01T01:00:00Z"),bankReference:"b_1",reference:"ref_1"},
    {id:"bnk_diff",type:"BANK_ENTRY",amount:9000,currency:"INR",timestamp:new Date("2026-01-01T02:00:00Z"),bankReference:"b_2",reference:"ref_1"}
  ];
  const candidates=discoverCandidates(records);
  expect(candidates.some(c=>c.targetRecordId==="bnk_match")).toBe(true);
  expect(candidates.some(c=>c.targetRecordId==="bnk_diff")).toBe(false);
});
test("Matching references add EXACT_REFERENCE",()=>{
  const records:FinancialRecord[]=[
    {id:"ord_1",type:"ORDER",amount:10000,currency:"INR",timestamp:new Date("2026-01-01T00:00:00Z"),merchantId:"m_1",reference:"ref_exact"},
    {id:"pay_1",type:"PAYMENT",amount:10000,currency:"INR",timestamp:new Date("2026-01-01T00:01:00Z"),paymentMethod:"card",reference:"ref_exact"}
  ];
  const candidates=discoverCandidates(records);
  expect(candidates.length).toBe(1);
  expect(candidates[0].reasons.includes("EXACT_REFERENCE")).toBe(true);
});
test("Missing references do not prevent an otherwise valid candidate",()=>{
  const records:FinancialRecord[]=[
    {id:"ord_1",type:"ORDER",amount:10000,currency:"INR",timestamp:new Date("2026-01-01T00:00:00Z"),merchantId:"m_1"},
    {id:"pay_1",type:"PAYMENT",amount:10000,currency:"INR",timestamp:new Date("2026-01-01T00:01:00Z"),paymentMethod:"card"}
  ];
  const candidates=discoverCandidates(records);
  expect(candidates.length).toBe(1);
  expect(candidates[0].reasons.includes("EXACT_REFERENCE")).toBe(false);
  expect(candidates[0].reasons).toEqual(["CURRENCY_COMPATIBLE","AMOUNT_COMPATIBLE","TIME_WINDOW_COMPATIBLE"]);
});
test("Candidate reason ordering is always exact",()=>{
  const recordsWithRef:FinancialRecord[]=[
    {id:"ord_1",type:"ORDER",amount:10000,currency:"INR",timestamp:new Date("2026-01-01T00:00:00Z"),merchantId:"m_1",reference:"ref_1"},
    {id:"pay_1",type:"PAYMENT",amount:10000,currency:"INR",timestamp:new Date("2026-01-01T00:01:00Z"),paymentMethod:"card",reference:"ref_1"}
  ];
  const withRefCandidates=discoverCandidates(recordsWithRef);
  expect(withRefCandidates[0].reasons).toEqual([
    "EXACT_REFERENCE",
    "CURRENCY_COMPATIBLE",
    "AMOUNT_COMPATIBLE",
    "TIME_WINDOW_COMPATIBLE"
  ]);
  const recordsWithoutRef:FinancialRecord[]=[
    {id:"ord_2",type:"ORDER",amount:10000,currency:"INR",timestamp:new Date("2026-01-01T00:00:00Z"),merchantId:"m_1",reference:"ref_a"},
    {id:"pay_2",type:"PAYMENT",amount:10000,currency:"INR",timestamp:new Date("2026-01-01T00:01:00Z"),paymentMethod:"card",reference:"ref_b"}
  ];
  const withoutRefCandidates=discoverCandidates(recordsWithoutRef);
  expect(withoutRefCandidates[0].reasons).toEqual([
    "CURRENCY_COMPATIBLE",
    "AMOUNT_COMPATIBLE",
    "TIME_WINDOW_COMPATIBLE"
  ]);
});
test("Candidate output ordering is deterministic by sourceRecordId then targetRecordId",()=>{
  const records:FinancialRecord[]=[
    {id:"ord_z",type:"ORDER",amount:10000,currency:"INR",timestamp:new Date("2026-01-01T00:00:00Z"),merchantId:"m_1"},
    {id:"ord_a",type:"ORDER",amount:10000,currency:"INR",timestamp:new Date("2026-01-01T00:00:00Z"),merchantId:"m_1"},
    {id:"pay_y",type:"PAYMENT",amount:10000,currency:"INR",timestamp:new Date("2026-01-01T00:01:00Z"),paymentMethod:"card"},
    {id:"pay_b",type:"PAYMENT",amount:10000,currency:"INR",timestamp:new Date("2026-01-01T00:01:00Z"),paymentMethod:"card"}
  ];
  const candidates=discoverCandidates(records);
  expect(candidates.length).toBe(4);
  expect(candidates[0].sourceRecordId).toBe("ord_a");
  expect(candidates[0].targetRecordId).toBe("pay_b");
  expect(candidates[1].sourceRecordId).toBe("ord_a");
  expect(candidates[1].targetRecordId).toBe("pay_y");
  expect(candidates[2].sourceRecordId).toBe("ord_z");
  expect(candidates[2].targetRecordId).toBe("pay_b");
  expect(candidates[3].sourceRecordId).toBe("ord_z");
  expect(candidates[3].targetRecordId).toBe("pay_y");
});
test("No duplicate source-target candidate pair exists",()=>{
  const records:FinancialRecord[]=[
    {id:"ord_1",type:"ORDER",amount:10000,currency:"INR",timestamp:new Date("2026-01-01T00:00:00Z"),merchantId:"m_1"},
    {id:"pay_1",type:"PAYMENT",amount:10000,currency:"INR",timestamp:new Date("2026-01-01T00:01:00Z"),paymentMethod:"card"}
  ];
  const candidates=discoverCandidates(records);
  const pairKeys=candidates.map(c=>`${c.sourceRecordId}->${c.targetRecordId}`);
  expect(new Set(pairKeys).size).toBe(candidates.length);
});
test("Candidate IDs always reference records present in the input dataset",()=>{
  const records:FinancialRecord[]=[
    {id:"ord_1",type:"ORDER",amount:10000,currency:"INR",timestamp:new Date("2026-01-01T00:00:00Z"),merchantId:"m_1"},
    {id:"pay_1",type:"PAYMENT",amount:10000,currency:"INR",timestamp:new Date("2026-01-01T00:01:00Z"),paymentMethod:"card"},
    {id:"stl_1",type:"SETTLEMENT",amount:9500,currency:"INR",timestamp:new Date("2026-01-01T00:02:00Z"),fees:500},
    {id:"bnk_1",type:"BANK_ENTRY",amount:9500,currency:"INR",timestamp:new Date("2026-01-01T00:03:00Z"),bankReference:"b_1"}
  ];
  const recordIds=new Set(records.map(r=>r.id));
  const candidates=discoverCandidates(records);
  for(let i=0;i<candidates.length;i++){
    expect(recordIds.has(candidates[i].sourceRecordId)).toBe(true);
    expect(recordIds.has(candidates[i].targetRecordId)).toBe(true);
  }
});
test("Source with no candidates becomes UNMATCHED",()=>{
  const records:FinancialRecord[]=[
    {id:"ord_1",type:"ORDER",amount:10000,currency:"INR",timestamp:new Date("2026-01-01T00:00:00Z"),merchantId:"m_1"}
  ];
  const results=resolveCandidates(records,[]);
  expect(results.length).toBe(1);
  expect(results[0].sourceRecordId).toBe("ord_1");
  expect(results[0].sourceType).toBe("ORDER");
  expect(results[0].status).toBe("UNMATCHED");
  expect(results[0].matchedRecordIds).toEqual([]);
  expect(results[0].candidateRecordIds).toEqual([]);
  expect(results[0].evidenceScore).toBe(0);
  expect(results[0].reasons).toEqual([]);
});
test("Source with exactly one candidate becomes RESOLVED",()=>{
  const records:FinancialRecord[]=[
    {id:"ord_1",type:"ORDER",amount:10000,currency:"INR",timestamp:new Date("2026-01-01T00:00:00Z"),merchantId:"m_1",reference:"ref_1"}
  ];
  const candidates:CandidateMatch[]=[{
    sourceRecordId:"ord_1",
    targetRecordId:"pay_1",
    sourceType:"ORDER",
    targetType:"PAYMENT",
    reasons:["EXACT_REFERENCE","CURRENCY_COMPATIBLE","AMOUNT_COMPATIBLE","TIME_WINDOW_COMPATIBLE"]
  }];
  const results=resolveCandidates(records,candidates);
  expect(results.length).toBe(1);
  expect(results[0].status).toBe("RESOLVED");
  expect(results[0].matchedRecordIds).toEqual(["pay_1"]);
  expect(results[0].candidateRecordIds).toEqual(["pay_1"]);
  expect(results[0].evidenceScore).toBe(140);
  expect(results[0].reasons).toEqual(["EXACT_REFERENCE","CURRENCY_COMPATIBLE","AMOUNT_COMPATIBLE","TIME_WINDOW_COMPATIBLE"]);
});
test("Multiple candidates where one has EXACT_REFERENCE resolves to that candidate",()=>{
  const records:FinancialRecord[]=[
    {id:"ord_1",type:"ORDER",amount:10000,currency:"INR",timestamp:new Date("2026-01-01T00:00:00Z"),merchantId:"m_1",reference:"ref_match"}
  ];
  const candidates:CandidateMatch[]=[
    {
      sourceRecordId:"ord_1",
      targetRecordId:"pay_weak",
      sourceType:"ORDER",
      targetType:"PAYMENT",
      reasons:["CURRENCY_COMPATIBLE","AMOUNT_COMPATIBLE","TIME_WINDOW_COMPATIBLE"]
    },
    {
      sourceRecordId:"ord_1",
      targetRecordId:"pay_strong",
      sourceType:"ORDER",
      targetType:"PAYMENT",
      reasons:["EXACT_REFERENCE","CURRENCY_COMPATIBLE","AMOUNT_COMPATIBLE","TIME_WINDOW_COMPATIBLE"]
    }
  ];
  const results=resolveCandidates(records,candidates);
  expect(results.length).toBe(1);
  expect(results[0].status).toBe("RESOLVED");
  expect(results[0].matchedRecordIds).toEqual(["pay_strong"]);
  expect(results[0].candidateRecordIds).toEqual(["pay_strong","pay_weak"]);
  expect(results[0].evidenceScore).toBe(140);
  expect(results[0].reasons).toEqual(["EXACT_REFERENCE","CURRENCY_COMPATIBLE","AMOUNT_COMPATIBLE","TIME_WINDOW_COMPATIBLE"]);
});
test("Multiple candidates with equal evidence become AMBIGUOUS",()=>{
  const records:FinancialRecord[]=[
    {id:"ord_1",type:"ORDER",amount:10000,currency:"INR",timestamp:new Date("2026-01-01T00:00:00Z"),merchantId:"m_1"}
  ];
  const candidates:CandidateMatch[]=[
    {
      sourceRecordId:"ord_1",
      targetRecordId:"pay_b",
      sourceType:"ORDER",
      targetType:"PAYMENT",
      reasons:["CURRENCY_COMPATIBLE","AMOUNT_COMPATIBLE","TIME_WINDOW_COMPATIBLE"]
    },
    {
      sourceRecordId:"ord_1",
      targetRecordId:"pay_a",
      sourceType:"ORDER",
      targetType:"PAYMENT",
      reasons:["CURRENCY_COMPATIBLE","AMOUNT_COMPATIBLE","TIME_WINDOW_COMPATIBLE"]
    }
  ];
  const results=resolveCandidates(records,candidates);
  expect(results.length).toBe(1);
  expect(results[0].status).toBe("AMBIGUOUS");
  expect(results[0].matchedRecordIds).toEqual([]);
  expect(results[0].candidateRecordIds).toEqual(["pay_a","pay_b"]);
  expect(results[0].evidenceScore).toBe(40);
  expect(results[0].reasons).toEqual([]);
});
test("Duplicate references producing equally strong candidates remain AMBIGUOUS",()=>{
  const records:FinancialRecord[]=[
    {id:"pay_1",type:"PAYMENT",amount:10000,currency:"INR",timestamp:new Date("2026-01-01T00:00:00Z"),paymentMethod:"card",reference:"dup_ref"}
  ];
  const candidates:CandidateMatch[]=[
    {
      sourceRecordId:"pay_1",
      targetRecordId:"stl_2",
      sourceType:"PAYMENT",
      targetType:"SETTLEMENT",
      reasons:["EXACT_REFERENCE","CURRENCY_COMPATIBLE","AMOUNT_COMPATIBLE","TIME_WINDOW_COMPATIBLE"]
    },
    {
      sourceRecordId:"pay_1",
      targetRecordId:"stl_1",
      sourceType:"PAYMENT",
      targetType:"SETTLEMENT",
      reasons:["EXACT_REFERENCE","CURRENCY_COMPATIBLE","AMOUNT_COMPATIBLE","TIME_WINDOW_COMPATIBLE"]
    }
  ];
  const results=resolveCandidates(records,candidates);
  expect(results.length).toBe(1);
  expect(results[0].status).toBe("AMBIGUOUS");
  expect(results[0].matchedRecordIds).toEqual([]);
  expect(results[0].candidateRecordIds).toEqual(["stl_1","stl_2"]);
  expect(results[0].evidenceScore).toBe(140);
  expect(results[0].reasons).toEqual([]);
});
test("Lower-scoring candidates do not appear in AMBIGUOUS candidateRecordIds",()=>{
  const records:FinancialRecord[]=[
    {id:"pay_1",type:"PAYMENT",amount:10000,currency:"INR",timestamp:new Date("2026-01-01T00:00:00Z"),paymentMethod:"card",reference:"dup_ref"}
  ];
  const candidates:CandidateMatch[]=[
    {
      sourceRecordId:"pay_1",
      targetRecordId:"stl_high_2",
      sourceType:"PAYMENT",
      targetType:"SETTLEMENT",
      reasons:["EXACT_REFERENCE","CURRENCY_COMPATIBLE","AMOUNT_COMPATIBLE","TIME_WINDOW_COMPATIBLE"]
    },
    {
      sourceRecordId:"pay_1",
      targetRecordId:"stl_high_1",
      sourceType:"PAYMENT",
      targetType:"SETTLEMENT",
      reasons:["EXACT_REFERENCE","CURRENCY_COMPATIBLE","AMOUNT_COMPATIBLE","TIME_WINDOW_COMPATIBLE"]
    },
    {
      sourceRecordId:"pay_1",
      targetRecordId:"stl_low",
      sourceType:"PAYMENT",
      targetType:"SETTLEMENT",
      reasons:["CURRENCY_COMPATIBLE","AMOUNT_COMPATIBLE","TIME_WINDOW_COMPATIBLE"]
    }
  ];
  const results=resolveCandidates(records,candidates);
  expect(results.length).toBe(1);
  expect(results[0].status).toBe("AMBIGUOUS");
  expect(results[0].candidateRecordIds).toEqual(["stl_high_1","stl_high_2"]);
  expect(results[0].candidateRecordIds.includes("stl_low")).toBe(false);
  expect(results[0].evidenceScore).toBe(140);
});
test("Evidence score calculation is exact based on defined weights",()=>{
  expect(REASON_WEIGHTS.EXACT_REFERENCE).toBe(100);
  expect(REASON_WEIGHTS.AMOUNT_COMPATIBLE).toBe(20);
  expect(REASON_WEIGHTS.CURRENCY_COMPATIBLE).toBe(10);
  expect(REASON_WEIGHTS.TIME_WINDOW_COMPATIBLE).toBe(10);
  const records:FinancialRecord[]=[
    {id:"ord_1",type:"ORDER",amount:10000,currency:"INR",timestamp:new Date("2026-01-01T00:00:00Z"),merchantId:"m_1"}
  ];
  const candidates:CandidateMatch[]=[{
    sourceRecordId:"ord_1",
    targetRecordId:"pay_1",
    sourceType:"ORDER",
    targetType:"PAYMENT",
    reasons:["EXACT_REFERENCE","AMOUNT_COMPATIBLE"]
  }];
  const results=resolveCandidates(records,candidates);
  expect(results[0].evidenceScore).toBe(120);
});
test("Candidate ordering is deterministic and changing candidate input order produces identical resolution output",()=>{
  const records:FinancialRecord[]=[
    {id:"ord_1",type:"ORDER",amount:10000,currency:"INR",timestamp:new Date("2026-01-01T00:00:00Z"),merchantId:"m_1"}
  ];
  const c1:CandidateMatch={
    sourceRecordId:"ord_1",
    targetRecordId:"pay_a",
    sourceType:"ORDER",
    targetType:"PAYMENT",
    reasons:["CURRENCY_COMPATIBLE","AMOUNT_COMPATIBLE","TIME_WINDOW_COMPATIBLE"]
  };
  const c2:CandidateMatch={
    sourceRecordId:"ord_1",
    targetRecordId:"pay_b",
    sourceType:"ORDER",
    targetType:"PAYMENT",
    reasons:["CURRENCY_COMPATIBLE","AMOUNT_COMPATIBLE","TIME_WINDOW_COMPATIBLE"]
  };
  const res1=resolveCandidates(records,[c1,c2]);
  const res2=resolveCandidates(records,[c2,c1]);
  expect(res1).toEqual(res2);
});
test("Records and candidates input arrays and objects are not mutated during resolveCandidates",()=>{
  const records:FinancialRecord[]=[
    {id:"ord_1",type:"ORDER",amount:10000,currency:"INR",timestamp:new Date("2026-01-01T00:00:00Z"),merchantId:"m_1"}
  ];
  const candidates:CandidateMatch[]=[{
    sourceRecordId:"ord_1",
    targetRecordId:"pay_1",
    sourceType:"ORDER",
    targetType:"PAYMENT",
    reasons:["CURRENCY_COMPATIBLE","AMOUNT_COMPATIBLE","TIME_WINDOW_COMPATIBLE"]
  }];
  const recCopy=JSON.parse(JSON.stringify(records));
  const candCopy=JSON.parse(JSON.stringify(candidates));
  resolveCandidates(records,candidates);
  expect(JSON.parse(JSON.stringify(records))).toEqual(recCopy);
  expect(JSON.parse(JSON.stringify(candidates))).toEqual(candCopy);
});
test("REFUND, ADJUSTMENT, and BANK_ENTRY do not produce independent source results",()=>{
  const records:FinancialRecord[]=[
    {id:"ref_1",type:"REFUND",amount:1000,currency:"INR",timestamp:new Date("2026-01-01T00:00:00Z")},
    {id:"adj_1",type:"ADJUSTMENT",amount:500,currency:"INR",timestamp:new Date("2026-01-01T00:00:00Z"),reason:"adj"},
    {id:"bnk_1",type:"BANK_ENTRY",amount:10000,currency:"INR",timestamp:new Date("2026-01-01T00:00:00Z"),bankReference:"b_1"}
  ];
  const results=resolveCandidates(records,[]);
  expect(results.length).toBe(0);
});
test("Every ORDER, PAYMENT, and SETTLEMENT record receives exactly one resolution result",()=>{
  const records:FinancialRecord[]=[
    {id:"ord_1",type:"ORDER",amount:10000,currency:"INR",timestamp:new Date("2026-01-01T00:00:00Z"),merchantId:"m_1"},
    {id:"pay_1",type:"PAYMENT",amount:10000,currency:"INR",timestamp:new Date("2026-01-01T00:01:00Z"),paymentMethod:"card"},
    {id:"stl_1",type:"SETTLEMENT",amount:9500,currency:"INR",timestamp:new Date("2026-01-01T00:02:00Z"),fees:500},
    {id:"ref_1",type:"REFUND",amount:1000,currency:"INR",timestamp:new Date("2026-01-01T00:03:00Z")},
    {id:"bnk_1",type:"BANK_ENTRY",amount:9500,currency:"INR",timestamp:new Date("2026-01-01T00:04:00Z"),bankReference:"b_1"}
  ];
  const results=resolveCandidates(records,[]);
  expect(results.length).toBe(3);
  expect(results.map(r=>r.sourceRecordId)).toEqual(["ord_1","pay_1","stl_1"]);
});
test("Integration validation using generateDataset with synthetic data",()=>{
  const {dataset}=generateDataset({flowCount:50,seed:42});
  const candidates=discoverCandidates(dataset.records);
  const results=resolveCandidates(dataset.records,candidates);
  expect(results.length).toBeGreaterThan(0);
  const relevantRecords=dataset.records.filter(r=>r.type==="ORDER"||r.type==="PAYMENT"||r.type==="SETTLEMENT");
  expect(results.length).toBe(relevantRecords.length);
  for(let i=0;i<results.length;i++){
    const res=results[i];
    expect(res.sourceType==="ORDER"||res.sourceType==="PAYMENT"||res.sourceType==="SETTLEMENT").toBe(true);
    expect(res.status==="RESOLVED"||res.status==="AMBIGUOUS"||res.status==="UNMATCHED").toBe(true);
    if(res.status==="RESOLVED"){
      expect(res.matchedRecordIds.length).toBe(1);
      expect(res.candidateRecordIds.length).toBeGreaterThanOrEqual(1);
      expect(res.evidenceScore).toBeGreaterThan(0);
      expect(res.reasons.length).toBeGreaterThan(0);
    }else if(res.status==="AMBIGUOUS"){
      expect(res.matchedRecordIds.length).toBe(0);
      expect(res.candidateRecordIds.length).toBeGreaterThanOrEqual(2);
      expect(res.evidenceScore).toBeGreaterThan(0);
      expect(res.reasons.length).toBe(0);
    }else if(res.status==="UNMATCHED"){
      expect(res.matchedRecordIds.length).toBe(0);
      expect(res.candidateRecordIds.length).toBe(0);
      expect(res.evidenceScore).toBe(0);
      expect(res.reasons.length).toBe(0);
    }
  }
});
