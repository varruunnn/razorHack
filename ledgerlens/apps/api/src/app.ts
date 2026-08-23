import Fastify,{FastifyInstance,FastifyError} from "fastify";
import {normalizeRecords,RawRecord} from "@ledgerlens/ingestion";
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
  return app;
}
