import {test,expect} from "bun:test";
import {discoverCandidates,MAX_TIME_WINDOW_MS} from "./index";
import {Order,Payment,Settlement,BankEntry,Refund,Adjustment,FinancialRecord} from "@ledgerlens/shared";
import {generateDataset} from "@ledgerlens/synthetic-data";
test("Same input produces identical output",()=>{
  const records:FinancialRecord[]=[
    {id:"ord_1",type:"ORDER",amount:10000,currency:"INR",timestamp:new Date("2026-01-01T00:00:00Z"),merchantId:"m_1",reference:"ref_1"},
    {id:"pay_1",type:"PAYMENT",amount:10000,currency:"INR",timestamp:new Date("2026-01-01T00:01:00Z"),paymentMethod:"card",reference:"ref_1"}
  ];
  const res1=discoverCandidates(records);
  const res2=discoverCandidates(records);
  expect(res1).toEqual(res2);
});
test("Input records are not mutated",()=>{
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
test("Integration validation using generateDataset with synthetic data",()=>{
  const {dataset,groundTruth}=generateDataset({flowCount:50,seed:42});
  const candidates=discoverCandidates(dataset.records);
  expect(candidates.length).toBeGreaterThan(0);
  const recordMap=new Map<string,FinancialRecord>();
  for(let i=0;i<dataset.records.length;i++){
    recordMap.set(dataset.records[i].id,dataset.records[i]);
  }
  for(let i=0;i<candidates.length;i++){
    const c=candidates[i];
    const source=recordMap.get(c.sourceRecordId);
    const target=recordMap.get(c.targetRecordId);
    expect(source).toBeDefined();
    expect(target).toBeDefined();
    expect(source!.currency).toBe(target!.currency);
    expect(target!.timestamp.getTime()).toBeGreaterThanOrEqual(source!.timestamp.getTime());
    expect(target!.timestamp.getTime()-source!.timestamp.getTime()).toBeLessThanOrEqual(MAX_TIME_WINDOW_MS);
    expect(
      (source!.type==="ORDER"&&target!.type==="PAYMENT"&&source!.amount===target!.amount)||
      (source!.type==="PAYMENT"&&target!.type==="SETTLEMENT"&&target!.amount<=source!.amount)||
      (source!.type==="PAYMENT"&&target!.type==="REFUND"&&target!.amount<=source!.amount)||
      (source!.type==="PAYMENT"&&target!.type==="ADJUSTMENT"&&Math.abs(target!.amount)<=source!.amount)||
      (source!.type==="SETTLEMENT"&&target!.type==="BANK_ENTRY"&&source!.amount===target!.amount)
    ).toBe(true);
  }
  let foundExpectedRelationships=0;
  for(let i=0;i<groundTruth.relations.length;i++){
    const rel=groundTruth.relations[i];
    for(let j=0;j<rel.relationships.length;j++){
      const r=rel.relationships[j];
      if(r.type!=="AMBIGUOUS"){
        for(let s=0;s<r.sourceRecordIds.length;s++){
          for(let t=0;t<r.targetRecordIds.length;t++){
            const exists=candidates.some(c=>c.sourceRecordId===r.sourceRecordIds[s]&&c.targetRecordId===r.targetRecordIds[t]);
            if(exists)foundExpectedRelationships++;
          }
        }
      }
    }
  }
  expect(foundExpectedRelationships).toBeGreaterThan(0);
});
