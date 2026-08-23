import {test,expect} from "bun:test";
import {normalizeRecords,RawRecord,RejectedRecord} from "./index";
import {Settlement} from "@ledgerlens/shared";
test("Valid canonical-style records normalize successfully",()=>{
  const raw:RawRecord[]=[
    {id:"ord_1",type:"ORDER",amount:100.50,currency:"USD",timestamp:"2026-01-01T00:00:00Z",merchantId:"m_1",reference:"ref_1"},
    {id:"pay_1",type:"PAYMENT",amount:100.50,currency:"USD",timestamp:"2026-01-01T00:01:00Z",paymentMethod:"card",reference:"ref_1"},
    {id:"stl_1",type:"SETTLEMENT",amount:100.00,currency:"USD",timestamp:"2026-01-01T00:05:00Z",fees:0.50,reference:"ref_1"},
    {id:"bnk_1",type:"BANK_ENTRY",amount:100.00,currency:"USD",timestamp:"2026-01-01T00:06:00Z",bankReference:"bref_1",reference:"ref_1"}
  ];
  const res=normalizeRecords(raw);
  expect(res.rejected.length).toBe(0);
  expect(res.records.length).toBe(4);
  expect(res.records[0].id).toBe("ord_1");
  expect(res.records[0].amount).toBe(10050);
  expect(res.records[1].id).toBe("pay_1");
  expect(res.records[1].amount).toBe(10050);
  expect((res.records[2] as Settlement).fees).toBe(50);
});
test("Alias mapping normalizes correctly",()=>{
  const raw:RawRecord[]=[{
    transaction_id:"txn_99",
    type:"settlement",
    transaction_amount:"250.75",
    transaction_currency:"usd",
    created_at:1767225600,
    txn_ref:"ref_custom",
    fee:"1.25"
  }];
  const res=normalizeRecords(raw);
  expect(res.rejected.length).toBe(0);
  expect(res.records.length).toBe(1);
  const stl=res.records[0] as Settlement;
  expect(stl.id).toBe("txn_99");
  expect(stl.type).toBe("SETTLEMENT");
  expect(stl.amount).toBe(25075);
  expect(stl.currency).toBe("USD");
  expect(stl.fees).toBe(125);
  expect(stl.reference).toBe("ref_custom");
  expect(stl.timestamp.toISOString()).toBe("2026-01-01T00:00:00.000Z");
});
test("Record containing only transaction_id sets id and leaves reference undefined",()=>{
  const raw:RawRecord[]=[{
    transaction_id:"txn_123",
    type:"PAYMENT",
    amount:"100.00",
    currency:"USD",
    timestamp:"2026-01-01T00:00:00Z"
  }];
  const res=normalizeRecords(raw);
  expect(res.records.length).toBe(1);
  expect(res.records[0].id).toBe("txn_123");
  expect(res.records[0].reference).toBeUndefined();
});
test("Record containing id and transaction_id uses transaction_id as reference when no explicit reference exists",()=>{
  const raw:RawRecord[]=[{
    id:"internal_123",
    transaction_id:"provider_456",
    type:"PAYMENT",
    amount:"100.00",
    currency:"USD",
    timestamp:"2026-01-01T00:00:00Z"
  }];
  const res=normalizeRecords(raw);
  expect(res.records.length).toBe(1);
  expect(res.records[0].id).toBe("internal_123");
  expect(res.records[0].reference).toBe("provider_456");
});
test("Explicit reference takes priority: reference > txn_ref > ref > transaction_id fallback",()=>{
  const raw1:RawRecord[]=[{
    id:"internal_1",
    transaction_id:"provider_1",
    ref:"ref_1",
    txn_ref:"txnref_1",
    reference:"canonical_ref_1",
    type:"PAYMENT",
    amount:"100.00",
    currency:"USD",
    timestamp:"2026-01-01T00:00:00Z"
  }];
  const res1=normalizeRecords(raw1);
  expect(res1.records[0].reference).toBe("canonical_ref_1");
  const raw2:RawRecord[]=[{
    id:"internal_2",
    transaction_id:"provider_2",
    ref:"ref_2",
    txn_ref:"txnref_2",
    type:"PAYMENT",
    amount:"100.00",
    currency:"USD",
    timestamp:"2026-01-01T00:00:00Z"
  }];
  const res2=normalizeRecords(raw2);
  expect(res2.records[0].reference).toBe("txnref_2");
  const raw3:RawRecord[]=[{
    id:"internal_3",
    transaction_id:"provider_3",
    ref:"ref_3",
    type:"PAYMENT",
    amount:"100.00",
    currency:"USD",
    timestamp:"2026-01-01T00:00:00Z"
  }];
  const res3=normalizeRecords(raw3);
  expect(res3.records[0].reference).toBe("ref_3");
  const raw4:RawRecord[]=[{
    id:"internal_4",
    transaction_id:"provider_4",
    type:"PAYMENT",
    amount:"100.00",
    currency:"USD",
    timestamp:"2026-01-01T00:00:00Z"
  }];
  const res4=normalizeRecords(raw4);
  expect(res4.records[0].reference).toBe("provider_4");
});
test("RejectedRecord does not expose message field",()=>{
  const raw:RawRecord[]=[{type:"PAYMENT",amount:100,currency:"USD",timestamp:"2026-01-01T00:00:00Z"}];
  const res=normalizeRecords(raw);
  expect(res.rejected.length).toBe(1);
  const rej=res.rejected[0] as unknown as Record<string,unknown>;
  expect(rej.message).toBeUndefined();
  expect(rej.reason).toBe("MISSING_ID");
  expect(rej.index).toBe(0);
});
test("Major unit strings become integer minor units",()=>{
  const raw:RawRecord[]=[{id:"pay_1",type:"PAYMENT",amount:"100.50",currency:"INR",timestamp:"2026-01-01T00:00:00Z"}];
  const res=normalizeRecords(raw);
  expect(res.records[0].amount).toBe(10050);
});
test("Major unit numbers become integer minor units",()=>{
  const raw:RawRecord[]=[{id:"pay_1",type:"PAYMENT",amount:100.5,currency:"INR",timestamp:"2026-01-01T00:00:00Z"}];
  const res=normalizeRecords(raw);
  expect(res.records[0].amount).toBe(10050);
});
test("Currency symbols in string amounts are stripped and normalized",()=>{
  const raw:RawRecord[]=[
    {id:"pay_1",type:"PAYMENT",amount:"₹100.50",currency:"INR",timestamp:"2026-01-01T00:00:00Z"},
    {id:"pay_2",type:"PAYMENT",amount:"$ 200.00",currency:"USD",timestamp:"2026-01-01T00:00:00Z"}
  ];
  const res=normalizeRecords(raw);
  expect(res.records[0].amount).toBe(10050);
  expect(res.records[1].amount).toBe(20000);
});
test("Explicit MINOR unit preserves integer amount",()=>{
  const raw:RawRecord[]=[{id:"pay_1",type:"PAYMENT",amount:10050,amount_unit:"MINOR",currency:"INR",timestamp:"2026-01-01T00:00:00Z"}];
  const res=normalizeRecords(raw);
  expect(res.records[0].amount).toBe(10050);
});
test("Explicit MINOR unit with decimal is rejected",()=>{
  const raw:RawRecord[]=[{id:"pay_1",type:"PAYMENT",amount:"10050.5",amount_unit:"MINOR",currency:"INR",timestamp:"2026-01-01T00:00:00Z"}];
  const res=normalizeRecords(raw);
  expect(res.records.length).toBe(0);
  expect(res.rejected.length).toBe(1);
  expect(res.rejected[0].reason).toBe("INVALID_AMOUNT");
});
test("Invalid decimal precision is rejected",()=>{
  const raw:RawRecord[]=[{id:"pay_1",type:"PAYMENT",amount:"100.999",currency:"INR",timestamp:"2026-01-01T00:00:00Z"}];
  const res=normalizeRecords(raw);
  expect(res.records.length).toBe(0);
  expect(res.rejected.length).toBe(1);
  expect(res.rejected[0].reason).toBe("INVALID_AMOUNT");
});
test("Invalid money strings are rejected",()=>{
  const raw:RawRecord[]=[{id:"pay_1",type:"PAYMENT",amount:"abc",currency:"INR",timestamp:"2026-01-01T00:00:00Z"}];
  const res=normalizeRecords(raw);
  expect(res.records.length).toBe(0);
  expect(res.rejected.length).toBe(1);
  expect(res.rejected[0].reason).toBe("INVALID_AMOUNT");
});
test("NaN and Infinity are rejected",()=>{
  const raw:RawRecord[]=[
    {id:"pay_1",type:"PAYMENT",amount:NaN,currency:"INR",timestamp:"2026-01-01T00:00:00Z"},
    {id:"pay_2",type:"PAYMENT",amount:Infinity,currency:"INR",timestamp:"2026-01-01T00:00:00Z"},
    {id:"pay_3",type:"PAYMENT",amount:-Infinity,currency:"INR",timestamp:"2026-01-01T00:00:00Z"}
  ];
  const res=normalizeRecords(raw);
  expect(res.records.length).toBe(0);
  expect(res.rejected.length).toBe(3);
  expect(res.rejected[0].reason).toBe("INVALID_AMOUNT");
  expect(res.rejected[1].reason).toBe("INVALID_AMOUNT");
  expect(res.rejected[2].reason).toBe("INVALID_AMOUNT");
});
test("Negative amount is allowed for ADJUSTMENT but rejected for PAYMENT",()=>{
  const raw:RawRecord[]=[
    {id:"adj_1",type:"ADJUSTMENT",amount:"-50.00",currency:"INR",timestamp:"2026-01-01T00:00:00Z"},
    {id:"pay_1",type:"PAYMENT",amount:"-50.00",currency:"INR",timestamp:"2026-01-01T00:00:00Z"}
  ];
  const res=normalizeRecords(raw);
  expect(res.records.length).toBe(1);
  expect(res.records[0].id).toBe("adj_1");
  expect(res.records[0].amount).toBe(-5000);
  expect(res.rejected.length).toBe(1);
  expect(res.rejected[0].reason).toBe("NEGATIVE_AMOUNT");
});
test("Case-insensitive type normalization works",()=>{
  const raw:RawRecord[]=[
    {id:"p1",type:"payment",amount:10,currency:"USD",timestamp:"2026-01-01T00:00:00Z"},
    {id:"p2",type:"PAYMENT",amount:10,currency:"USD",timestamp:"2026-01-01T00:00:00Z"},
    {id:"p3",type:"Payment",amount:10,currency:"USD",timestamp:"2026-01-01T00:00:00Z"},
    {id:"b1",type:"bank_entry",amount:10,currency:"USD",timestamp:"2026-01-01T00:00:00Z"},
    {id:"b2",type:"BANKENTRY",amount:10,currency:"USD",timestamp:"2026-01-01T00:00:00Z"}
  ];
  const res=normalizeRecords(raw);
  expect(res.records.length).toBe(5);
  expect(res.records[0].type).toBe("PAYMENT");
  expect(res.records[1].type).toBe("PAYMENT");
  expect(res.records[2].type).toBe("PAYMENT");
  expect(res.records[3].type).toBe("BANK_ENTRY");
  expect(res.records[4].type).toBe("BANK_ENTRY");
});
test("Unknown type is rejected",()=>{
  const raw:RawRecord[]=[{id:"x1",type:"UNKNOWN_TYPE",amount:10,currency:"USD",timestamp:"2026-01-01T00:00:00Z"}];
  const res=normalizeRecords(raw);
  expect(res.records.length).toBe(0);
  expect(res.rejected.length).toBe(1);
  expect(res.rejected[0].reason).toBe("INVALID_TYPE");
});
test("ISO timestamps normalize correctly",()=>{
  const raw:RawRecord[]=[{id:"p1",type:"PAYMENT",amount:10,currency:"USD",timestamp:"2026-06-15T12:30:45.123Z"}];
  const res=normalizeRecords(raw);
  expect(res.records[0].timestamp.toISOString()).toBe("2026-06-15T12:30:45.123Z");
});
test("Unix seconds normalize correctly",()=>{
  const raw:RawRecord[]=[{id:"p1",type:"PAYMENT",amount:10,currency:"USD",timestamp:1767225600}];
  const res=normalizeRecords(raw);
  expect(res.records[0].timestamp.toISOString()).toBe("2026-01-01T00:00:00.000Z");
});
test("Unix milliseconds normalize correctly",()=>{
  const raw:RawRecord[]=[{id:"p1",type:"PAYMENT",amount:10,currency:"USD",timestamp:1767225600000}];
  const res=normalizeRecords(raw);
  expect(res.records[0].timestamp.toISOString()).toBe("2026-01-01T00:00:00.000Z");
});
test("Invalid timestamps are rejected",()=>{
  const raw:RawRecord[]=[
    {id:"p1",type:"PAYMENT",amount:10,currency:"USD",timestamp:"invalid-date"},
    {id:"p2",type:"PAYMENT",amount:10,currency:"USD",timestamp:NaN}
  ];
  const res=normalizeRecords(raw);
  expect(res.records.length).toBe(0);
  expect(res.rejected.length).toBe(2);
  expect(res.rejected[0].reason).toBe("INVALID_TIMESTAMP");
  expect(res.rejected[1].reason).toBe("INVALID_TIMESTAMP");
});
test("Duplicate IDs accept first valid record and reject subsequent with DUPLICATE_ID",()=>{
  const raw:RawRecord[]=[
    {id:"dup_1",type:"PAYMENT",amount:100,currency:"USD",timestamp:"2026-01-01T00:00:00Z"},
    {id:"dup_1",type:"PAYMENT",amount:200,currency:"USD",timestamp:"2026-01-01T00:00:00Z"}
  ];
  const res=normalizeRecords(raw);
  expect(res.records.length).toBe(1);
  expect(res.records[0].amount).toBe(10000);
  expect(res.rejected.length).toBe(1);
  expect(res.rejected[0].index).toBe(1);
  expect(res.rejected[0].reason).toBe("DUPLICATE_ID");
});
test("Batch processing continues after invalid records",()=>{
  const raw:RawRecord[]=[
    {id:"p1",type:"PAYMENT",amount:"invalid",currency:"USD",timestamp:"2026-01-01T00:00:00Z"},
    {id:"p2",type:"PAYMENT",amount:50,currency:"USD",timestamp:"2026-01-01T00:00:00Z"},
    {id:"p3",type:"INVALID",amount:50,currency:"USD",timestamp:"2026-01-01T00:00:00Z"},
    {id:"p4",type:"PAYMENT",amount:75,currency:"USD",timestamp:"2026-01-01T00:00:00Z"}
  ];
  const res=normalizeRecords(raw);
  expect(res.records.length).toBe(2);
  expect(res.records[0].id).toBe("p2");
  expect(res.records[1].id).toBe("p4");
  expect(res.rejected.length).toBe(2);
  expect(res.rejected[0].index).toBe(0);
  expect(res.rejected[1].index).toBe(2);
});
test("Settlement fee aliases normalize correctly",()=>{
  const raw:RawRecord[]=[
    {id:"s1",type:"SETTLEMENT",amount:100,currency:"USD",timestamp:"2026-01-01T00:00:00Z",fee:"2.50"},
    {id:"s2",type:"SETTLEMENT",amount:100,currency:"USD",timestamp:"2026-01-01T00:00:00Z",fees:"3.50"}
  ];
  const res=normalizeRecords(raw);
  expect((res.records[0] as Settlement).fees).toBe(250);
  expect((res.records[1] as Settlement).fees).toBe(350);
});
test("Missing settlement fee defaults to zero",()=>{
  const raw:RawRecord[]=[{id:"s1",type:"SETTLEMENT",amount:100,currency:"USD",timestamp:"2026-01-01T00:00:00Z"}];
  const res=normalizeRecords(raw);
  expect((res.records[0] as Settlement).fees).toBe(0);
});
test("Invalid currencies are rejected",()=>{
  const raw:RawRecord[]=[
    {id:"p1",type:"PAYMENT",amount:10,currency:"US",timestamp:"2026-01-01T00:00:00Z"},
    {id:"p2",type:"PAYMENT",amount:10,currency:"TOOLONG",timestamp:"2026-01-01T00:00:00Z"},
    {id:"p3",type:"PAYMENT",amount:10,currency:123,timestamp:"2026-01-01T00:00:00Z"}
  ];
  const res=normalizeRecords(raw);
  expect(res.records.length).toBe(0);
  expect(res.rejected.length).toBe(3);
  expect(res.rejected[0].reason).toBe("INVALID_CURRENCY");
  expect(res.rejected[1].reason).toBe("INVALID_CURRENCY");
  expect(res.rejected[2].reason).toBe("INVALID_CURRENCY");
});
test("No normalized visible record contains hidden reconciliation linkage fields",()=>{
  const raw:RawRecord[]=[
    {id:"s1",type:"SETTLEMENT",amount:100,currency:"USD",timestamp:"2026-01-01T00:00:00Z",paymentIds:["p1"],matchedRecordIds:["p2"]}
  ];
  const res=normalizeRecords(raw);
  expect(res.records.length).toBe(1);
  const stl=res.records[0] as unknown as Record<string,unknown>;
  expect(stl.paymentIds).toBeUndefined();
  expect(stl.matchedRecordIds).toBeUndefined();
  expect(stl.linkedSettlementIds).toBeUndefined();
});
test("All normalized money values are integers",()=>{
  const raw:RawRecord[]=[
    {id:"p1",type:"PAYMENT",amount:"123.45",currency:"USD",timestamp:"2026-01-01T00:00:00Z"},
    {id:"s1",type:"SETTLEMENT",amount:"99.99",fee:"1.11",currency:"USD",timestamp:"2026-01-01T00:00:00Z"}
  ];
  const res=normalizeRecords(raw);
  for(let i=0;i<res.records.length;i++){
    expect(Number.isInteger(res.records[i].amount)).toBe(true);
    if(res.records[i].type==="SETTLEMENT"){
      expect(Number.isInteger((res.records[i] as Settlement).fees)).toBe(true);
    }
  }
});
test("The normalizer does not mutate the original raw input objects",()=>{
  const original:RawRecord={id:"p1",type:"payment",amount:"100.50",currency:"usd",timestamp:1767225600};
  const copy={...original};
  normalizeRecords([original]);
  expect(original).toEqual(copy);
});
test("Invalid amount_unit is rejected",()=>{
  const raw:RawRecord[]=[{id:"p1",type:"PAYMENT",amount:100,amount_unit:"INVALID_UNIT",currency:"USD",timestamp:"2026-01-01T00:00:00Z"}];
  const res=normalizeRecords(raw);
  expect(res.records.length).toBe(0);
  expect(res.rejected.length).toBe(1);
  expect(res.rejected[0].reason).toBe("INVALID_AMOUNT_UNIT");
});
test("Missing required ID or timestamp or type or currency is rejected",()=>{
  const raw:RawRecord[]=[
    {type:"PAYMENT",amount:10,currency:"USD",timestamp:"2026-01-01T00:00:00Z"},
    {id:"p2",amount:10,currency:"USD",timestamp:"2026-01-01T00:00:00Z"},
    {id:"p3",type:"PAYMENT",amount:10,timestamp:"2026-01-01T00:00:00Z"},
    {id:"p4",type:"PAYMENT",amount:10,currency:"USD"}
  ];
  const res=normalizeRecords(raw);
  expect(res.records.length).toBe(0);
  expect(res.rejected.length).toBe(4);
  expect(res.rejected[0].reason).toBe("MISSING_ID");
  expect(res.rejected[1].reason).toBe("MISSING_TYPE");
  expect(res.rejected[2].reason).toBe("MISSING_CURRENCY");
  expect(res.rejected[3].reason).toBe("MISSING_TIMESTAMP");
});
test("Negative settlement fee is rejected with NEGATIVE_FEE",()=>{
  const raw:RawRecord[]=[{id:"s1",type:"SETTLEMENT",amount:100,fee:-10,currency:"USD",timestamp:"2026-01-01T00:00:00Z"}];
  const res=normalizeRecords(raw);
  expect(res.records.length).toBe(0);
  expect(res.rejected.length).toBe(1);
  expect(res.rejected[0].reason).toBe("NEGATIVE_FEE");
});
