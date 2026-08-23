import {test,expect} from "bun:test";
import {generateDataset} from "./index";
import {Settlement,Payment,Refund,Adjustment,BankEntry,ScenarioType,FinancialRecord} from "@ledgerlens/shared";
test("Same seed produces identical dataset",()=>{
  const ds1=generateDataset({flowCount:10,seed:42});
  const ds2=generateDataset({flowCount:10,seed:42});
  expect(ds1).toEqual(ds2);
});
test("Different seeds produce different datasets",()=>{
  const ds1=generateDataset({flowCount:10,seed:42});
  const ds2=generateDataset({flowCount:10,seed:43});
  expect(ds1).not.toEqual(ds2);
});
test("All generated IDs are unique",()=>{
  const ds=generateDataset({flowCount:50,seed:1});
  const ids=new Set<string>();
  let isUnique=true;
  for(let i=0;i<ds.dataset.records.length;i++){
    if(ids.has(ds.dataset.records[i].id))isUnique=false;
    ids.add(ds.dataset.records[i].id);
  }
  expect(isUnique).toBe(true);
});
test("No monetary amount is a floating point value",()=>{
  const ds=generateDataset({flowCount:50,seed:1});
  let allInt=true;
  for(let i=0;i<ds.dataset.records.length;i++){
    if(!Number.isInteger(ds.dataset.records[i].amount))allInt=false;
  }
  expect(allInt).toBe(true);
});
test("Settlement records do not contain paymentIds or hidden linkage fields",()=>{
  const ds=generateDataset({flowCount:50,seed:1});
  const settlements=ds.dataset.records.filter((r):r is Settlement=>r.type==="SETTLEMENT");
  expect(settlements.length).toBeGreaterThan(0);
  for(let i=0;i<settlements.length;i++){
    const stl=settlements[i] as unknown as Record<string,unknown>;
    expect(stl.paymentIds).toBeUndefined();
    expect(stl.matchedRecordIds).toBeUndefined();
    expect(stl.linkedSettlementIds).toBeUndefined();
  }
});
test("Visible dataset alone does not expose ground truth relationships directly in record fields",()=>{
  const ds=generateDataset({flowCount:50,seed:1});
  for(let i=0;i<ds.dataset.records.length;i++){
    const rec=ds.dataset.records[i] as unknown as Record<string,unknown>;
    expect(rec.relationships).toBeUndefined();
    expect(rec.expectedResolutionStatus).toBeUndefined();
    expect(rec.unresolvedReason).toBeUndefined();
    expect(rec.flowId).toBeUndefined();
  }
});
test("CLEAN scenarios are financially consistent",()=>{
  const ds=generateDataset({flowCount:50,seed:1});
  for(let i=0;i<ds.groundTruth.relations.length;i++){
    const rel=ds.groundTruth.relations[i];
    if(rel.scenario==="CLEAN"){
      const recs=ds.dataset.records.filter(r=>rel.recordIds.includes(r.id));
      const pay=recs.find((r):r is Payment=>r.type==="PAYMENT");
      const stl=recs.find((r):r is Settlement=>r.type==="SETTLEMENT");
      const bnk=recs.find((r):r is BankEntry=>r.type==="BANK_ENTRY");
      expect(pay).toBeDefined();
      expect(stl).toBeDefined();
      expect(bnk).toBeDefined();
      expect(pay!.amount-stl!.fees).toBe(stl!.amount);
      expect(stl!.amount).toBe(bnk!.amount);
    }
  }
});
test("PARTIAL_REFUND scenarios are financially consistent",()=>{
  const ds=generateDataset({flowCount:50,seed:1});
  for(let i=0;i<ds.groundTruth.relations.length;i++){
    const rel=ds.groundTruth.relations[i];
    if(rel.scenario==="PARTIAL_REFUND"){
      const recs=ds.dataset.records.filter(r=>rel.recordIds.includes(r.id));
      const pay=recs.find((r):r is Payment=>r.type==="PAYMENT");
      const ref=recs.find((r):r is Refund=>r.type==="REFUND");
      const stl=recs.find((r):r is Settlement=>r.type==="SETTLEMENT");
      expect(pay).toBeDefined();
      expect(ref).toBeDefined();
      expect(stl).toBeDefined();
      expect(pay!.amount-ref!.amount-stl!.fees).toBe(stl!.amount);
    }
  }
});
test("SPLIT_SETTLEMENT totals reconcile correctly and relationships link correctly",()=>{
  const ds=generateDataset({flowCount:50,seed:1});
  for(let i=0;i<ds.groundTruth.relations.length;i++){
    const rel=ds.groundTruth.relations[i];
    if(rel.scenario==="SPLIT_SETTLEMENT"){
      const recs=ds.dataset.records.filter(r=>rel.recordIds.includes(r.id));
      const pay=recs.find((r):r is Payment=>r.type==="PAYMENT");
      const stls=recs.filter((r):r is Settlement=>r.type==="SETTLEMENT");
      let stlTotal=0;
      let feesTotal=0;
      for(let j=0;j<stls.length;j++){
        stlTotal+=stls[j].amount;
        feesTotal+=stls[j].fees;
      }
      expect(stlTotal).toBe(pay!.amount-feesTotal);
      const stlRel=rel.relationships.find(r=>r.type==="PAYMENT_TO_SETTLEMENT");
      expect(stlRel).toBeDefined();
      expect(stlRel!.targetRecordIds.length).toBe(2);
    }
  }
});
test("MISSING_BANK_ENTRY scenarios contain no bank entry",()=>{
  const ds=generateDataset({flowCount:50,seed:1});
  for(let i=0;i<ds.groundTruth.relations.length;i++){
    const rel=ds.groundTruth.relations[i];
    if(rel.scenario==="MISSING_BANK_ENTRY"){
      const recs=ds.dataset.records.filter(r=>rel.recordIds.includes(r.id));
      const bnk=recs.find((r):r is BankEntry=>r.type==="BANK_ENTRY");
      expect(bnk).toBeUndefined();
    }
  }
});
test("UNRESOLVED scenarios are financially consistent and marked unresolved",()=>{
  const ds=generateDataset({flowCount:50,seed:1});
  for(let i=0;i<ds.groundTruth.relations.length;i++){
    const rel=ds.groundTruth.relations[i];
    if(rel.scenario==="UNRESOLVED"){
      expect(rel.expectedResolutionStatus).toBe("UNRESOLVED");
      expect(rel.unresolvedReason).toBe("AMBIGUOUS_SETTLEMENT_PAYMENT_MATCH");
      const recs=ds.dataset.records.filter(r=>rel.recordIds.includes(r.id));
      const payments=recs.filter((r):r is Payment=>r.type==="PAYMENT");
      const settlements=recs.filter((r):r is Settlement=>r.type==="SETTLEMENT");
      const bankEntries=recs.filter((r):r is BankEntry=>r.type==="BANK_ENTRY");
      expect(payments.length).toBe(2);
      expect(settlements.length).toBe(1);
      expect(bankEntries.length).toBe(1);
      const sumPayments=payments[0].amount+payments[1].amount;
      expect(sumPayments-settlements[0].fees).toBe(settlements[0].amount);
      expect(settlements[0].amount).toBe(bankEntries[0].amount);
      const ambiguousRel=rel.relationships.find(r=>r.type==="AMBIGUOUS");
      expect(ambiguousRel).toBeDefined();
      expect(ambiguousRel!.sourceRecordIds.length).toBe(2);
      expect(ambiguousRel!.targetRecordIds.length).toBe(1);
    }
  }
});
test("Duplicate reference scenarios create genuine ambiguity across distinct flows",()=>{
  const ds=generateDataset({flowCount:50,seed:1});
  const dupRelations=ds.groundTruth.relations.filter(r=>r.scenario==="DUPLICATE_REFERENCE");
  expect(dupRelations.length).toBeGreaterThanOrEqual(2);
  const refToPaymentIds=new Map<string,string[]>();
  const payments=ds.dataset.records.filter((r):r is Payment=>r.type==="PAYMENT");
  for(let i=0;i<payments.length;i++){
    const ref=payments[i].reference;
    if(ref){
      if(!refToPaymentIds.has(ref))refToPaymentIds.set(ref,[]);
      refToPaymentIds.get(ref)!.push(payments[i].id);
    }
  }
  let verifiedAmbiguity=false;
  for(const [ref,paymentIds] of refToPaymentIds.entries()){
    if(paymentIds.length>=2){
      const settlements=ds.dataset.records.filter((r):r is Settlement=>r.type==="SETTLEMENT"&&r.reference===ref);
      if(settlements.length>=2){
        verifiedAmbiguity=true;
        expect(new Set(paymentIds).size).toBeGreaterThanOrEqual(2);
        const stlIds=settlements.map(s=>s.id);
        expect(new Set(stlIds).size).toBeGreaterThanOrEqual(2);
        for(let j=0;j<settlements.length;j++){
          const stlObj=settlements[j] as unknown as Record<string,unknown>;
          expect(stlObj.paymentIds).toBeUndefined();
          expect(stlObj.matchedRecordIds).toBeUndefined();
          expect(stlObj.linkedPaymentId).toBeUndefined();
        }
        const relsForThisRef=dupRelations.filter(r=>r.recordIds.some(id=>paymentIds.includes(id)));
        expect(relsForThisRef.length).toBeGreaterThanOrEqual(2);
        const distinctFlowIds=new Set(relsForThisRef.map(r=>r.flowId));
        expect(distinctFlowIds.size).toBeGreaterThanOrEqual(2);
      }
    }
  }
  expect(verifiedAmbiguity).toBe(true);
});
test("Ground truth contains explicit relationships that reference valid visible record IDs",()=>{
  const ds=generateDataset({flowCount:20,seed:1});
  for(let i=0;i<ds.groundTruth.relations.length;i++){
    const rel=ds.groundTruth.relations[i];
    expect(rel.relationships).toBeDefined();
    expect(rel.relationships.length).toBeGreaterThan(0);
    for(let j=0;j<rel.relationships.length;j++){
      const r=rel.relationships[j];
      for(let k=0;k<r.sourceRecordIds.length;k++){
        const exists=ds.dataset.records.some(rec=>rec.id===r.sourceRecordIds[k]);
        expect(exists).toBe(true);
      }
      for(let k=0;k<r.targetRecordIds.length;k++){
        const exists=ds.dataset.records.some(rec=>rec.id===r.targetRecordIds[k]);
        expect(exists).toBe(true);
      }
    }
  }
});
test("Ground truth relationships reference only IDs within their own flow recordIds",()=>{
  const ds=generateDataset({flowCount:50,seed:1});
  for(let i=0;i<ds.groundTruth.relations.length;i++){
    const rel=ds.groundTruth.relations[i];
    const recordIdSet=new Set(rel.recordIds);
    for(let j=0;j<rel.relationships.length;j++){
      const r=rel.relationships[j];
      for(let k=0;k<r.sourceRecordIds.length;k++){
        expect(recordIdSet.has(r.sourceRecordIds[k])).toBe(true);
      }
      for(let k=0;k<r.targetRecordIds.length;k++){
        expect(recordIdSet.has(r.targetRecordIds[k])).toBe(true);
      }
    }
  }
});
test("All 8 scenario types are generated with sufficient flow count",()=>{
  const ds=generateDataset({flowCount:100,seed:1});
  const generatedScenarios=new Set(ds.groundTruth.relations.map(r=>r.scenario));
  const expectedScenarios:ScenarioType[]=[
    "CLEAN",
    "PARTIAL_REFUND",
    "DELAYED_SETTLEMENT",
    "MISSING_BANK_ENTRY",
    "SPLIT_SETTLEMENT",
    "DUPLICATE_REFERENCE",
    "ADJUSTMENT",
    "UNRESOLVED"
  ];
  for(let i=0;i<expectedScenarios.length;i++){
    expect(generatedScenarios.has(expectedScenarios[i])).toBe(true);
  }
});
test("Ground truth relations and relationships contain no duplicate record IDs",()=>{
  const ds=generateDataset({flowCount:50,seed:1});
  for(let i=0;i<ds.groundTruth.relations.length;i++){
    const rel=ds.groundTruth.relations[i];
    expect(new Set(rel.recordIds).size).toBe(rel.recordIds.length);
    for(let j=0;j<rel.relationships.length;j++){
      const r=rel.relationships[j];
      expect(new Set(r.sourceRecordIds).size).toBe(r.sourceRecordIds.length);
      expect(new Set(r.targetRecordIds).size).toBe(r.targetRecordIds.length);
    }
  }
});
test("All resolved scenarios satisfy explicit financial invariant based on relationship graph",()=>{
  const ds=generateDataset({flowCount:100,seed:1});
  const recordMap=new Map<string,FinancialRecord>();
  for(let i=0;i<ds.dataset.records.length;i++){
    recordMap.set(ds.dataset.records[i].id,ds.dataset.records[i]);
  }
  for(let i=0;i<ds.groundTruth.relations.length;i++){
    const rel=ds.groundTruth.relations[i];
    if(rel.expectedResolutionStatus==="RESOLVED"){
      const paymentIds=new Set<string>();
      const settlementIds=new Set<string>();
      const refundIds=new Set<string>();
      const adjustmentIds=new Set<string>();
      for(let j=0;j<rel.relationships.length;j++){
        const r=rel.relationships[j];
        if(r.type==="PAYMENT_TO_SETTLEMENT"){
          for(let k=0;k<r.sourceRecordIds.length;k++)paymentIds.add(r.sourceRecordIds[k]);
          for(let k=0;k<r.targetRecordIds.length;k++)settlementIds.add(r.targetRecordIds[k]);
        }else if(r.type==="PAYMENT_TO_REFUND"){
          for(let k=0;k<r.targetRecordIds.length;k++)refundIds.add(r.targetRecordIds[k]);
        }else if(r.type==="PAYMENT_TO_ADJUSTMENT"){
          for(let k=0;k<r.targetRecordIds.length;k++)adjustmentIds.add(r.targetRecordIds[k]);
        }
      }
      if(paymentIds.size>0&&settlementIds.size>0){
        let sumPayments=0;
        for(const pid of paymentIds){
          const p=recordMap.get(pid) as Payment;
          expect(p).toBeDefined();
          sumPayments+=p.amount;
        }
        let sumRefunds=0;
        for(const rid of refundIds){
          const ref=recordMap.get(rid) as Refund;
          expect(ref).toBeDefined();
          sumRefunds+=ref.amount;
        }
        let sumAdjustments=0;
        for(const aid of adjustmentIds){
          const adj=recordMap.get(aid) as Adjustment;
          expect(adj).toBeDefined();
          sumAdjustments+=adj.amount;
        }
        let sumSettlementAmounts=0;
        let sumSettlementFees=0;
        for(const sid of settlementIds){
          const stl=recordMap.get(sid) as Settlement;
          expect(stl).toBeDefined();
          sumSettlementAmounts+=stl.amount;
          sumSettlementFees+=stl.fees;
        }
        expect(sumPayments-sumRefunds+sumAdjustments-sumSettlementFees).toBe(sumSettlementAmounts);
      }
    }
  }
});
