export type Currency=string;
export type RecordType="ORDER"|"PAYMENT"|"REFUND"|"ADJUSTMENT"|"SETTLEMENT"|"BANK_ENTRY";
export interface BaseRecord{
  id:string;
  type:RecordType;
  amount:number;
  currency:Currency;
  timestamp:Date;
  reference?:string;
}
export interface Order extends BaseRecord{
  type:"ORDER";
  merchantId:string;
}
export interface Payment extends BaseRecord{
  type:"PAYMENT";
  paymentMethod:string;
}
export interface Refund extends BaseRecord{
  type:"REFUND";
  reason?:string;
}
export interface Adjustment extends BaseRecord{
  type:"ADJUSTMENT";
  reason:string;
}
export interface Settlement extends BaseRecord{
  type:"SETTLEMENT";
  fees:number;
}
export interface BankEntry extends BaseRecord{
  type:"BANK_ENTRY";
  bankReference:string;
}
export type FinancialRecord=Order|Payment|Refund|Adjustment|Settlement|BankEntry;
export type ScenarioType="CLEAN"|"PARTIAL_REFUND"|"DELAYED_SETTLEMENT"|"MISSING_BANK_ENTRY"|"SPLIT_SETTLEMENT"|"DUPLICATE_REFERENCE"|"ADJUSTMENT"|"UNRESOLVED";
export type ResolutionStatus="RESOLVED"|"UNRESOLVED";
export type RelationshipType="ORDER_TO_PAYMENT"|"PAYMENT_TO_SETTLEMENT"|"SETTLEMENT_TO_BANK_ENTRY"|"PAYMENT_TO_REFUND"|"PAYMENT_TO_ADJUSTMENT"|"AMBIGUOUS";
export interface RecordRelationship{
  sourceRecordIds:string[];
  targetRecordIds:string[];
  type:RelationshipType;
}
export type UnresolvedReason="MISSING_BANK_ENTRY"|"AMBIGUOUS_SETTLEMENT_PAYMENT_MATCH"|"CONFLICTING_EVIDENCE";
export interface GroundTruthRelation{
  flowId:string;
  scenario:ScenarioType;
  recordIds:string[];
  relationships:RecordRelationship[];
  expectedResolutionStatus:ResolutionStatus;
  unresolvedReason?:UnresolvedReason;
}
export interface Dataset{
  records:FinancialRecord[];
}
export interface GroundTruth{
  relations:GroundTruthRelation[];
}
export interface GeneratedData{
  dataset:Dataset;
  groundTruth:GroundTruth;
}
export interface GenerateOptions{
  flowCount:number;
  seed:number;
}
export type CandidateReason="EXACT_REFERENCE"|"AMOUNT_COMPATIBLE"|"TIME_WINDOW_COMPATIBLE"|"CURRENCY_COMPATIBLE";
export interface CandidateMatch{
  sourceRecordId:string;
  targetRecordId:string;
  sourceType:FinancialRecord["type"];
  targetType:FinancialRecord["type"];
  reasons:CandidateReason[];
}
export type MatchStatus="RESOLVED"|"AMBIGUOUS"|"UNMATCHED";
export interface ReconciliationResult{
  sourceRecordId:string;
  sourceType:FinancialRecord["type"];
  status:MatchStatus;
  matchedRecordIds:string[];
  candidateRecordIds:string[];
  evidenceScore:number;
  reasons:CandidateReason[];
}
