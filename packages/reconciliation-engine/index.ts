import {FinancialRecord,CandidateMatch,CandidateReason,ReconciliationResult} from "@ledgerlens/shared";
export const ENGINE_PLACEHOLDER="engine-placeholder";
export const MAX_TIME_WINDOW_MS=7*24*60*60*1000;
export const REASON_WEIGHTS:Record<CandidateReason,number>={
  EXACT_REFERENCE:100,
  AMOUNT_COMPATIBLE:20,
  CURRENCY_COMPATIBLE:10,
  TIME_WINDOW_COMPATIBLE:10
};
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
function calculateCandidateScore(reasons:CandidateReason[]):number{
  let score=0;
  for(let i=0;i<reasons.length;i++){
    score+=REASON_WEIGHTS[reasons[i]]||0;
  }
  return score;
}
export function resolveCandidates(records:FinancialRecord[],candidates:CandidateMatch[]):ReconciliationResult[]{
  const candidatesBySource=new Map<string,CandidateMatch[]>();
  for(let i=0;i<candidates.length;i++){
    const c=candidates[i];
    if(!candidatesBySource.has(c.sourceRecordId)){
      candidatesBySource.set(c.sourceRecordId,[]);
    }
    candidatesBySource.get(c.sourceRecordId)!.push(c);
  }
  const results:ReconciliationResult[]=[];
  const processedSourceIds=new Set<string>();
  for(let i=0;i<records.length;i++){
    const rec=records[i];
    if(rec.type!=="ORDER"&&rec.type!=="PAYMENT"&&rec.type!=="SETTLEMENT")continue;
    if(processedSourceIds.has(rec.id))continue;
    processedSourceIds.add(rec.id);
    const sourceCandidates=candidatesBySource.get(rec.id)||[];
    if(sourceCandidates.length===0){
      results.push({
        sourceRecordId:rec.id,
        sourceType:rec.type,
        status:"UNMATCHED",
        matchedRecordIds:[],
        candidateRecordIds:[],
        evidenceScore:0,
        reasons:[]
      });
    }else if(sourceCandidates.length===1){
      const c=sourceCandidates[0];
      const score=calculateCandidateScore(c.reasons);
      results.push({
        sourceRecordId:rec.id,
        sourceType:rec.type,
        status:"RESOLVED",
        matchedRecordIds:[c.targetRecordId],
        candidateRecordIds:[c.targetRecordId],
        evidenceScore:score,
        reasons:[...c.reasons]
      });
    }else{
      const scored=sourceCandidates.map(c=>({
        candidate:c,
        score:calculateCandidateScore(c.reasons)
      }));
      scored.sort((a,b)=>{
        if(b.score!==a.score)return b.score-a.score;
        if(a.candidate.targetRecordId<b.candidate.targetRecordId)return -1;
        if(a.candidate.targetRecordId>b.candidate.targetRecordId)return 1;
        return 0;
      });
      const highestScore=scored[0].score;
      const topMatches=scored.filter(s=>s.score===highestScore);
      if(topMatches.length===1){
        results.push({
          sourceRecordId:rec.id,
          sourceType:rec.type,
          status:"RESOLVED",
          matchedRecordIds:[topMatches[0].candidate.targetRecordId],
          candidateRecordIds:scored.map(s=>s.candidate.targetRecordId),
          evidenceScore:highestScore,
          reasons:[...topMatches[0].candidate.reasons]
        });
      }else{
        results.push({
          sourceRecordId:rec.id,
          sourceType:rec.type,
          status:"AMBIGUOUS",
          matchedRecordIds:[],
          candidateRecordIds:topMatches.map(t=>t.candidate.targetRecordId).sort((a,b)=>a<b?-1:a>b?1:0),
          evidenceScore:highestScore,
          reasons:[]
        });
      }
    }
  }
  results.sort((a,b)=>{
    if(a.sourceRecordId<b.sourceRecordId)return -1;
    if(a.sourceRecordId>b.sourceRecordId)return 1;
    return 0;
  });
  return results;
}
