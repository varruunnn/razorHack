import {FinancialRecord,CandidateMatch,CandidateReason} from "@ledgerlens/shared";
export const ENGINE_PLACEHOLDER="engine-placeholder";
export const MAX_TIME_WINDOW_MS=7*24*60*60*1000;
function isSupportedPair(sourceType:FinancialRecord["type"],targetType:FinancialRecord["type"]):boolean{
  if(sourceType==="ORDER"&&targetType==="PAYMENT")return true;
  if(sourceType==="PAYMENT"&&(targetType==="SETTLEMENT"||targetType==="REFUND"||targetType==="ADJUSTMENT"))return true;
  if(sourceType==="SETTLEMENT"&&targetType==="BANK_ENTRY")return true;
  return false;
}
function isAmountCompatible(source:FinancialRecord,target:FinancialRecord):boolean{
  if(source.type==="ORDER"&&target.type==="PAYMENT"){
    return source.amount===target.amount;
  }
  if(source.type==="PAYMENT"&&target.type==="SETTLEMENT"){
    return target.amount<=source.amount;
  }
  if(source.type==="PAYMENT"&&target.type==="REFUND"){
    return target.amount<=source.amount;
  }
  if(source.type==="PAYMENT"&&target.type==="ADJUSTMENT"){
    return Math.abs(target.amount)<=source.amount;
  }
  if(source.type==="SETTLEMENT"&&target.type==="BANK_ENTRY"){
    return source.amount===target.amount;
  }
  return false;
}
export function discoverCandidates(records:FinancialRecord[]):CandidateMatch[]{
  const candidates:CandidateMatch[]=[];
  for(let i=0;i<records.length;i++){
    const source=records[i];
    for(let j=0;j<records.length;j++){
      if(i===j)continue;
      const target=records[j];
      if(!isSupportedPair(source.type,target.type))continue;
      if(source.currency!==target.currency)continue;
      const timeDiff=target.timestamp.getTime()-source.timestamp.getTime();
      if(timeDiff<0||timeDiff>MAX_TIME_WINDOW_MS)continue;
      if(!isAmountCompatible(source,target))continue;
      const reasons:CandidateReason[]=[];
      const hasExactRef=Boolean(
        source.reference&&
        target.reference&&
        source.reference.trim().length>0&&
        target.reference.trim().length>0&&
        source.reference===target.reference
      );
      if(hasExactRef){
        reasons.push("EXACT_REFERENCE");
      }
      reasons.push("CURRENCY_COMPATIBLE","AMOUNT_COMPATIBLE","TIME_WINDOW_COMPATIBLE");
      candidates.push({
        sourceRecordId:source.id,
        targetRecordId:target.id,
        sourceType:source.type,
        targetType:target.type,
        reasons
      });
    }
  }
  candidates.sort((a,b)=>{
    if(a.sourceRecordId<b.sourceRecordId)return -1;
    if(a.sourceRecordId>b.sourceRecordId)return 1;
    if(a.targetRecordId<b.targetRecordId)return -1;
    if(a.targetRecordId>b.targetRecordId)return 1;
    return 0;
  });
  return candidates;
}
