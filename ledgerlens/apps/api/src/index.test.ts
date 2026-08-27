import {test,expect} from "bun:test";
import {buildApp,ApiErrorResponse} from "./app";
import {Settlement,FinancialRecord,ReconciliationResult,CandidateMatch,ReconciliationSummary} from "@ledgerlens/shared";
import {generateDataset} from "@ledgerlens/synthetic-data";
const app=buildApp();
test("GET /health returns 200 with status ok",async()=>{
  const res=await app.inject({
    method:"GET",
    url:"/health"
  });
  expect(res.statusCode).toBe(200);
  const json=JSON.parse(res.body);
  expect(json.status).toBe("ok");
  expect(json.service).toBe("ledgerlens-api");
});
test("Valid POST /ingestions returns 200",async()=>{
  const res=await app.inject({
    method:"POST",
    url:"/ingestions",
    payload:{
      records:[
        {id:"ord_1",type:"ORDER",amount:"100.50",currency:"USD",timestamp:"2026-01-01T00:00:00Z"},
        {id:"pay_1",type:"PAYMENT",amount:"100.50",currency:"USD",timestamp:"2026-01-01T00:01:00Z"}
      ]
    }
  });
  expect(res.statusCode).toBe(200);
  const json=JSON.parse(res.body);
  expect(json.acceptedCount).toBe(2);
  expect(json.rejectedCount).toBe(0);
  expect(json.records.length).toBe(2);
  expect(json.rejected.length).toBe(0);
});
test("Accepted records are returned normalized",async()=>{
  const res=await app.inject({
    method:"POST",
    url:"/ingestions",
    payload:{
      records:[
        {transaction_id:"txn_1",type:"settlement",transaction_amount:"500.25",transaction_currency:"usd",created_at:1767225600,fee:"5.00"}
      ]
    }
  });
  expect(res.statusCode).toBe(200);
  const json=JSON.parse(res.body);
  expect(json.records[0].id).toBe("txn_1");
  expect(json.records[0].type).toBe("SETTLEMENT");
  expect(json.records[0].amount).toBe(50025);
  expect(json.records[0].fees).toBe(500);
  expect(json.records[0].currency).toBe("USD");
});
test("Rejected records are returned with typed rejection reasons",async()=>{
  const res=await app.inject({
    method:"POST",
    url:"/ingestions",
    payload:{
      records:[
        {type:"PAYMENT",amount:100,currency:"USD",timestamp:"2026-01-01T00:00:00Z"},
        {id:"p2",type:"INVALID",amount:100,currency:"USD",timestamp:"2026-01-01T00:00:00Z"},
        {id:"p3",type:"PAYMENT",amount:"invalid-money",currency:"USD",timestamp:"2026-01-01T00:00:00Z"}
      ]
    }
  });
  expect(res.statusCode).toBe(200);
  const json=JSON.parse(res.body);
  expect(json.acceptedCount).toBe(0);
  expect(json.rejectedCount).toBe(3);
  expect(json.rejected[0].reason).toBe("MISSING_ID");
  expect(json.rejected[1].reason).toBe("INVALID_TYPE");
  expect(json.rejected[2].reason).toBe("INVALID_AMOUNT");
});
test("Mixed valid and invalid batch returns correct acceptedCount and rejectedCount",async()=>{
  const res=await app.inject({
    method:"POST",
    url:"/ingestions",
    payload:{
      records:[
        {id:"p1",type:"PAYMENT",amount:50,currency:"USD",timestamp:"2026-01-01T00:00:00Z"},
        {id:"p2",type:"UNKNOWN",amount:50,currency:"USD",timestamp:"2026-01-01T00:00:00Z"},
        {id:"p3",type:"PAYMENT",amount:75,currency:"USD",timestamp:"2026-01-01T00:00:00Z"}
      ]
    }
  });
  expect(res.statusCode).toBe(200);
  const json=JSON.parse(res.body);
  expect(json.acceptedCount).toBe(2);
  expect(json.rejectedCount).toBe(1);
  expect(json.records.length).toBe(2);
  expect(json.rejected.length).toBe(1);
  expect(json.records[0].id).toBe("p1");
  expect(json.records[1].id).toBe("p3");
  expect(json.rejected[0].index).toBe(1);
});
test("Empty records array returns 200 with zero counts",async()=>{
  const res=await app.inject({
    method:"POST",
    url:"/ingestions",
    payload:{
      records:[]
    }
  });
  expect(res.statusCode).toBe(200);
  const json=JSON.parse(res.body);
  expect(json.acceptedCount).toBe(0);
  expect(json.rejectedCount).toBe(0);
  expect(json.records).toEqual([]);
  expect(json.rejected).toEqual([]);
});
test("Missing records field returns 400 INVALID_REQUEST",async()=>{
  const res=await app.inject({
    method:"POST",
    url:"/ingestions",
    payload:{}
  });
  expect(res.statusCode).toBe(400);
  const json=JSON.parse(res.body) as ApiErrorResponse;
  expect(json.error.code).toBe("INVALID_REQUEST");
});
test("records not being an array returns 400 INVALID_REQUEST",async()=>{
  const res=await app.inject({
    method:"POST",
    url:"/ingestions",
    payload:{
      records:"not-an-array"
    }
  });
  expect(res.statusCode).toBe(400);
  const json=JSON.parse(res.body) as ApiErrorResponse;
  expect(json.error.code).toBe("INVALID_REQUEST");
});
test("Batch with 1001 records returns 413 BATCH_TOO_LARGE",async()=>{
  const largeBatch=[];
  for(let i=0;i<1001;i++){
    largeBatch.push({id:`p_${i}`,type:"PAYMENT",amount:10,currency:"USD",timestamp:"2026-01-01T00:00:00Z"});
  }
  const res=await app.inject({
    method:"POST",
    url:"/ingestions",
    payload:{
      records:largeBatch
    }
  });
  expect(res.statusCode).toBe(413);
  const json=JSON.parse(res.body) as ApiErrorResponse;
  expect(json.error.code).toBe("BATCH_TOO_LARGE");
});
test("Batch with exactly 1000 records is processed",async()=>{
  const batch=[];
  for(let i=0;i<1000;i++){
    batch.push({id:`p_${i}`,type:"PAYMENT",amount:10,currency:"USD",timestamp:"2026-01-01T00:00:00Z"});
  }
  const res=await app.inject({
    method:"POST",
    url:"/ingestions",
    payload:{
      records:batch
    }
  });
  expect(res.statusCode).toBe(200);
  const json=JSON.parse(res.body);
  expect(json.acceptedCount).toBe(1000);
  expect(json.rejectedCount).toBe(0);
});
test("Malformed JSON returns clean 400 INVALID_REQUEST",async()=>{
  const res=await app.inject({
    method:"POST",
    url:"/ingestions",
    headers:{
      "content-type":"application/json"
    },
    payload:"{malformed json"
  });
  expect(res.statusCode).toBe(400);
  const json=JSON.parse(res.body) as ApiErrorResponse;
  expect(json.error).toBeDefined();
  expect(json.error.code).toBe("INVALID_REQUEST");
  expect(typeof json.error.message).toBe("string");
});
test("The API does not mutate request records",async()=>{
  const originalRecord={id:"p1",type:"payment",amount:"100.50",currency:"usd",timestamp:1767225600};
  const copy={...originalRecord};
  await app.inject({
    method:"POST",
    url:"/ingestions",
    payload:{
      records:[originalRecord]
    }
  });
  expect(originalRecord).toEqual(copy);
});
test("The API response does not expose hidden reconciliation linkage",async()=>{
  const res=await app.inject({
    method:"POST",
    url:"/ingestions",
    payload:{
      records:[
        {id:"s1",type:"SETTLEMENT",amount:100,currency:"USD",timestamp:"2026-01-01T00:00:00Z",paymentIds:["p1"],matchedRecordIds:["p2"]}
      ]
    }
  });
  expect(res.statusCode).toBe(200);
  const json=JSON.parse(res.body);
  const stl=json.records[0];
  expect(stl.paymentIds).toBeUndefined();
  expect(stl.matchedRecordIds).toBeUndefined();
  expect(stl.linkedSettlementIds).toBeUndefined();
});
test("Existing GET /health continues working alongside POST /ingestions",async()=>{
  const healthRes=await app.inject({method:"GET",url:"/health"});
  expect(healthRes.statusCode).toBe(200);
  const ingestRes=await app.inject({method:"POST",url:"/ingestions",payload:{records:[]}});
  expect(ingestRes.statusCode).toBe(200);
});
test("POST /reconcile with empty records array returns 200 with all summary counts zero",async()=>{
  const res=await app.inject({
    method:"POST",
    url:"/reconcile",
    payload:{
      records:[]
    }
  });
  expect(res.statusCode).toBe(200);
  const json=JSON.parse(res.body);
  expect(json.summary).toEqual({
    totalInputRecords:0,
    acceptedRecords:0,
    rejectedRecords:0,
    resolved:0,
    ambiguous:0,
    unmatched:0,
    candidateCount:0
  });
  expect(json.records).toEqual([]);
  expect(json.rejected).toEqual([]);
  expect(json.candidates).toEqual([]);
  expect(json.results).toEqual([]);
});
test("POST /reconcile with one invalid record returns correct rejection and zero candidate summary",async()=>{
  const res=await app.inject({
    method:"POST",
    url:"/reconcile",
    payload:{
      records:[
        {type:"ORDER",amount:"100.00",currency:"USD",timestamp:"2026-01-01T00:00:00Z"}
      ]
    }
  });
  expect(res.statusCode).toBe(200);
  const json=JSON.parse(res.body);
  expect(json.summary.totalInputRecords).toBe(1);
  expect(json.summary.acceptedRecords).toBe(0);
  expect(json.summary.rejectedRecords).toBe(1);
  expect(json.summary.candidateCount).toBe(0);
  expect(json.rejected.length).toBe(1);
  expect(json.rejected[0].reason).toBe("MISSING_ID");
});
test("POST /reconcile resolves matching ORDER and PAYMENT with valid reference",async()=>{
  const res=await app.inject({
    method:"POST",
    url:"/reconcile",
    payload:{
      records:[
        {id:"ord_1",type:"ORDER",amount:"100.50",currency:"USD",timestamp:"2026-01-01T00:00:00Z",reference:"ref_1"},
        {id:"pay_1",type:"PAYMENT",amount:"100.50",currency:"USD",timestamp:"2026-01-01T00:01:00Z",reference:"ref_1"}
      ]
    }
  });
  expect(res.statusCode).toBe(200);
  const json=JSON.parse(res.body);
  expect(json.summary.acceptedRecords).toBe(2);
  expect(json.summary.rejectedRecords).toBe(0);
  expect(json.summary.candidateCount).toBe(1);
  expect(json.summary.resolved).toBe(1);
  expect(json.summary.unmatched).toBe(1);
  const ordResult=json.results.find((r:{sourceRecordId:string})=>r.sourceRecordId==="ord_1");
  expect(ordResult).toBeDefined();
  expect(ordResult.status).toBe("RESOLVED");
  expect(ordResult.matchedRecordIds).toEqual(["pay_1"]);
  expect(ordResult.evidenceScore).toBe(140);
  expect(ordResult.reasons).toEqual(["EXACT_REFERENCE","CURRENCY_COMPATIBLE","AMOUNT_COMPATIBLE","TIME_WINDOW_COMPATIBLE"]);
});
test("POST /reconcile does not produce candidates for matching reference with different currencies",async()=>{
  const res=await app.inject({
    method:"POST",
    url:"/reconcile",
    payload:{
      records:[
        {id:"ord_1",type:"ORDER",amount:"100.50",currency:"USD",timestamp:"2026-01-01T00:00:00Z",reference:"ref_1"},
        {id:"pay_1",type:"PAYMENT",amount:"100.50",currency:"INR",timestamp:"2026-01-01T00:01:00Z",reference:"ref_1"}
      ]
    }
  });
  expect(res.statusCode).toBe(200);
  const json=JSON.parse(res.body);
  expect(json.summary.candidateCount).toBe(0);
  expect(json.candidates.length).toBe(0);
  expect(json.summary.unmatched).toBe(2);
});
test("POST /reconcile returns AMBIGUOUS when multiple candidates have equal evidence",async()=>{
  const res=await app.inject({
    method:"POST",
    url:"/reconcile",
    payload:{
      records:[
        {id:"pay_1",type:"PAYMENT",amount:"100.00",currency:"USD",timestamp:"2026-01-01T00:00:00Z",reference:"dup_ref"},
        {id:"stl_1",type:"SETTLEMENT",amount:"100.00",currency:"USD",timestamp:"2026-01-01T01:00:00Z",reference:"dup_ref"},
        {id:"stl_2",type:"SETTLEMENT",amount:"100.00",currency:"USD",timestamp:"2026-01-01T01:00:00Z",reference:"dup_ref"}
      ]
    }
  });
  expect(res.statusCode).toBe(200);
  const json=JSON.parse(res.body);
  const payResult=json.results.find((r:{sourceRecordId:string})=>r.sourceRecordId==="pay_1");
  expect(payResult).toBeDefined();
  expect(payResult.status).toBe("AMBIGUOUS");
  expect(payResult.matchedRecordIds).toEqual([]);
  expect(payResult.candidateRecordIds).toEqual(["stl_1","stl_2"]);
  expect(json.summary.ambiguous).toBe(1);
});
test("POST /reconcile assigns UNMATCHED to source records with no candidates",async()=>{
  const res=await app.inject({
    method:"POST",
    url:"/reconcile",
    payload:{
      records:[
        {id:"ord_lone",type:"ORDER",amount:"50.00",currency:"USD",timestamp:"2026-01-01T00:00:00Z"}
      ]
    }
  });
  expect(res.statusCode).toBe(200);
  const json=JSON.parse(res.body);
  expect(json.summary.unmatched).toBe(1);
  expect(json.results[0].status).toBe("UNMATCHED");
  expect(json.results[0].matchedRecordIds).toEqual([]);
});
test("POST /reconcile continues reconciliation for valid records when input is mixed",async()=>{
  const res=await app.inject({
    method:"POST",
    url:"/reconcile",
    payload:{
      records:[
        {type:"PAYMENT",amount:"100.00",currency:"USD",timestamp:"2026-01-01T00:00:00Z"},
        {id:"ord_1",type:"ORDER",amount:"100.00",currency:"USD",timestamp:"2026-01-01T00:00:00Z",reference:"ref_mix"},
        {id:"pay_1",type:"PAYMENT",amount:"100.00",currency:"USD",timestamp:"2026-01-01T00:01:00Z",reference:"ref_mix"},
        {id:"invalid_amt",type:"ORDER",amount:"not-money",currency:"USD",timestamp:"2026-01-01T00:00:00Z"}
      ]
    }
  });
  expect(res.statusCode).toBe(200);
  const json=JSON.parse(res.body);
  expect(json.summary.totalInputRecords).toBe(4);
  expect(json.summary.acceptedRecords).toBe(2);
  expect(json.summary.rejectedRecords).toBe(2);
  expect(json.summary.resolved).toBe(1);
  expect(json.rejected.length).toBe(2);
  expect(json.records.length).toBe(2);
});
test("POST /reconcile summary counts exactly match candidates and results arrays",async()=>{
  const res=await app.inject({
    method:"POST",
    url:"/reconcile",
    payload:{
      records:[
        {id:"ord_1",type:"ORDER",amount:"100.00",currency:"USD",timestamp:"2026-01-01T00:00:00Z",reference:"r1"},
        {id:"pay_1",type:"PAYMENT",amount:"100.00",currency:"USD",timestamp:"2026-01-01T00:01:00Z",reference:"r1"},
        {id:"stl_1",type:"SETTLEMENT",amount:"95.00",currency:"USD",timestamp:"2026-01-01T00:02:00Z",fee:"5.00",reference:"r1"},
        {id:"stl_2",type:"SETTLEMENT",amount:"95.00",currency:"USD",timestamp:"2026-01-01T00:02:00Z",fee:"5.00",reference:"r1"}
      ]
    }
  });
  expect(res.statusCode).toBe(200);
  const json=JSON.parse(res.body);
  expect(json.summary.candidateCount).toBe(json.candidates.length);
  const resolvedCount=json.results.filter((r:{status:string})=>r.status==="RESOLVED").length;
  const ambiguousCount=json.results.filter((r:{status:string})=>r.status==="AMBIGUOUS").length;
  const unmatchedCount=json.results.filter((r:{status:string})=>r.status==="UNMATCHED").length;
  expect(json.summary.resolved).toBe(resolvedCount);
  expect(json.summary.ambiguous).toBe(ambiguousCount);
  expect(json.summary.unmatched).toBe(unmatchedCount);
  expect(json.summary.resolved+json.summary.ambiguous+json.summary.unmatched).toBe(json.results.length);
});
test("POST /reconcile does not mutate input request objects",async()=>{
  const inputRecord={id:"ord_1",type:"order",amount:"100.50",currency:"usd",timestamp:1767225600};
  const copy={...inputRecord};
  await app.inject({
    method:"POST",
    url:"/reconcile",
    payload:{
      records:[inputRecord]
    }
  });
  expect(inputRecord).toEqual(copy);
});
test("POST /reconcile response does not expose hidden ground truth",async()=>{
  const res=await app.inject({
    method:"POST",
    url:"/reconcile",
    payload:{
      records:[
        {id:"stl_1",type:"SETTLEMENT",amount:100,currency:"USD",timestamp:"2026-01-01T00:00:00Z",paymentIds:["p1"],matchedRecordIds:["p2"],groundTruth:"leak"}
      ]
    }
  });
  expect(res.statusCode).toBe(200);
  const json=JSON.parse(res.body);
  const stl=json.records[0];
  expect(stl.paymentIds).toBeUndefined();
  expect(stl.matchedRecordIds).toBeUndefined();
  expect(stl.groundTruth).toBeUndefined();
});
test("POST /reconcile returns 400 for invalid body, missing records, or non-array records",async()=>{
  const res1=await app.inject({method:"POST",url:"/reconcile",payload:"invalid string"});
  expect(res1.statusCode).toBe(400);
  const res2=await app.inject({method:"POST",url:"/reconcile",payload:{}});
  expect(res2.statusCode).toBe(400);
  const res3=await app.inject({method:"POST",url:"/reconcile",payload:{records:"not-array"}});
  expect(res3.statusCode).toBe(400);
  const res4=await app.inject({method:"POST",url:"/reconcile",payload:{records:[null]}});
  expect(res4.statusCode).toBe(400);
});
test("POST /reconcile returns 413 when records exceed 1000",async()=>{
  const large=[];
  for(let i=0;i<1001;i++){
    large.push({id:`p_${i}`,type:"PAYMENT",amount:10,currency:"USD",timestamp:"2026-01-01T00:00:00Z"});
  }
  const res=await app.inject({
    method:"POST",
    url:"/reconcile",
    payload:{
      records:large
    }
  });
  expect(res.statusCode).toBe(413);
  const json=JSON.parse(res.body) as ApiErrorResponse;
  expect(json.error.code).toBe("BATCH_TOO_LARGE");
});
test("POST /reconcile integration validation using generateDataset with synthetic data",async()=>{
  const {dataset}=generateDataset({flowCount:30,seed:12345});
  const rawRecords=dataset.records.map(r=>({
    id:r.id,
    type:r.type,
    amount:r.amount,
    amount_unit:"MINOR",
    currency:r.currency,
    timestamp:r.timestamp.toISOString(),
    reference:r.reference,
    merchantId:(r as {merchantId?:string}).merchantId,
    paymentMethod:(r as {paymentMethod?:string}).paymentMethod,
    bankReference:(r as {bankReference?:string}).bankReference,
    fees:(r as {fees?:number}).fees,
    reason:(r as {reason?:string}).reason
  }));
  const res=await app.inject({
    method:"POST",
    url:"/reconcile",
    payload:{
      records:rawRecords
    }
  });
  expect(res.statusCode).toBe(200);
  const json=JSON.parse(res.body);
  expect(json.summary.acceptedRecords).toBe(dataset.records.length);
  expect(json.summary.rejectedRecords).toBe(0);
  expect(json.summary.candidateCount).toBe(json.candidates.length);
  expect(json.summary.resolved+json.summary.ambiguous+json.summary.unmatched).toBe(json.results.length);
  for(let i=0;i<json.records.length;i++){
    const r=json.records[i];
    expect(r.paymentIds).toBeUndefined();
    expect(r.matchedRecordIds).toBeUndefined();
    expect(r.flowId).toBeUndefined();
    expect(r.scenario).toBeUndefined();
  }
});
test("GET /investigate/info returns 200 with provider info",async()=>{
  const res=await app.inject({
    method:"GET",
    url:"/investigate/info"
  });
  expect(res.statusCode).toBe(200);
  const json=JSON.parse(res.body);
  expect(json.provider).toBeDefined();
  expect(typeof json.isAiConfigured).toBe("boolean");
});
test("POST /investigate with valid payload returns structured report",async()=>{
  const mockRecord:FinancialRecord={
    id:"ord_1",
    type:"ORDER",
    amount:10050,
    currency:"USD",
    timestamp:new Date("2026-01-01T00:00:00Z"),
    reference:"ref_1",
    merchantId:"m_1"
  };
  const mockResult:ReconciliationResult={
    sourceRecordId:"ord_1",
    sourceType:"ORDER",
    status:"RESOLVED",
    matchedRecordIds:["pay_1"],
    candidateRecordIds:["pay_1"],
    evidenceScore:140,
    reasons:["EXACT_REFERENCE","CURRENCY_COMPATIBLE","AMOUNT_COMPATIBLE","TIME_WINDOW_COMPATIBLE"]
  };
  const mockCandidate:CandidateMatch={
    sourceRecordId:"ord_1",
    targetRecordId:"pay_1",
    sourceType:"ORDER",
    targetType:"PAYMENT",
    reasons:["EXACT_REFERENCE","CURRENCY_COMPATIBLE","AMOUNT_COMPATIBLE","TIME_WINDOW_COMPATIBLE"]
  };
  const res=await app.inject({
    method:"POST",
    url:"/investigate",
    payload:{
      record:mockRecord,
      result:mockResult,
      candidates:[mockCandidate]
    }
  });
  expect(res.statusCode).toBe(200);
  const json=JSON.parse(res.body);
  expect(json.riskLevel).toBe("LOW");
  expect(json.attentionLevel).toBeDefined();
  expect(json.summary).toBeDefined();
  expect(json.whyThisStatus).toBeDefined();
  expect(json.explanation).toBeDefined();
  expect(json.keyEvidence.length).toBeGreaterThan(0);
  expect(json.recommendedAction).toBeDefined();
  expect(Array.isArray(json.recommendedActions)).toBe(true);
  expect(json.recommendedActions.length).toBeGreaterThan(0);
  expect(json.questionsToInvestigate.length).toBeGreaterThan(0);
  expect(json.provider).toBeDefined();
});
test("POST /investigate returns 400 on invalid payload",async()=>{
  const res1=await app.inject({
    method:"POST",
    url:"/investigate",
    payload:{}
  });
  expect(res1.statusCode).toBe(400);
  const res2=await app.inject({
    method:"POST",
    url:"/investigate",
    payload:{record:"bad",result:{},candidates:[]}
  });
  expect(res2.statusCode).toBe(400);
});
test("POST /investigate/summary returns executive summary report",async()=>{
  const summaryPayload:ReconciliationSummary={
    totalInputRecords:50,
    acceptedRecords:50,
    rejectedRecords:0,
    resolved:40,
    ambiguous:5,
    unmatched:5,
    candidateCount:45
  };
  const res=await app.inject({
    method:"POST",
    url:"/investigate/summary",
    payload:{
      summary:summaryPayload
    }
  });
  expect(res.statusCode).toBe(200);
  const json=JSON.parse(res.body);
  expect(json.overview).toBeDefined();
  expect(json.keyFindings.length).toBeGreaterThanOrEqual(3);
  expect(json.attentionRequired.length).toBeGreaterThanOrEqual(1);
  expect(json.recommendedNextSteps.length).toBeGreaterThanOrEqual(1);
});
test("POST /investigate/ask returns contextual answer",async()=>{
  const mockRecord:FinancialRecord={
    id:"pay_dup",
    type:"PAYMENT",
    amount:50000,
    currency:"USD",
    timestamp:new Date("2026-01-01T00:00:00Z"),
    reference:"dup_ref",
    paymentMethod:"card"
  };
  const mockResult:ReconciliationResult={
    sourceRecordId:"pay_dup",
    sourceType:"PAYMENT",
    status:"AMBIGUOUS",
    matchedRecordIds:[],
    candidateRecordIds:["stl_1","stl_2"],
    evidenceScore:140,
    reasons:[]
  };
  const res=await app.inject({
    method:"POST",
    url:"/investigate/ask",
    payload:{
      question:"Why is this payment ambiguous?",
      context:{
        record:mockRecord,
        result:mockResult,
        candidates:[]
      }
    }
  });
  expect(res.statusCode).toBe(200);
  const json=JSON.parse(res.body);
  expect(json.answer).toContain("AMBIGUOUS");
  expect(json.provider).toBeDefined();
});
test("POST /investigate/ask returns 400 on empty question or bad context",async()=>{
  const res=await app.inject({
    method:"POST",
    url:"/investigate/ask",
    payload:{
      question:"",
      context:{}
    }
  });
  expect(res.statusCode).toBe(400);
});
