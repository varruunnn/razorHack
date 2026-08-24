"use client";
import React,{useState} from "react";
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Ban,
  Layers,
  ArrowRight,
  Clock,
  Coins,
  FileText,
  RefreshCw,
  Play,
  Search,
  Check,
  ChevronRight,
  TrendingUp,
  AlertCircle,
  Sparkles,
  Database
} from "lucide-react";
import {generateDataset} from "@ledgerlens/synthetic-data";
import {
  FinancialRecord,
  CandidateMatch,
  ReconciliationResult,
  ReconciliationSummary,
  Order,
  Payment,
  Settlement,
  BankEntry,
  Refund,
  Adjustment
} from "@ledgerlens/shared";
const API_BASE_URL=process.env.NEXT_PUBLIC_API_URL||"http://localhost:3001";
interface RawRecordPayload{
  id:string;
  type:string;
  amount:number;
  amount_unit:string;
  currency:string;
  timestamp:string;
  reference?:string;
  merchantId?:string;
  paymentMethod?:string;
  fees?:number;
  bankReference?:string;
  reason?:string;
}
interface ReconcileApiResponse{
  summary:ReconciliationSummary;
  records:FinancialRecord[];
  rejected:Array<{index:number;reason:string;rawRecord:Record<string,unknown>}>;
  candidates:CandidateMatch[];
  results:ReconciliationResult[];
}
function formatMoney(amountMinor:number,currency:string="USD"):string{
  const major=(amountMinor/100).toFixed(2);
  return `${currency} $${Number(major).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
}
export default function DashboardPage(){
  const [loadedRawRecords,setLoadedRawRecords]=useState<RawRecordPayload[]>([]);
  const [reconcileResponse,setReconcileResponse]=useState<ReconcileApiResponse|null>(null);
  const [selectedSourceId,setSelectedSourceId]=useState<string>("");
  const [filterStatus,setFilterStatus]=useState<string>("ALL");
  const [searchQuery,setSearchQuery]=useState<string>("");
  const [isReconciling,setIsReconciling]=useState<boolean>(false);
  const [notification,setNotification]=useState<{type:"success"|"error"|"info";message:string}|null>(null);
  const handleLoadDemoData=()=>{
    try{
      const {dataset}=generateDataset({flowCount:25,seed:Date.now()});
      const raw:RawRecordPayload[]=dataset.records.map(r=>({
        id:r.id,
        type:r.type,
        amount:r.amount,
        amount_unit:"MINOR",
        currency:r.currency,
        timestamp:r.timestamp instanceof Date?r.timestamp.toISOString():String(r.timestamp),
        reference:r.reference,
        ...(r.type==="ORDER"?{merchantId:(r as Order).merchantId}:{}),
        ...(r.type==="PAYMENT"?{paymentMethod:(r as Payment).paymentMethod}:{}),
        ...(r.type==="SETTLEMENT"?{fees:(r as Settlement).fees}:{}),
        ...(r.type==="BANK_ENTRY"?{bankReference:(r as BankEntry).bankReference}:{}),
        ...(r.type==="REFUND"?{reason:(r as Refund).reason}:{}),
        ...(r.type==="ADJUSTMENT"?{reason:(r as Adjustment).reason}:{})
      }));
      setLoadedRawRecords(raw);
      setReconcileResponse(null);
      setSelectedSourceId("");
      setNotification({
        type:"info",
        message:`Loaded ${raw.length} financial records. Click "Run Reconciliation" to process through the API.`
      });
    }catch(err){
      setNotification({
        type:"error",
        message:"Failed to generate synthetic demo records."
      });
    }
  };
  const handleRunReconciliation=async()=>{
    if(loadedRawRecords.length===0){
      setNotification({
        type:"error",
        message:"Please load demo data before running reconciliation."
      });
      return;
    }
    setIsReconciling(true);
    setNotification(null);
    try{
      const res=await fetch(`${API_BASE_URL}/reconcile`,{
        method:"POST",
        headers:{
          "Content-Type":"application/json"
        },
        body:JSON.stringify({records:loadedRawRecords})
      });
      if(!res.ok){
        const errData=await res.json().catch(()=>({}));
        throw new Error(errData?.error?.message||`HTTP ${res.status}`);
      }
      const data:ReconcileApiResponse=await res.json();
      setReconcileResponse(data);
      if(data.results.length>0){
        setSelectedSourceId(data.results[0].sourceRecordId);
      }
      setNotification({
        type:"success",
        message:`Reconciliation complete: ${data.summary.resolved} resolved, ${data.summary.ambiguous} ambiguous, ${data.summary.unmatched} unmatched (${data.summary.candidateCount} candidate pairs evaluated).`
      });
    }catch(err){
      setNotification({
        type:"error",
        message:`Unable to connect to the LedgerLens API at ${API_BASE_URL}. Make sure the Fastify API is running.`
      });
    }finally{
      setIsReconciling(false);
    }
  };
  const summary=reconcileResponse?.summary||{
    totalInputRecords:loadedRawRecords.length,
    acceptedRecords:0,
    rejectedRecords:0,
    resolved:0,
    ambiguous:0,
    unmatched:0,
    candidateCount:0
  };
  const results=reconcileResponse?.results||[];
  const recordsMap=new Map<string,FinancialRecord>();
  if(reconcileResponse?.records){
    for(let i=0;i<reconcileResponse.records.length;i++){
      recordsMap.set(reconcileResponse.records[i].id,reconcileResponse.records[i]);
    }
  }
  const filteredResults=results.filter(r=>{
    const matchesStatus=filterStatus==="ALL"||r.status===filterStatus;
    const sourceRec=recordsMap.get(r.sourceRecordId);
    const matchesSearch=searchQuery===""||
      r.sourceRecordId.toLowerCase().includes(searchQuery.toLowerCase())||
      r.sourceType.toLowerCase().includes(searchQuery.toLowerCase())||
      r.matchedRecordIds.some(m=>m.toLowerCase().includes(searchQuery.toLowerCase()))||
      (sourceRec?.reference&&sourceRec.reference.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesStatus&&matchesSearch;
  });
  const selectedResult=results.find(r=>r.sourceRecordId===selectedSourceId)||(filteredResults.length>0?filteredResults[0]:null);
  const selectedSourceRecord=selectedResult?recordsMap.get(selectedResult.sourceRecordId):null;
  const candidatesForSelected=selectedResult
    ?(reconcileResponse?.candidates||[]).filter(c=>c.sourceRecordId===selectedResult.sourceRecordId)
    :[];
  return(
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-40 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-indigo-600 flex items-center justify-center shadow-md shadow-indigo-600/30">
            <ShieldCheck className="h-5 w-5 text-white"/>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg text-white tracking-tight">LedgerLens</span>
              <span className="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-indigo-950/80 text-indigo-400 border border-indigo-800/50">Core Engine</span>
            </div>
            <p className="text-xs text-slate-400">Financial Reconciliation Platform</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-950/60 border border-emerald-800/60 text-emerald-400 text-xs font-medium">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"/>
            <span>API Ready</span>
          </div>
        </div>
      </header>
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/40 p-6 rounded-2xl border border-slate-800/80">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-white tracking-tight">Reconciliation Overview</h1>
            <p className="text-sm text-slate-400 max-w-2xl">
              LedgerLens identifies and investigates financial mismatches across orders, payments, settlements and bank entries using deterministic multi-evidence pairing.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={handleLoadDemoData}
              disabled={isReconciling}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium border border-slate-700 transition active:scale-95 shadow-sm disabled:opacity-50"
            >
              <RefreshCw className="h-4 w-4 text-slate-400"/>
              <span>Load Demo Data</span>
            </button>
            <button
              onClick={handleRunReconciliation}
              disabled={isReconciling||loadedRawRecords.length===0}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold shadow-lg shadow-indigo-600/25 transition active:scale-95 disabled:opacity-50"
            >
              <Play className={`h-4 w-4 ${isReconciling?"animate-spin":""}`}/>
              <span>{isReconciling?"Processing...":"Run Reconciliation"}</span>
            </button>
          </div>
        </div>
        {notification&&(
          <div className={`p-4 rounded-xl border flex items-center gap-3 text-xs ${
            notification.type==="success"
              ? "bg-emerald-950/40 border-emerald-800/60 text-emerald-300"
              : notification.type==="error"
              ? "bg-rose-950/40 border-rose-800/60 text-rose-300"
              : "bg-indigo-950/40 border-indigo-800/60 text-indigo-300"
          }`}>
            {notification.type==="success"&&<CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0"/>}
            {notification.type==="error"&&<AlertCircle className="h-4 w-4 text-rose-400 shrink-0"/>}
            {notification.type==="info"&&<Sparkles className="h-4 w-4 text-indigo-400 shrink-0"/>}
            <span className="flex-1 font-medium leading-relaxed">{notification.message}</span>
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-medium">Total Records</span>
              <Layers className="h-4 w-4 text-slate-400"/>
            </div>
            <div className="text-2xl font-bold text-white tracking-tight">{summary.totalInputRecords.toLocaleString()}</div>
            <div className="text-[11px] text-slate-500 flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-emerald-400"/>
              <span className="text-slate-400">{summary.acceptedRecords>0?`${summary.acceptedRecords} Accepted`:"Awaiting Input"}</span>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-slate-900/60 border border-emerald-950/40 space-y-2 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/5 rounded-full blur-xl"/>
            <div className="flex items-center justify-between text-emerald-400">
              <span className="text-xs font-medium">Resolved</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-400"/>
            </div>
            <div className="text-2xl font-bold text-emerald-300 tracking-tight">{summary.resolved.toLocaleString()}</div>
            <div className="text-[11px] text-emerald-400/80 font-medium">
              {results.length>0?`${((summary.resolved/results.length)*100).toFixed(1)}% match rate`:"0.0% match rate"}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-slate-900/60 border border-amber-950/40 space-y-2 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-amber-500/5 rounded-full blur-xl"/>
            <div className="flex items-center justify-between text-amber-400">
              <span className="text-xs font-medium">Ambiguous</span>
              <AlertTriangle className="h-4 w-4 text-amber-400"/>
            </div>
            <div className="text-2xl font-bold text-amber-300 tracking-tight">{summary.ambiguous.toLocaleString()}</div>
            <div className="text-[11px] text-amber-400/80 font-medium">
              {results.length>0?`${((summary.ambiguous/results.length)*100).toFixed(1)}% candidate ties`:"0.0% candidate ties"}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-slate-900/60 border border-rose-950/40 space-y-2 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-rose-500/5 rounded-full blur-xl"/>
            <div className="flex items-center justify-between text-rose-400">
              <span className="text-xs font-medium">Unmatched</span>
              <XCircle className="h-4 w-4 text-rose-400"/>
            </div>
            <div className="text-2xl font-bold text-rose-300 tracking-tight">{summary.unmatched.toLocaleString()}</div>
            <div className="text-[11px] text-rose-400/80 font-medium">
              {results.length>0?`${((summary.unmatched/results.length)*100).toFixed(1)}% missing links`:"0.0% missing links"}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2 col-span-2 md:col-span-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-medium">Rejected</span>
              <Ban className="h-4 w-4 text-slate-400"/>
            </div>
            <div className="text-2xl font-bold text-slate-300 tracking-tight">{summary.rejectedRecords.toLocaleString()}</div>
            <div className="text-[11px] text-slate-500 font-medium">Malformed raw inputs</div>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
              <div className="relative flex-1">
                <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"/>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e=>setSearchQuery(e.target.value)}
                  placeholder="Search by record ID, reference, or type..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-950 rounded-lg border border-slate-800 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto">
                {["ALL","RESOLVED","AMBIGUOUS","UNMATCHED"].map(status=>(
                  <button
                    key={status}
                    onClick={()=>setFilterStatus(status)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                      filterStatus===status
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 uppercase tracking-wider font-semibold">
                    <tr>
                      <th className="px-4 py-3">Source ID</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Match / Candidates</th>
                      <th className="px-4 py-3 text-right">Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredResults.length===0?(
                      <tr>
                        <td colSpan={5} className="text-center py-12 text-slate-500 text-xs">
                          {reconcileResponse
                            ? "No reconciliation records match current filter criteria."
                            : loadedRawRecords.length>0
                            ? `Loaded ${loadedRawRecords.length} records. Click "Run Reconciliation" to view results.`
                            : "Click 'Load Demo Data' to generate financial flows and start reconciliation."}
                        </td>
                      </tr>
                    ):(
                      filteredResults.map(item=>{
                        const isSelected=item.sourceRecordId===selectedSourceId;
                        return(
                          <tr
                            key={item.sourceRecordId}
                            onClick={()=>setSelectedSourceId(item.sourceRecordId)}
                            className={`cursor-pointer transition ${
                              isSelected
                                ? "bg-indigo-950/40 border-l-2 border-indigo-500"
                                : "hover:bg-slate-800/40"
                            }`}
                          >
                            <td className="px-4 py-3 font-mono font-medium text-slate-200">
                              {item.sourceRecordId}
                            </td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                                {item.sourceType}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {item.status==="RESOLVED"&&(
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-950/60 text-emerald-300 border border-emerald-800/60">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"/>
                                  RESOLVED
                                </span>
                              )}
                              {item.status==="AMBIGUOUS"&&(
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-950/60 text-amber-300 border border-amber-800/60">
                                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400"/>
                                  AMBIGUOUS
                                </span>
                              )}
                              {item.status==="UNMATCHED"&&(
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-950/60 text-rose-300 border border-rose-800/60">
                                  <span className="h-1.5 w-1.5 rounded-full bg-rose-400"/>
                                  UNMATCHED
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 font-mono text-slate-300">
                              {item.status==="RESOLVED"&&item.matchedRecordIds[0]}
                              {item.status==="AMBIGUOUS"&&`${item.candidateRecordIds.length} candidates`}
                              {item.status==="UNMATCHED"&&<span className="text-slate-600">—</span>}
                            </td>
                            <td className="px-4 py-3 text-right font-mono font-semibold">
                              <span className={item.evidenceScore>0?"text-indigo-300":"text-slate-600"}>
                                {item.evidenceScore}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="lg:col-span-5 space-y-4">
            {selectedResult?(
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 space-y-5 shadow-sm sticky top-20">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 uppercase font-semibold">Source Record</span>
                      <span className="font-mono text-sm font-bold text-white">{selectedResult.sourceRecordId}</span>
                    </div>
                    {selectedSourceRecord&&(
                      <p className="text-xs text-slate-400">
                        {formatMoney(selectedSourceRecord.amount,selectedSourceRecord.currency)}
                      </p>
                    )}
                  </div>
                  <div>
                    {selectedResult.status==="RESOLVED"&&(
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400"/>
                        RESOLVED
                      </span>
                    )}
                    {selectedResult.status==="AMBIGUOUS"&&(
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-950 text-amber-300 border border-amber-800">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-400"/>
                        AMBIGUOUS
                      </span>
                    )}
                    {selectedResult.status==="UNMATCHED"&&(
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-950 text-rose-300 border border-rose-800">
                        <XCircle className="h-3.5 w-3.5 text-rose-400"/>
                        UNMATCHED
                      </span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs bg-slate-950/60 p-3.5 rounded-lg border border-slate-800/80">
                  <div>
                    <span className="text-slate-500 block">Record Type</span>
                    <span className="font-semibold text-slate-200">{selectedResult.sourceType}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Reference</span>
                    <span className="font-mono text-slate-200">{selectedSourceRecord?.reference||"None"}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Timestamp</span>
                    <span className="font-mono text-slate-300">
                      {selectedSourceRecord?new Date(selectedSourceRecord.timestamp).toLocaleDateString():"N/A"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Evidence Score</span>
                    <span className="font-mono font-bold text-indigo-400">{selectedResult.evidenceScore} pts</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                    <span>Investigation & Candidate Details</span>
                    <span className="text-[11px] text-slate-500">
                      {selectedResult.candidateRecordIds.length} candidate{selectedResult.candidateRecordIds.length!==1?"s":""}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 bg-slate-950/40 p-3 rounded-lg border border-slate-800/60 leading-relaxed">
                    {selectedResult.status==="RESOLVED"
                      ? `Uniquely matched to target record ${selectedResult.matchedRecordIds[0]} with highest evidence score (${selectedResult.evidenceScore} pts).`
                      : selectedResult.status==="AMBIGUOUS"
                      ? `Multiple candidates share the identical highest evidence score (${selectedResult.evidenceScore} pts). Competing records: ${selectedResult.candidateRecordIds.join(", ")}.`
                      : "No compatible candidate meeting directional type, currency, amount, and 7-day temporal constraints was detected."}
                  </p>
                </div>
                {candidatesForSelected.length>0&&(
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-slate-300 block">Candidate Matches</span>
                    <div className="space-y-2">
                      {candidatesForSelected.map(cand=>{
                        const targetRec=recordsMap.get(cand.targetRecordId);
                        return(
                          <div key={cand.targetRecordId} className="bg-slate-950/70 p-3 rounded-lg border border-slate-800 flex items-center justify-between text-xs">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-medium text-slate-200">{cand.targetRecordId}</span>
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">{cand.targetType}</span>
                              </div>
                              <div className="text-[11px] text-slate-500 font-mono">
                                Ref: {targetRec?.reference||"N/A"} {targetRec?`• ${formatMoney(targetRec.amount,targetRec.currency)}`:""}
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="font-mono text-[11px] text-slate-400 block">{cand.reasons.length} reasons</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-slate-300 block">Matching Evidence Criteria</span>
                  <div className="space-y-1.5 text-xs">
                    <div className={`flex items-center justify-between p-2 rounded-lg border ${
                      selectedResult.reasons.includes("EXACT_REFERENCE")
                        ? "bg-emerald-950/20 border-emerald-800/40 text-emerald-300"
                        : "bg-slate-950/40 border-slate-800/50 text-slate-600"
                    }`}>
                      <div className="flex items-center gap-2">
                        <Check className="h-3.5 w-3.5"/>
                        <span>Exact Reference Match</span>
                      </div>
                      <span className="font-mono font-semibold">+100</span>
                    </div>
                    <div className={`flex items-center justify-between p-2 rounded-lg border ${
                      selectedResult.reasons.includes("AMOUNT_COMPATIBLE")
                        ? "bg-emerald-950/20 border-emerald-800/40 text-emerald-300"
                        : "bg-slate-950/40 border-slate-800/50 text-slate-600"
                    }`}>
                      <div className="flex items-center gap-2">
                        <Check className="h-3.5 w-3.5"/>
                        <span>Amount Compatible</span>
                      </div>
                      <span className="font-mono font-semibold">+20</span>
                    </div>
                    <div className={`flex items-center justify-between p-2 rounded-lg border ${
                      selectedResult.reasons.includes("CURRENCY_COMPATIBLE")
                        ? "bg-emerald-950/20 border-emerald-800/40 text-emerald-300"
                        : "bg-slate-950/40 border-slate-800/50 text-slate-600"
                    }`}>
                      <div className="flex items-center gap-2">
                        <Check className="h-3.5 w-3.5"/>
                        <span>Currency Compatible</span>
                      </div>
                      <span className="font-mono font-semibold">+10</span>
                    </div>
                    <div className={`flex items-center justify-between p-2 rounded-lg border ${
                      selectedResult.reasons.includes("TIME_WINDOW_COMPATIBLE")
                        ? "bg-emerald-950/20 border-emerald-800/40 text-emerald-300"
                        : "bg-slate-950/40 border-slate-800/50 text-slate-600"
                    }`}>
                      <div className="flex items-center gap-2">
                        <Check className="h-3.5 w-3.5"/>
                        <span>Within 7-Day Window</span>
                      </div>
                      <span className="font-mono font-semibold">+10</span>
                    </div>
                  </div>
                </div>
              </div>
            ):(
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-8 text-center text-slate-500 text-xs">
                {reconcileResponse
                  ? "Select a record from the table to view its investigation details."
                  : "Load demo data and run reconciliation to view detailed investigation records."}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
