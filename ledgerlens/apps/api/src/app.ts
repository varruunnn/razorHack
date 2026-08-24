import Fastify,{FastifyInstance,FastifyError} from "fastify";
import {normalizeRecords,RawRecord} from "@ledgerlens/ingestion";
import {discoverCandidates,resolveCandidates} from "@ledgerlens/reconciliation-engine";
import {ReconciliationSummary} from "@ledgerlens/shared";
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
  return app;
}
