import {test,expect} from "bun:test";
import {buildApp,ApiErrorResponse} from "./app";
import {Settlement} from "@ledgerlens/shared";
test("GET /health returns 200 with status ok",async()=>{
  const app=buildApp();
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
  const app=buildApp();
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
  const app=buildApp();
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
  const app=buildApp();
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
  const app=buildApp();
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
  const app=buildApp();
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
  const app=buildApp();
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
  const app=buildApp();
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
  const app=buildApp();
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
  const app=buildApp();
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
  const app=buildApp();
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
  const app=buildApp();
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
  const app=buildApp();
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
  const app=buildApp();
  const healthRes=await app.inject({method:"GET",url:"/health"});
  expect(healthRes.statusCode).toBe(200);
  const ingestRes=await app.inject({method:"POST",url:"/ingestions",payload:{records:[]}});
  expect(ingestRes.statusCode).toBe(200);
});
