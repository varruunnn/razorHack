import {Order,Payment,Refund,Adjustment,Settlement,BankEntry,FinancialRecord,ScenarioType,GroundTruthRelation,GeneratedData,GenerateOptions,Currency,RecordRelationship,UnresolvedReason,ResolutionStatus} from "@ledgerlens/shared";
export class SeededRandom{
  private state:number;
  constructor(seed:number){
    this.state=seed===0?1:seed;
  }
  next():number{
    this.state^=this.state<<13;
    this.state^=this.state>>17;
    this.state^=this.state<<5;
    return(this.state>>>0)/4294967296;
  }
  intRange(min:number,max:number):number{
    return Math.floor(this.next()*(max-min+1))+min;
  }
  choice<T>(arr:T[]):T{
    return arr[this.intRange(0,arr.length-1)];
  }
  bool():boolean{
    return this.next()>=0.5;
  }
  string(len:number):string{
    const chars="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let res="";
    for(let i=0;i<len;i++){
      res+=this.choice(chars.split(""));
    }
    return res;
  }
}
export function generateDataset(options:GenerateOptions):GeneratedData{
  const rng=new SeededRandom(options.seed);
  const records:FinancialRecord[]=[];
  const relations:GroundTruthRelation[]=[];
  const scenarios:ScenarioType[]=["CLEAN","PARTIAL_REFUND","DELAYED_SETTLEMENT","MISSING_BANK_ENTRY","SPLIT_SETTLEMENT","DUPLICATE_REFERENCE","ADJUSTMENT","UNRESOLVED"];
  let currentTime=new Date("2026-01-01T00:00:00Z").getTime();
  let flowsGenerated=0;
  while(flowsGenerated<options.flowCount){
    const scenario=rng.choice(scenarios);
    const flowId=`flow_${rng.string(8)}`;
    const orderId=`ord_${rng.string(8)}`;
    const paymentId=`pay_${rng.string(8)}`;
    const amount=rng.intRange(1000,100000);
    const currency:Currency="INR";
    const ref=`ref_${rng.string(8)}`;
    const order:Order={id:orderId,type:"ORDER",amount,currency,timestamp:new Date(currentTime),merchantId:"m_1",reference:ref};
    currentTime+=rng.intRange(1000,5000);
    const payment:Payment={id:paymentId,type:"PAYMENT",amount,currency,timestamp:new Date(currentTime),paymentMethod:"card",reference:ref};
    if(scenario==="DUPLICATE_REFERENCE"){
      const flowId2=`flow_${rng.string(8)}`;
      const orderId2=`ord_${rng.string(8)}`;
      const paymentId2=`pay_${rng.string(8)}`;
      const amount2=rng.intRange(1000,100000);
      const order2:Order={id:orderId2,type:"ORDER",amount:amount2,currency,timestamp:new Date(currentTime),merchantId:"m_1",reference:ref};
      currentTime+=rng.intRange(1000,5000);
      const payment2:Payment={id:paymentId2,type:"PAYMENT",amount:amount2,currency,timestamp:new Date(currentTime),paymentMethod:"card",reference:ref};
      const fees1=rng.intRange(10,50);
      const stl1Id=`stl_${rng.string(8)}`;
      const settlement1:Settlement={id:stl1Id,type:"SETTLEMENT",amount:amount-fees1,currency,timestamp:new Date(currentTime),fees:fees1,reference:ref};
      const bnk1Id=`bnk_${rng.string(8)}`;
      const bank1:BankEntry={id:bnk1Id,type:"BANK_ENTRY",amount:amount-fees1,currency,timestamp:new Date(currentTime),bankReference:`bref_${rng.string(8)}`,reference:ref};
      const fees2=rng.intRange(10,50);
      const stl2Id=`stl_${rng.string(8)}`;
      const settlement2:Settlement={id:stl2Id,type:"SETTLEMENT",amount:amount2-fees2,currency,timestamp:new Date(currentTime),fees:fees2,reference:ref};
      const bnk2Id=`bnk_${rng.string(8)}`;
      const bank2:BankEntry={id:bnk2Id,type:"BANK_ENTRY",amount:amount2-fees2,currency,timestamp:new Date(currentTime),bankReference:`bref_${rng.string(8)}`,reference:ref};
      records.push(order,payment,settlement1,bank1,order2,payment2,settlement2,bank2);
      relations.push({
        flowId,scenario,recordIds:[order.id,payment.id,settlement1.id,bank1.id],
        expectedResolutionStatus:"RESOLVED",
        relationships:[
          {sourceRecordIds:[order.id],targetRecordIds:[payment.id],type:"ORDER_TO_PAYMENT"},
          {sourceRecordIds:[payment.id],targetRecordIds:[settlement1.id],type:"PAYMENT_TO_SETTLEMENT"},
          {sourceRecordIds:[settlement1.id],targetRecordIds:[bank1.id],type:"SETTLEMENT_TO_BANK_ENTRY"}
        ]
      });
      flowsGenerated++;
      if(flowsGenerated<options.flowCount){
        relations.push({
          flowId:flowId2,scenario,recordIds:[order2.id,payment2.id,settlement2.id,bank2.id],
          expectedResolutionStatus:"RESOLVED",
          relationships:[
            {sourceRecordIds:[order2.id],targetRecordIds:[payment2.id],type:"ORDER_TO_PAYMENT"},
            {sourceRecordIds:[payment2.id],targetRecordIds:[settlement2.id],type:"PAYMENT_TO_SETTLEMENT"},
            {sourceRecordIds:[settlement2.id],targetRecordIds:[bank2.id],type:"SETTLEMENT_TO_BANK_ENTRY"}
          ]
        });
        flowsGenerated++;
      }
      continue;
    }
    if(scenario==="UNRESOLVED"){
      const orderId2=`ord_${rng.string(8)}`;
      const paymentId2=`pay_${rng.string(8)}`;
      const amount2=rng.intRange(1000,100000);
      const ref2=`ref_${rng.string(8)}`;
      const order2:Order={id:orderId2,type:"ORDER",amount:amount2,currency,timestamp:new Date(currentTime),merchantId:"m_1",reference:ref2};
      currentTime+=rng.intRange(1000,5000);
      const payment2:Payment={id:paymentId2,type:"PAYMENT",amount:amount2,currency,timestamp:new Date(currentTime),paymentMethod:"card",reference:ref2};
      currentTime+=rng.intRange(10000,50000);
      const fees=rng.intRange(10,50);
      const stlId=`stl_${rng.string(8)}`;
      const totalNet=amount+amount2-fees;
      const aggRef=`agg_${rng.string(8)}`;
      const settlement:Settlement={id:stlId,type:"SETTLEMENT",amount:totalNet,currency,timestamp:new Date(currentTime),fees,reference:aggRef};
      currentTime+=rng.intRange(10000,50000);
      const bnkId=`bnk_${rng.string(8)}`;
      const bank:BankEntry={id:bnkId,type:"BANK_ENTRY",amount:totalNet,currency,timestamp:new Date(currentTime),bankReference:`bref_${rng.string(8)}`,reference:aggRef};
      records.push(order,payment,order2,payment2,settlement,bank);
      const unresReason:UnresolvedReason="AMBIGUOUS_SETTLEMENT_PAYMENT_MATCH";
      relations.push({
        flowId,scenario,recordIds:[order.id,payment.id,order2.id,payment2.id,settlement.id,bank.id],
        expectedResolutionStatus:"UNRESOLVED",unresolvedReason:unresReason,
        relationships:[
          {sourceRecordIds:[order.id],targetRecordIds:[payment.id],type:"ORDER_TO_PAYMENT"},
          {sourceRecordIds:[order2.id],targetRecordIds:[payment2.id],type:"ORDER_TO_PAYMENT"},
          {sourceRecordIds:[payment.id,payment2.id],targetRecordIds:[settlement.id],type:"AMBIGUOUS"},
          {sourceRecordIds:[settlement.id],targetRecordIds:[bank.id],type:"SETTLEMENT_TO_BANK_ENTRY"}
        ]
      });
      flowsGenerated++;
      continue;
    }
    const flowRecords:FinancialRecord[]=[order,payment];
    const relationships:RecordRelationship[]=[
      {sourceRecordIds:[order.id],targetRecordIds:[payment.id],type:"ORDER_TO_PAYMENT"}
    ];
    let expectedStatus:ResolutionStatus="RESOLVED";
    let unresReason:UnresolvedReason|undefined=undefined;
    if(scenario==="CLEAN"){
      currentTime+=rng.intRange(10000,50000);
      const fees=rng.intRange(10,50);
      const stlId=`stl_${rng.string(8)}`;
      const settlement:Settlement={id:stlId,type:"SETTLEMENT",amount:amount-fees,currency,timestamp:new Date(currentTime),fees,reference:ref};
      currentTime+=rng.intRange(10000,50000);
      const bnkId=`bnk_${rng.string(8)}`;
      const bank:BankEntry={id:bnkId,type:"BANK_ENTRY",amount:amount-fees,currency,timestamp:new Date(currentTime),bankReference:`bref_${rng.string(8)}`,reference:ref};
      flowRecords.push(settlement,bank);
      relationships.push(
        {sourceRecordIds:[paymentId],targetRecordIds:[stlId],type:"PAYMENT_TO_SETTLEMENT"},
        {sourceRecordIds:[stlId],targetRecordIds:[bnkId],type:"SETTLEMENT_TO_BANK_ENTRY"}
      );
    }else if(scenario==="PARTIAL_REFUND"){
      currentTime+=rng.intRange(1000,5000);
      const refundAmt=rng.intRange(100,amount-100);
      const refId=`refnd_${rng.string(8)}`;
      const refund:Refund={id:refId,type:"REFUND",amount:refundAmt,currency,timestamp:new Date(currentTime),reason:"customer_return",reference:ref};
      currentTime+=rng.intRange(10000,50000);
      const fees=rng.intRange(10,50);
      const stlId=`stl_${rng.string(8)}`;
      const settlement:Settlement={id:stlId,type:"SETTLEMENT",amount:amount-refundAmt-fees,currency,timestamp:new Date(currentTime),fees,reference:ref};
      currentTime+=rng.intRange(10000,50000);
      const bnkId=`bnk_${rng.string(8)}`;
      const bank:BankEntry={id:bnkId,type:"BANK_ENTRY",amount:amount-refundAmt-fees,currency,timestamp:new Date(currentTime),bankReference:`bref_${rng.string(8)}`,reference:ref};
      flowRecords.push(refund,settlement,bank);
      relationships.push(
        {sourceRecordIds:[paymentId],targetRecordIds:[refId],type:"PAYMENT_TO_REFUND"},
        {sourceRecordIds:[paymentId],targetRecordIds:[stlId],type:"PAYMENT_TO_SETTLEMENT"},
        {sourceRecordIds:[stlId],targetRecordIds:[bnkId],type:"SETTLEMENT_TO_BANK_ENTRY"}
      );
    }else if(scenario==="DELAYED_SETTLEMENT"){
      currentTime+=rng.intRange(500000,1000000);
      const fees=rng.intRange(10,50);
      const stlId=`stl_${rng.string(8)}`;
      const settlement:Settlement={id:stlId,type:"SETTLEMENT",amount:amount-fees,currency,timestamp:new Date(currentTime),fees,reference:ref};
      currentTime+=rng.intRange(10000,50000);
      const bnkId=`bnk_${rng.string(8)}`;
      const bank:BankEntry={id:bnkId,type:"BANK_ENTRY",amount:amount-fees,currency,timestamp:new Date(currentTime),bankReference:`bref_${rng.string(8)}`,reference:ref};
      flowRecords.push(settlement,bank);
      relationships.push(
        {sourceRecordIds:[paymentId],targetRecordIds:[stlId],type:"PAYMENT_TO_SETTLEMENT"},
        {sourceRecordIds:[stlId],targetRecordIds:[bnkId],type:"SETTLEMENT_TO_BANK_ENTRY"}
      );
    }else if(scenario==="MISSING_BANK_ENTRY"){
      currentTime+=rng.intRange(10000,50000);
      const fees=rng.intRange(10,50);
      const stlId=`stl_${rng.string(8)}`;
      const settlement:Settlement={id:stlId,type:"SETTLEMENT",amount:amount-fees,currency,timestamp:new Date(currentTime),fees,reference:ref};
      flowRecords.push(settlement);
      relationships.push({sourceRecordIds:[paymentId],targetRecordIds:[stlId],type:"PAYMENT_TO_SETTLEMENT"});
      expectedStatus="UNRESOLVED";
      unresReason="MISSING_BANK_ENTRY";
    }else if(scenario==="SPLIT_SETTLEMENT"){
      currentTime+=rng.intRange(10000,50000);
      const fees1=rng.intRange(10,30);
      const fees2=rng.intRange(10,30);
      const netAmount=amount-fees1-fees2;
      const p1=rng.intRange(100,netAmount-100);
      const p2=netAmount-p1;
      const stl1Id=`stl_${rng.string(8)}`;
      const stl1:Settlement={id:stl1Id,type:"SETTLEMENT",amount:p1,currency,timestamp:new Date(currentTime),fees:fees1,reference:ref};
      const stl2Id=`stl_${rng.string(8)}`;
      const stl2:Settlement={id:stl2Id,type:"SETTLEMENT",amount:p2,currency,timestamp:new Date(currentTime),fees:fees2,reference:ref};
      currentTime+=rng.intRange(10000,50000);
      const bnk1Id=`bnk_${rng.string(8)}`;
      const bnk1:BankEntry={id:bnk1Id,type:"BANK_ENTRY",amount:p1,currency,timestamp:new Date(currentTime),bankReference:`bref_${rng.string(8)}`,reference:ref};
      const bnk2Id=`bnk_${rng.string(8)}`;
      const bank2:BankEntry={id:bnk2Id,type:"BANK_ENTRY",amount:p2,currency,timestamp:new Date(currentTime),bankReference:`bref_${rng.string(8)}`,reference:ref};
      flowRecords.push(stl1,stl2,bnk1,bank2);
      relationships.push(
        {sourceRecordIds:[paymentId],targetRecordIds:[stl1Id,stl2Id],type:"PAYMENT_TO_SETTLEMENT"},
        {sourceRecordIds:[stl1Id],targetRecordIds:[bnk1Id],type:"SETTLEMENT_TO_BANK_ENTRY"},
        {sourceRecordIds:[stl2Id],targetRecordIds:[bnk2Id],type:"SETTLEMENT_TO_BANK_ENTRY"}
      );
    }else if(scenario==="ADJUSTMENT"){
      currentTime+=rng.intRange(1000,5000);
      const adjAmt=rng.intRange(-500,500);
      const adjId=`adj_${rng.string(8)}`;
      const adjustment:Adjustment={id:adjId,type:"ADJUSTMENT",amount:adjAmt,currency,timestamp:new Date(currentTime),reason:"dispute",reference:ref};
      currentTime+=rng.intRange(10000,50000);
      const fees=rng.intRange(10,50);
      const stlId=`stl_${rng.string(8)}`;
      const settlement:Settlement={id:stlId,type:"SETTLEMENT",amount:amount+adjAmt-fees,currency,timestamp:new Date(currentTime),fees,reference:ref};
      currentTime+=rng.intRange(10000,50000);
      const bnkId=`bnk_${rng.string(8)}`;
      const bank:BankEntry={id:bnkId,type:"BANK_ENTRY",amount:amount+adjAmt-fees,currency,timestamp:new Date(currentTime),bankReference:`bref_${rng.string(8)}`,reference:ref};
      flowRecords.push(adjustment,settlement,bank);
      relationships.push(
        {sourceRecordIds:[paymentId],targetRecordIds:[adjId],type:"PAYMENT_TO_ADJUSTMENT"},
        {sourceRecordIds:[paymentId],targetRecordIds:[stlId],type:"PAYMENT_TO_SETTLEMENT"},
        {sourceRecordIds:[stlId],targetRecordIds:[bnkId],type:"SETTLEMENT_TO_BANK_ENTRY"}
      );
    }
    records.push(...flowRecords);
    relations.push({flowId,scenario,recordIds:flowRecords.map(r=>r.id),relationships,expectedResolutionStatus:expectedStatus,unresolvedReason:unresReason});
    flowsGenerated++;
  }
  return {dataset:{records},groundTruth:{relations}};
}
