import Fastify,{FastifyInstance,FastifyError} from "fastify";
import {normalizeRecords,RawRecord} from "@ledgerlens/ingestion";
import {discoverCandidates,resolveCandidates} from "@ledgerlens/reconciliation-engine";
import {
  generateInvestigationReport,
  generateExecutiveSummary,
  askInvestigationQuestion,
  getAiProviderInfo
} from "@ledgerlens/ai-investigator";
import {
  ReconciliationSummary,
  FinancialRecord,
  ReconciliationResult,
  CandidateMatch
} from "@ledgerlens/shared";
export const MAX_BATCH_SIZE=1000;
export interface ApiErrorResponse{
  error:{
    code:"INVALID_REQUEST"|"BATCH_TOO_LARGE"|"INTERNAL_ERROR";
    message:string;
  };
}
export function buildApp():FastifyInstance{
  const app=Fastify({
    logger:false
  });
  app.addHook("onRequest",async(request,reply)=>{
    reply.header("Access-Control-Allow-Origin","*");
    reply.header("Access-Control-Allow-Methods","GET,POST,OPTIONS");
    reply.header("Access-Control-Allow-Headers","Content-Type,Authorization");
    if(request.method==="OPTIONS"){
      return reply.status(204).send();
    }
  });
  app.setErrorHandler((error:FastifyError,request,reply)=>{
    const err=error as{statusCode?:number;code?:string;message?:string};
    if(err.statusCode===400||err.code==="FST_ERR_CTP_INVALID_MEDIA_TYPE"||err.code==="FST_ERR_CTP_EMPTY_JSON_BODY"){
      reply.status(400).send({error:{code:"INVALID_REQUEST",message:err.message||"Invalid request"}});
      return;
    }
    if(err.statusCode===413||err.code==="FST_ERR_CTP_BODY_TOO_LARGE"){
      reply.status(413).send({error:{code:"BATCH_TOO_LARGE",message:err.message||"Batch too large"}});
      return;
    }
    const statusCode=typeof err.statusCode==="number"&&err.statusCode>=400&&err.statusCode<600?err.statusCode:500;
    reply.status(statusCode).send({error:{code:"INTERNAL_ERROR",message:"An unexpected error occurred"}});
  });
  app.get("/health",async(request,reply)=>{
    return{
      status:"ok",
      service:"ledgerlens-api"
    };
  });
  app.get("/investigate/info",async(request,reply)=>{
    return reply.status(200).send(getAiProviderInfo());
  });
  app.post("/ingestions",async(request,reply)=>{
    const body=request.body;
    if(!body||typeof body!=="object"||Array.isArray(body)){
      return reply.status(400).send({error:{code:"INVALID_REQUEST",message:"Request body must be an object"}});
    }
    const bodyObj=body as Record<string,unknown>;
    if(!("records" in bodyObj)||!Array.isArray(bodyObj.records)){
      return reply.status(400).send({error:{code:"INVALID_REQUEST",message:"Field 'records' must be an array"}});
    }
    const records=bodyObj.records;
    if(records.length>MAX_BATCH_SIZE){
      return reply.status(413).send({error:{code:"BATCH_TOO_LARGE",message:`Batch size exceeds maximum limit of ${MAX_BATCH_SIZE}`}});
    }
    for(let i=0;i<records.length;i++){
      if(!records[i]||typeof records[i]!=="object"||Array.isArray(records[i])){
        return reply.status(400).send({error:{code:"INVALID_REQUEST",message:`Record at index ${i} must be an object`}});
      }
    }
    const result=normalizeRecords(records as RawRecord[]);
    return reply.status(200).send({
      acceptedCount:result.records.length,
      rejectedCount:result.rejected.length,
      records:result.records,
      rejected:result.rejected
    });
  });
  app.post("/reconcile",async(request,reply)=>{
    const body=request.body;
    if(!body||typeof body!=="object"||Array.isArray(body)){
      return reply.status(400).send({error:{code:"INVALID_REQUEST",message:"Request body must be an object"}});
    }
    const bodyObj=body as Record<string,unknown>;
    if(!("records" in bodyObj)||!Array.isArray(bodyObj.records)){
      return reply.status(400).send({error:{code:"INVALID_REQUEST",message:"Field 'records' must be an array"}});
    }
    const records=bodyObj.records;
    if(records.length>MAX_BATCH_SIZE){
      return reply.status(413).send({error:{code:"BATCH_TOO_LARGE",message:`Batch size exceeds maximum limit of ${MAX_BATCH_SIZE}`}});
    }
    for(let i=0;i<records.length;i++){
      if(!records[i]||typeof records[i]!=="object"||Array.isArray(records[i])){
        return reply.status(400).send({error:{code:"INVALID_REQUEST",message:`Record at index ${i} must be an object`}});
      }
    }
    const normalizationResult=normalizeRecords(records as RawRecord[]);
    const candidates=discoverCandidates(normalizationResult.records);
    const results=resolveCandidates(normalizationResult.records,candidates);
    let resolved=0;
    let ambiguous=0;
    let unmatched=0;
    for(let i=0;i<results.length;i++){
      const st=results[i].status;
      if(st==="RESOLVED")resolved++;
      else if(st==="AMBIGUOUS")ambiguous++;
      else if(st==="UNMATCHED")unmatched++;
    }
    const summary:ReconciliationSummary={
      totalInputRecords:records.length,
      acceptedRecords:normalizationResult.records.length,
      rejectedRecords:normalizationResult.rejected.length,
      resolved,
      ambiguous,
      unmatched,
      candidateCount:candidates.length
    };
    return reply.status(200).send({
      summary,
      records:normalizationResult.records,
      rejected:normalizationResult.rejected,
      candidates,
      results
    });
  });
  app.post("/investigate",async(request,reply)=>{
    const body=request.body;
    if(!body||typeof body!=="object"||Array.isArray(body)){
      return reply.status(400).send({error:{code:"INVALID_REQUEST",message:"Request body must be an object"}});
    }
    const bodyObj=body as Record<string,unknown>;
    if(!bodyObj.record||typeof bodyObj.record!=="object"||Array.isArray(bodyObj.record)){
      return reply.status(400).send({error:{code:"INVALID_REQUEST",message:"Field 'record' must be an object"}});
    }
    if(!bodyObj.result||typeof bodyObj.result!=="object"||Array.isArray(bodyObj.result)){
      return reply.status(400).send({error:{code:"INVALID_REQUEST",message:"Field 'result' must be an object"}});
    }
    if(!("candidates" in bodyObj)||!Array.isArray(bodyObj.candidates)){
      return reply.status(400).send({error:{code:"INVALID_REQUEST",message:"Field 'candidates' must be an array"}});
    }
    const report=await generateInvestigationReport({
      record:bodyObj.record as FinancialRecord,
      result:bodyObj.result as ReconciliationResult,
      candidates:bodyObj.candidates as CandidateMatch[]
    });
    return reply.status(200).send(report);
  });
  app.post("/investigate/summary",async(request,reply)=>{
    const body=request.body;
    if(!body||typeof body!=="object"||Array.isArray(body)){
      return reply.status(400).send({error:{code:"INVALID_REQUEST",message:"Request body must be an object"}});
    }
    const bodyObj=body as Record<string,unknown>;
    if(!bodyObj.summary||typeof bodyObj.summary!=="object"||Array.isArray(bodyObj.summary)){
      return reply.status(400).send({error:{code:"INVALID_REQUEST",message:"Field 'summary' must be an object"}});
    }
    const report=await generateExecutiveSummary(bodyObj.summary as ReconciliationSummary);
    return reply.status(200).send(report);
  });
  app.post("/investigate/ask",async(request,reply)=>{
    const body=request.body;
    if(!body||typeof body!=="object"||Array.isArray(body)){
      return reply.status(400).send({error:{code:"INVALID_REQUEST",message:"Request body must be an object"}});
    }
    const bodyObj=body as Record<string,unknown>;
    if(typeof bodyObj.question!=="string"||bodyObj.question.trim().length===0){
      return reply.status(400).send({error:{code:"INVALID_REQUEST",message:"Field 'question' must be a non-empty string"}});
    }
    if(!bodyObj.context||typeof bodyObj.context!=="object"||Array.isArray(bodyObj.context)){
      return reply.status(400).send({error:{code:"INVALID_REQUEST",message:"Field 'context' must be an object"}});
    }
    const contextObj=bodyObj.context as Record<string,unknown>;
    if(!contextObj.record||!contextObj.result||!Array.isArray(contextObj.candidates)){
      return reply.status(400).send({error:{code:"INVALID_REQUEST",message:"Context must contain record, result, and candidates"}});
    }
    const answer=await askInvestigationQuestion(bodyObj.question.trim(),{
      record:contextObj.record as FinancialRecord,
      result:contextObj.result as ReconciliationResult,
      candidates:contextObj.candidates as CandidateMatch[]
    });
    return reply.status(200).send(answer);
  });
  return app;
}
