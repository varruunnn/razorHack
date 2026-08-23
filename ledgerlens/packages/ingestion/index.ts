import {FinancialRecord,Order,Payment,Refund,Adjustment,Settlement,BankEntry,RecordType,Currency} from "@ledgerlens/shared";
export type RawRecord=Record<string,unknown>;
export type RejectionReason="MISSING_ID"|"INVALID_ID"|"DUPLICATE_ID"|"MISSING_TYPE"|"INVALID_TYPE"|"MISSING_AMOUNT"|"INVALID_AMOUNT"|"NEGATIVE_AMOUNT"|"INVALID_AMOUNT_UNIT"|"MISSING_CURRENCY"|"INVALID_CURRENCY"|"MISSING_TIMESTAMP"|"INVALID_TIMESTAMP"|"INVALID_FEE"|"NEGATIVE_FEE";
export interface RejectedRecord{
  index:number;
  reason:RejectionReason;
  rawRecord:RawRecord;
}
export interface NormalizationResult{
  records:FinancialRecord[];
  rejected:RejectedRecord[];
}
function parseMoney(rawVal:unknown,rawUnit:unknown,allowNegative:boolean):{success:true;amount:number}|{success:false;reason:RejectionReason}{
  let unitMode="MAJOR";
  if(rawUnit!==undefined&&rawUnit!==null){
    if(typeof rawUnit!=="string")return{success:false,reason:"INVALID_AMOUNT_UNIT"};
    const u=rawUnit.trim().toUpperCase();
    if(u!=="MAJOR"&&u!=="MINOR")return{success:false,reason:"INVALID_AMOUNT_UNIT"};
    unitMode=u;
  }
  if(rawVal===undefined||rawVal===null)return{success:false,reason:"MISSING_AMOUNT"};
  let s="";
  if(typeof rawVal==="number"){
    if(!Number.isFinite(rawVal))return{success:false,reason:"INVALID_AMOUNT"};
    s=String(rawVal);
  }else if(typeof rawVal==="string"){
    s=rawVal.trim();
    if(s.length===0)return{success:false,reason:"INVALID_AMOUNT"};
    s=s.replace(/^[^\d\-+.]+/, "").replace(/[^\d.]+$/, "").trim();
  }else{
    return{success:false,reason:"INVALID_AMOUNT"};
  }
  const match=s.match(/^([+-])?(\d+)(?:\.(\d+))?$/);
  if(!match)return{success:false,reason:"INVALID_AMOUNT"};
  const sign=match[1]==="-"?-1:1;
  const whole=match[2];
  const dec=match[3];
  if(unitMode==="MINOR"){
    if(dec!==undefined)return{success:false,reason:"INVALID_AMOUNT"};
    const minorInt=parseInt(whole,10)*sign;
    if(!allowNegative&&minorInt<0)return{success:false,reason:"NEGATIVE_AMOUNT"};
    return{success:true,amount:minorInt};
  }
  if(dec!==undefined&&dec.length>2)return{success:false,reason:"INVALID_AMOUNT"};
  let paddedDec=dec||"";
  if(paddedDec.length===0)paddedDec="00";
  else if(paddedDec.length===1)paddedDec=paddedDec+"0";
  const minorInt=parseInt(whole+paddedDec,10)*sign;
  if(!allowNegative&&minorInt<0)return{success:false,reason:"NEGATIVE_AMOUNT"};
  return{success:true,amount:minorInt};
}
function parseTimestamp(rawVal:unknown):{success:true;date:Date}|{success:false;reason:RejectionReason}{
  if(rawVal===undefined||rawVal===null)return{success:false,reason:"MISSING_TIMESTAMP"};
  if(rawVal instanceof Date){
    if(isNaN(rawVal.getTime()))return{success:false,reason:"INVALID_TIMESTAMP"};
    return{success:true,date:rawVal};
  }
  if(typeof rawVal==="number"){
    if(!Number.isFinite(rawVal)||rawVal<0)return{success:false,reason:"INVALID_TIMESTAMP"};
    const ms=rawVal<100000000000?rawVal*1000:rawVal;
    const d=new Date(ms);
    if(isNaN(d.getTime()))return{success:false,reason:"INVALID_TIMESTAMP"};
    return{success:true,date:d};
  }
  if(typeof rawVal==="string"){
    const s=rawVal.trim();
    if(s.length===0)return{success:false,reason:"INVALID_TIMESTAMP"};
    if(/^\d+$/.test(s)){
      const num=Number(s);
      if(!Number.isFinite(num)||num<0)return{success:false,reason:"INVALID_TIMESTAMP"};
      const ms=num<100000000000?num*1000:num;
      const d=new Date(ms);
      if(isNaN(d.getTime()))return{success:false,reason:"INVALID_TIMESTAMP"};
      return{success:true,date:d};
    }
    const d=new Date(s);
    if(isNaN(d.getTime()))return{success:false,reason:"INVALID_TIMESTAMP"};
    return{success:true,date:d};
  }
  return{success:false,reason:"INVALID_TIMESTAMP"};
}
function normalizeType(rawVal:unknown):{success:true;type:RecordType}|{success:false;reason:RejectionReason}{
  if(rawVal===undefined||rawVal===null)return{success:false,reason:"MISSING_TYPE"};
  if(typeof rawVal!=="string")return{success:false,reason:"INVALID_TYPE"};
  const t=rawVal.trim().toUpperCase().replace(/[-\s]/g,"_");
  if(t==="ORDER"||t==="PAYMENT"||t==="SETTLEMENT"||t==="BANK_ENTRY"||t==="REFUND"||t==="ADJUSTMENT"){
    return{success:true,type:t};
  }
  if(t==="BANKENTRY")return{success:true,type:"BANK_ENTRY"};
  return{success:false,reason:"INVALID_TYPE"};
}
function normalizeCurrency(rawVal:unknown):{success:true;currency:Currency}|{success:false;reason:RejectionReason}{
  if(rawVal===undefined||rawVal===null)return{success:false,reason:"MISSING_CURRENCY"};
  if(typeof rawVal!=="string")return{success:false,reason:"INVALID_CURRENCY"};
  const c=rawVal.trim().toUpperCase();
  if(!/^[A-Z]{3}$/.test(c))return{success:false,reason:"INVALID_CURRENCY"};
  return{success:true,currency:c};
}
function extractIdAndReference(raw:RawRecord):{success:true;id:string;reference?:string}|{success:false;reason:RejectionReason}{
  let id:string|undefined=undefined;
  let idConsumed:"id"|"transaction_id"|undefined=undefined;
  if(raw.id!==undefined&&raw.id!==null){
    if(typeof raw.id!=="string"&&typeof raw.id!=="number")return{success:false,reason:"INVALID_ID"};
    const s=String(raw.id).trim();
    if(s.length===0)return{success:false,reason:"INVALID_ID"};
    id=s;
    idConsumed="id";
  }else if(raw.transaction_id!==undefined&&raw.transaction_id!==null){
    if(typeof raw.transaction_id!=="string"&&typeof raw.transaction_id!=="number")return{success:false,reason:"INVALID_ID"};
    const s=String(raw.transaction_id).trim();
    if(s.length===0)return{success:false,reason:"INVALID_ID"};
    id=s;
    idConsumed="transaction_id";
  }else{
    return{success:false,reason:"MISSING_ID"};
  }
  let reference:string|undefined=undefined;
  const rawExplicitRef=raw.reference??raw.txn_ref??raw.ref;
  if(rawExplicitRef!==undefined&&rawExplicitRef!==null){
    const s=String(rawExplicitRef).trim();
    if(s.length>0)reference=s;
  }else if(idConsumed==="id"&&raw.transaction_id!==undefined&&raw.transaction_id!==null){
    const s=String(raw.transaction_id).trim();
    if(s.length>0)reference=s;
  }
  return{success:true,id,reference};
}
export function normalizeRecords(rawRecords:RawRecord[]):NormalizationResult{
  const records:FinancialRecord[]=[];
  const rejected:RejectedRecord[]=[];
  const seenIds=new Set<string>();
  for(let i=0;i<rawRecords.length;i++){
    const raw=rawRecords[i];
    const idRefRes=extractIdAndReference(raw);
    if(!idRefRes.success){
      rejected.push({index:i,reason:idRefRes.reason,rawRecord:raw});
      continue;
    }
    const id=idRefRes.id;
    const reference=idRefRes.reference;
    if(seenIds.has(id)){
      rejected.push({index:i,reason:"DUPLICATE_ID",rawRecord:raw});
      continue;
    }
    const typeRes=normalizeType(raw.type);
    if(!typeRes.success){
      rejected.push({index:i,reason:typeRes.reason,rawRecord:raw});
      continue;
    }
    const type=typeRes.type;
    const currRes=normalizeCurrency(raw.currency??raw.transaction_currency);
    if(!currRes.success){
      rejected.push({index:i,reason:currRes.reason,rawRecord:raw});
      continue;
    }
    const currency=currRes.currency;
    const timeRes=parseTimestamp(raw.timestamp??raw.created_at??raw.createdAt);
    if(!timeRes.success){
      rejected.push({index:i,reason:timeRes.reason,rawRecord:raw});
      continue;
    }
    const timestamp=timeRes.date;
    const allowNegative=type==="ADJUSTMENT";
    const amtRes=parseMoney(raw.amount??raw.transaction_amount,raw.amount_unit,allowNegative);
    if(!amtRes.success){
      rejected.push({index:i,reason:amtRes.reason,rawRecord:raw});
      continue;
    }
    const amount=amtRes.amount;
    if(type==="ORDER"){
      const order:Order={id,type:"ORDER",amount,currency,timestamp,reference,merchantId:String(raw.merchantId??raw.merchant_id??"UNKNOWN")};
      seenIds.add(id);
      records.push(order);
    }else if(type==="PAYMENT"){
      const payment:Payment={id,type:"PAYMENT",amount,currency,timestamp,reference,paymentMethod:String(raw.paymentMethod??raw.payment_method??"card")};
      seenIds.add(id);
      records.push(payment);
    }else if(type==="SETTLEMENT"){
      let fees=0;
      const rawFees=raw.fees??raw.fee;
      if(rawFees!==undefined&&rawFees!==null){
        const feeRes=parseMoney(rawFees,raw.amount_unit,false);
        if(!feeRes.success){
          const reason:RejectionReason=feeRes.reason==="NEGATIVE_AMOUNT"?"NEGATIVE_FEE":"INVALID_FEE";
          rejected.push({index:i,reason,rawRecord:raw});
          continue;
        }
        fees=feeRes.amount;
      }
      const settlement:Settlement={id,type:"SETTLEMENT",amount,currency,timestamp,reference,fees};
      seenIds.add(id);
      records.push(settlement);
    }else if(type==="BANK_ENTRY"){
      const bankEntry:BankEntry={id,type:"BANK_ENTRY",amount,currency,timestamp,reference,bankReference:String(raw.bankReference??raw.bank_reference??raw.bank_ref??reference??id)};
      seenIds.add(id);
      records.push(bankEntry);
    }else if(type==="REFUND"){
      const refund:Refund={id,type:"REFUND",amount,currency,timestamp,reference,reason:raw.reason?String(raw.reason):undefined};
      seenIds.add(id);
      records.push(refund);
    }else if(type==="ADJUSTMENT"){
      const adjustment:Adjustment={id,type:"ADJUSTMENT",amount,currency,timestamp,reference,reason:String(raw.reason??"ADJUSTMENT")};
      seenIds.add(id);
      records.push(adjustment);
    }
  }
  return{records,rejected};
}
