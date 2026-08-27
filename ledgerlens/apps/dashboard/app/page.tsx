"use client";
import React,{useState,useEffect} from "react";
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
  Database,
  Cpu,
  HelpCircle,
  SlidersHorizontal,
  ExternalLink,
  Target,
  FileSpreadsheet,
  Bot,
  Send,
  MessageSquare,
  Zap,
  ListChecks,
  AlertOctagon,
  ShieldAlert
} from "lucide-react";
import {generateDataset} from "@ledgerlens/synthetic-data";
import {
  FinancialRecord,
  CandidateMatch,
  ReconciliationResult,
  ReconciliationSummary,
  InvestigationReport,
  ExecutiveSummaryReport,
  AskInvestigationResponse,
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
interface RejectedRecordInfo{
  index:number;
  reason:string;
  rawRecord:Record<string,unknown>;
}
interface ReconcileApiResponse{
  summary:ReconciliationSummary;
  records:FinancialRecord[];
  rejected:RejectedRecordInfo[];
  candidates:CandidateMatch[];
  results:ReconciliationResult[];
}
interface ChatMessage{
  id:string;
  question:string;
  answer:string;
  provider:string;
}
function formatMoney(amountMinor:number,currency:string="USD"):string{
  const major=(amountMinor/100).toFixed(2);
  return `${currency} $${Number(major).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
}
export default function DashboardPage(){
  const [loadedRawRecords,setLoadedRawRecords]=useState<RawRecordPayload[]>([]);
  const [reconcileResponse,setReconcileResponse]=useState<ReconcileApiResponse|null>(null);
  const [selectedSourceId,setSelectedSourceId]=useState<string>("");
  const [selectedRejectedIndex,setSelectedRejectedIndex]=useState<number|null>(null);
  const [filterStatus,setFilterStatus]=useState<string>("ALL");
  const [searchQuery,setSearchQuery]=useState<string>("");
  const [isReconciling,setIsReconciling]=useState<boolean>(false);
  const [notification,setNotification]=useState<{type:"success"|"error"|"info";message:string}|null>(null);
  const [aiProviderInfo,setAiProviderInfo]=useState<{provider:string;isAiConfigured:boolean}>({provider:"deterministic-fallback",isAiConfigured:false});
  const [execSummary,setExecSummary]=useState<ExecutiveSummaryReport|null>(null);
  const [isGeneratingExecSummary,setIsGeneratingExecSummary]=useState<boolean>(false);
  const [aiReports,setAiReports]=useState<Record<string,InvestigationReport>>({});
  const [isLoadingAiReport,setIsLoadingAiReport]=useState<boolean>(false);
  const [chatMessages,setChatMessages]=useState<Record<string,ChatMessage[]>>({});
  const [currentQuestion,setCurrentQuestion]=useState<string>("");
  const [isAskingQuestion,setIsAskingQuestion]=useState<boolean>(false);
  useEffect(()=>{
    fetch(`${API_BASE_URL}/investigate/info`)
      .then(r=>r.json())
      .then(d=>{
        if(d&&typeof d.provider==="string"){
          setAiProviderInfo(d);
        }
      })
      .catch(()=>{});
  },[]);
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
      raw.push({
        id:"",
        type:"PAYMENT",
        amount:5000,
        amount_unit:"MINOR",
        currency:"USD",
        timestamp:new Date().toISOString(),
        reference:"RAW-MALFORMED-1"
      });
      raw.push({
        id:"raw_invalid_type",
        type:"INVALID_TYPE",
        amount:12500,
        amount_unit:"MINOR",
        currency:"USD",
        timestamp:new Date().toISOString(),
        reference:"RAW-MALFORMED-2"
      });
      setLoadedRawRecords(raw);
      setReconcileResponse(null);
      setSelectedSourceId("");
      setSelectedRejectedIndex(null);
      setExecSummary(null);
      setAiReports({});
      setChatMessages({});
      setNotification({
        type:"info",
        message:`Loaded ${raw.length} synthetic financial records (${raw.length-2} canonical flows + 2 raw ingestion error test cases). Click "Run Reconciliation" to evaluate candidate matches.`
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
    setExecSummary(null);
    setAiReports({});
    setChatMessages({});
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
        const firstId=data.results[0].sourceRecordId;
        setSelectedSourceId(firstId);
        setSelectedRejectedIndex(null);
        fetchAiReportForRecord(firstId,data);
      }
      fetchExecutiveAiSummary(data.summary);
      setNotification({
        type:"success",
        message:`Reconciliation complete: ${data.summary.resolved} resolved, ${data.summary.ambiguous} ambiguous, ${data.summary.unmatched} unmatched (${data.summary.candidateCount} candidate pairs evaluated deterministically).`
      });
    }catch(err){
      setNotification({
        type:"error",
        message:`Unable to reach the LedgerLens API at ${API_BASE_URL}. Make sure the backend Fastify server is running on port 3001.`
      });
    }finally{
      setIsReconciling(false);
    }
  };
  const fetchExecutiveAiSummary=async(summaryData:ReconciliationSummary)=>{
    setIsGeneratingExecSummary(true);
    try{
      const res=await fetch(`${API_BASE_URL}/investigate/summary`,{
        method:"POST",
        headers:{
          "Content-Type":"application/json"
        },
        body:JSON.stringify({summary:summaryData})
      });
      if(res.ok){
        const report:ExecutiveSummaryReport=await res.json();
        setExecSummary(report);
      }
    }catch(err){
    }finally{
      setIsGeneratingExecSummary(false);
    }
  };
  const fetchAiReportForRecord=async(sourceId:string,dataContext?:ReconcileApiResponse)=>{
    const currentData=dataContext||reconcileResponse;
    if(!currentData)return;
    const result=currentData.results.find(r=>r.sourceRecordId===sourceId);
    const record=currentData.records.find(r=>r.id===sourceId);
    if(!result||!record)return;
    const candidates=currentData.candidates.filter(c=>c.sourceRecordId===sourceId);
    setIsLoadingAiReport(true);
    try{
      const res=await fetch(`${API_BASE_URL}/investigate`,{
        method:"POST",
        headers:{
          "Content-Type":"application/json"
        },
        body:JSON.stringify({
          record,
          result,
          candidates
        })
      });
      if(res.ok){
        const report:InvestigationReport=await res.json();
        setAiReports(prev=>({...prev,[sourceId]:report}));
      }
    }catch(err){
    }finally{
      setIsLoadingAiReport(false);
    }
  };
  const handleAskQuestion=async(customPrompt?:string)=>{
    const questionText=customPrompt||currentQuestion;
    if(!questionText.trim()||!selectedResult||!selectedSourceRecord||!reconcileResponse)return;
    setIsAskingQuestion(true);
    const candidates=reconcileResponse.candidates.filter(c=>c.sourceRecordId===selectedResult.sourceRecordId);
    try{
      const res=await fetch(`${API_BASE_URL}/investigate/ask`,{
        method:"POST",
        headers:{
          "Content-Type":"application/json"
        },
        body:JSON.stringify({
          question:questionText.trim(),
          context:{
            record:selectedSourceRecord,
            result:selectedResult,
            candidates
          }
        })
      });
      if(res.ok){
        const data:AskInvestigationResponse=await res.json();
        const newMsg:ChatMessage={
          id:String(Date.now()),
          question:questionText.trim(),
          answer:data.answer,
          provider:data.provider
        };
        setChatMessages(prev=>({
          ...prev,
          [selectedResult.sourceRecordId]:[...(prev[selectedResult.sourceRecordId]||[]),newMsg]
        }));
        if(!customPrompt)setCurrentQuestion("");
      }
    }catch(err){
    }finally{
      setIsAskingQuestion(false);
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
  const rejectedList=reconcileResponse?.rejected||[];
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
  const filteredRejected=rejectedList.filter(rej=>{
    const matchesSearch=searchQuery===""||
      rej.reason.toLowerCase().includes(searchQuery.toLowerCase())||
      String(rej.rawRecord.id||"").toLowerCase().includes(searchQuery.toLowerCase())||
      String(rej.rawRecord.reference||"").toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });
  const selectedResult=results.find(r=>r.sourceRecordId===selectedSourceId)||(filteredResults.length>0?filteredResults[0]:null);
  const selectedSourceRecord=selectedResult?recordsMap.get(selectedResult.sourceRecordId):null;
  const selectedRejected=selectedRejectedIndex!==null?rejectedList.find(r=>r.index===selectedRejectedIndex):null;
  const candidatesForSelected=selectedResult
    ?(reconcileResponse?.candidates||[]).filter(c=>c.sourceRecordId===selectedResult.sourceRecordId)
    :[];
  const evaluatedCount=results.length;
  const resolvedPct=evaluatedCount>0?((summary.resolved/evaluatedCount)*100).toFixed(1):"0.0";
  const ambiguousPct=evaluatedCount>0?((summary.ambiguous/evaluatedCount)*100).toFixed(1):"0.0";
  const unmatchedPct=evaluatedCount>0?((summary.unmatched/evaluatedCount)*100).toFixed(1):"0.0";
  const currentAiReport=selectedResult?aiReports[selectedResult.sourceRecordId]:null;
  const currentChats=selectedResult?chatMessages[selectedResult.sourceRecordId]||[]:[];
  return(
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <header className="border-b border-slate-800/80 bg-slate-900/70 backdrop-blur sticky top-0 z-40 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/25 border border-indigo-500/30">
            <ShieldCheck className="h-5 w-5 text-white"/>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg text-white tracking-tight">LedgerLens</span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-950/90 text-indigo-300 border border-indigo-700/50">Deterministic Rules Engine</span>
            </div>
            <p className="text-xs text-slate-400">Financial Reconciliation & Exception Investigation Copilot</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-950/40 border border-indigo-800/50 text-indigo-300 text-xs font-medium">
            <Bot className="h-3.5 w-3.5 text-indigo-400"/>
            <span>AI Copilot: {aiProviderInfo.isAiConfigured?aiProviderInfo.provider.toUpperCase():"Deterministic Analysis"}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/60 border border-emerald-800/60 text-emerald-400 text-xs font-medium">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"/>
            <span>API Ready (Port 3001)</span>
          </div>
        </div>
      </header>
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/50 p-6 rounded-2xl border border-slate-800/90 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-full bg-indigo-600/5 blur-3xl pointer-events-none"/>
          <div className="space-y-1.5 z-10">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-white tracking-tight">Reconciliation Overview</h1>
              <span className="text-xs px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 border border-slate-700 font-mono">Fastify Pipeline</span>
            </div>
            <p className="text-sm text-slate-400 max-w-2xl leading-relaxed">
              LedgerLens evaluates financial records using deterministic multi-evidence scoring, paired with an AI investigation copilot for exception analysis and audit summaries.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0 z-10">
            <button
              onClick={handleLoadDemoData}
              disabled={isReconciling}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium border border-slate-700 transition active:scale-95 shadow-sm disabled:opacity-50"
            >
              <RefreshCw className="h-4 w-4 text-slate-400"/>
              <span>Load Demo Data</span>
            </button>
            <button
              onClick={handleRunReconciliation}
              disabled={isReconciling||loadedRawRecords.length===0}
              className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold shadow-lg transition active:scale-95 disabled:opacity-40 ${
                loadedRawRecords.length>0&&!reconcileResponse&&!isReconciling
                  ? "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/30 ring-2 ring-indigo-400/30"
                  : "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/20"
              }`}
            >
              <Play className={`h-4 w-4 ${isReconciling?"animate-spin":""}`}/>
              <span>{isReconciling?"Evaluating Rules...":"Run Reconciliation"}</span>
            </button>
          </div>
        </div>
        {notification&&(
          <div className={`p-4 rounded-xl border flex items-center gap-3 text-xs shadow-sm ${
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
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2 relative">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-medium">Total Records</span>
              <Layers className="h-4 w-4 text-slate-400"/>
            </div>
            <div className="text-2xl font-bold text-white tracking-tight">{summary.totalInputRecords.toLocaleString()}</div>
            <div className="text-[11px] text-slate-400 flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-emerald-400"/>
              <span>{summary.acceptedRecords>0?`${summary.acceptedRecords} Ingested`:"Awaiting Input"}</span>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-slate-900/60 border border-emerald-950/50 space-y-2 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/5 rounded-full blur-xl"/>
            <div className="flex items-center justify-between text-emerald-400">
              <span className="text-xs font-medium">Resolved</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-400"/>
            </div>
            <div className="text-2xl font-bold text-emerald-300 tracking-tight">{summary.resolved.toLocaleString()}</div>
            <div className="text-[11px] text-emerald-400/80 font-medium">
              {evaluatedCount>0?`${resolvedPct}% of flows resolved`:"0.0% match rate"}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-slate-900/60 border border-amber-950/50 space-y-2 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-amber-500/5 rounded-full blur-xl"/>
            <div className="flex items-center justify-between text-amber-400">
              <span className="text-xs font-medium">Ambiguous</span>
              <AlertTriangle className="h-4 w-4 text-amber-400"/>
            </div>
            <div className="text-2xl font-bold text-amber-300 tracking-tight">{summary.ambiguous.toLocaleString()}</div>
            <div className="text-[11px] text-amber-400/80 font-medium">
              {evaluatedCount>0?`${ambiguousPct}% score ties flagged`:"0.0% candidate ties"}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-slate-900/60 border border-rose-950/50 space-y-2 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-rose-500/5 rounded-full blur-xl"/>
            <div className="flex items-center justify-between text-rose-400">
              <span className="text-xs font-medium">Unmatched</span>
              <XCircle className="h-4 w-4 text-rose-400"/>
            </div>
            <div className="text-2xl font-bold text-rose-300 tracking-tight">{summary.unmatched.toLocaleString()}</div>
            <div className="text-[11px] text-rose-400/80 font-medium">
              {evaluatedCount>0?`${unmatchedPct}% no candidate`:"0.0% missing links"}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2 col-span-2 md:col-span-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-medium">Rejected</span>
              <Ban className="h-4 w-4 text-slate-400"/>
            </div>
            <div className="text-2xl font-bold text-slate-300 tracking-tight">{summary.rejectedRecords.toLocaleString()}</div>
            <div className="text-[11px] text-slate-500 font-medium">Failed ingestion checks</div>
          </div>
        </div>
        {reconcileResponse&&(
          <div className="p-5 rounded-2xl bg-gradient-to-r from-indigo-950/40 via-slate-900/70 to-slate-900/40 border border-indigo-800/40 space-y-4 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center">
                  <Sparkles className="h-4 w-4 text-indigo-300"/>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-white">AI Executive Reconciliation Brief</h2>
                    <span className="text-[10px] px-2 py-0.2 rounded-full bg-indigo-900/60 text-indigo-300 border border-indigo-700/50 font-mono">
                      {execSummary?.provider.toUpperCase()||"DETERMINISTIC"}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">Automated exception analysis & audit findings</p>
                </div>
              </div>
              <button
                onClick={()=>fetchExecutiveAiSummary(summary)}
                disabled={isGeneratingExecSummary}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isGeneratingExecSummary?"animate-spin":""}`}/>
                <span>{isGeneratingExecSummary?"Analyzing...":"Regenerate"}</span>
              </button>
            </div>
            {execSummary?(
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs pt-1">
                <div className="space-y-1.5 md:col-span-3 bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
                  <span className="font-semibold text-slate-300 uppercase tracking-wider text-[10px]">Batch Overview</span>
                  <p className="text-slate-300 leading-relaxed">{execSummary.overview}</p>
                </div>
                <div className="space-y-2 bg-slate-950/40 p-3 rounded-xl border border-slate-800/60">
                  <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                    <ListChecks className="h-4 w-4"/>
                    <span>Key Findings</span>
                  </div>
                  <ul className="space-y-1.5 text-slate-300">
                    {execSummary.keyFindings.map((f,i)=>(
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-emerald-500 font-bold">•</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="space-y-2 bg-slate-950/40 p-3 rounded-xl border border-slate-800/60">
                  <div className="flex items-center gap-1.5 text-amber-400 font-semibold">
                    <AlertTriangle className="h-4 w-4"/>
                    <span>Attention Required</span>
                  </div>
                  <ul className="space-y-1.5 text-slate-300">
                    {execSummary.attentionRequired.map((a,i)=>(
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-amber-500 font-bold">•</span>
                        <span>{a}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="space-y-2 bg-slate-950/40 p-3 rounded-xl border border-slate-800/60">
                  <div className="flex items-center gap-1.5 text-indigo-400 font-semibold">
                    <ArrowRight className="h-4 w-4"/>
                    <span>Recommended Next Steps</span>
                  </div>
                  <ul className="space-y-1.5 text-slate-300">
                    {execSummary.recommendedNextSteps.map((s,i)=>(
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-indigo-400 font-bold">→</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ):(
              <div className="py-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                <Sparkles className="h-4 w-4 text-indigo-400 animate-pulse"/>
                <span>{isGeneratingExecSummary?"Generating AI Executive Summary...":"Click Regenerate to analyze batch."}</span>
              </div>
            )}
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
              <div className="relative flex-1">
                <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"/>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e=>setSearchQuery(e.target.value)}
                  placeholder="Search by ID, reference, type, reason..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-950 rounded-lg border border-slate-800 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto">
                {["ALL","RESOLVED","AMBIGUOUS","UNMATCHED","REJECTED"].map(status=>(
                  <button
                    key={status}
                    onClick={()=>{
                      setFilterStatus(status);
                      if(status==="REJECTED"&&rejectedList.length>0){
                        setSelectedRejectedIndex(rejectedList[0].index);
                        setSelectedSourceId("");
                      }else if(status!=="REJECTED"&&results.length>0){
                        setSelectedRejectedIndex(null);
                        setSelectedSourceId(results[0].sourceRecordId);
                      }
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                      filterStatus===status
                        ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/30"
                        : "bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                    }`}
                  >
                    {status}
                    {status==="REJECTED"&&summary.rejectedRecords>0&&` (${summary.rejectedRecords})`}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-sm">
              {filterStatus==="REJECTED"?(
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 uppercase tracking-wider font-semibold">
                      <tr>
                        <th className="px-4 py-3">Batch Index</th>
                        <th className="px-4 py-3">Rejection Reason</th>
                        <th className="px-4 py-3">Raw Reference</th>
                        <th className="px-4 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {filteredRejected.length===0?(
                        <tr>
                          <td colSpan={4} className="text-center py-12 text-slate-500 text-xs">
                            No rejected ingestion records in this batch.
                          </td>
                        </tr>
                      ):(
                        filteredRejected.map(rej=>{
                          const isSelected=selectedRejectedIndex===rej.index;
                          return(
                            <tr
                              key={rej.index}
                              onClick={()=>{
                                setSelectedRejectedIndex(rej.index);
                                setSelectedSourceId("");
                              }}
                              className={`cursor-pointer transition ${
                                isSelected
                                  ? "bg-rose-950/30 border-l-2 border-rose-500"
                                  : "hover:bg-slate-800/40"
                              }`}
                            >
                              <td className="px-4 py-3 font-mono font-medium text-slate-300">
                                #{rej.index}
                              </td>
                              <td className="px-4 py-3">
                                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-950 text-rose-300 border border-rose-800">
                                  {rej.reason}
                                </span>
                              </td>
                              <td className="px-4 py-3 font-mono text-slate-400">
                                {String(rej.rawRecord.reference||rej.rawRecord.id||"None")}
                              </td>
                              <td className="px-4 py-3 text-right text-indigo-400 font-medium">
                                Inspect
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              ):(
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 uppercase tracking-wider font-semibold">
                      <tr>
                        <th className="px-4 py-3">Source ID</th>
                        <th className="px-4 py-3">Type</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Best Match / Candidates</th>
                        <th className="px-4 py-3 text-right">Score</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {filteredResults.length===0?(
                        <tr>
                          <td colSpan={5} className="text-center py-14 px-4 text-slate-400 text-xs space-y-2">
                            {reconcileResponse?(
                              <div>No reconciliation results match the filter "{filterStatus}".</div>
                            ):loadedRawRecords.length>0?(
                              <div className="space-y-1">
                                <p className="font-semibold text-slate-200">{loadedRawRecords.length} demo records loaded in memory.</p>
                                <p className="text-slate-500">Click the blue "Run Reconciliation" button above to evaluate candidate matches.</p>
                              </div>
                            ):(
                              <div className="space-y-1">
                                <p className="font-semibold text-slate-200">Load synthetic financial records to begin reconciliation.</p>
                                <p className="text-slate-500">Click "Load Demo Data" to generate realistic orders, payments, settlements, and bank entries.</p>
                              </div>
                            )}
                          </td>
                        </tr>
                      ):(
                        filteredResults.map(item=>{
                          const isSelected=item.sourceRecordId===selectedSourceId;
                          return(
                            <tr
                              key={item.sourceRecordId}
                              onClick={()=>{
                                setSelectedSourceId(item.sourceRecordId);
                                setSelectedRejectedIndex(null);
                                if(!aiReports[item.sourceRecordId]){
                                  fetchAiReportForRecord(item.sourceRecordId);
                                }
                              }}
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
                                {item.status==="AMBIGUOUS"&&`${item.candidateRecordIds.length} top candidates`}
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
              )}
            </div>
          </div>
          <div className="lg:col-span-5 space-y-4">
            {selectedRejected?(
              <div className="rounded-xl border border-rose-900/60 bg-slate-900/80 p-5 space-y-4 shadow-sm sticky top-20">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="space-y-0.5">
                    <span className="text-xs text-rose-400 uppercase font-bold">Ingestion Rejection</span>
                    <h2 className="font-mono text-base font-bold text-white">Record #{selectedRejected.index}</h2>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-950 text-rose-300 border border-rose-800">
                    {selectedRejected.reason}
                  </span>
                </div>
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-slate-300">Validation Failure Summary</span>
                  <p className="text-xs text-slate-400 bg-slate-950 p-3 rounded-lg border border-slate-800 leading-relaxed">
                    This raw input object failed schema normalization at index {selectedRejected.index} due to <span className="font-mono text-rose-300">{selectedRejected.reason}</span>. LedgerLens rejected this record at the ingestion boundary while continuing deterministic reconciliation on all valid batch records.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-slate-300">Raw Input Payload</span>
                  <pre className="text-[11px] font-mono bg-slate-950 p-3 rounded-lg border border-slate-800 overflow-x-auto text-slate-300">
                    {JSON.stringify(selectedRejected.rawRecord,null,2)}
                  </pre>
                </div>
              </div>
            ):selectedResult?(
              <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 space-y-5 shadow-sm sticky top-20">
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
                    <span className="font-mono font-bold text-indigo-400">{selectedResult.evidenceScore} / 140</span>
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-indigo-950/30 border border-indigo-800/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-indigo-400"/>
                      <span className="text-xs font-bold text-white">AI Case Investigation</span>
                    </div>
                    {currentAiReport&&(
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${
                          currentAiReport.riskLevel==="LOW"
                            ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                            : currentAiReport.riskLevel==="MEDIUM"
                            ? "bg-amber-950 text-amber-300 border-amber-800"
                            : "bg-rose-950 text-rose-300 border-rose-800"
                        }`}>
                          {currentAiReport.riskLevel} RISK
                        </span>
                        <span className="text-[10px] font-mono text-slate-400 px-1.5 py-0.2 rounded bg-slate-900 border border-slate-800">
                          {currentAiReport.provider.toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>
                  {currentAiReport?(
                    <div className="space-y-3 text-xs">
                      <p className="text-slate-300 leading-relaxed bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
                        {currentAiReport.summary}
                      </p>
                      <div className="space-y-1">
                        <span className="text-[11px] font-semibold text-slate-400">Why This Verdict:</span>
                        <p className="text-slate-300 leading-relaxed">{currentAiReport.whyThisStatus}</p>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[11px] font-semibold text-slate-400">Recommended Action:</span>
                        <p className="text-indigo-200 font-medium leading-relaxed bg-indigo-950/50 p-2 rounded border border-indigo-800/50">
                          {currentAiReport.recommendedAction}
                        </p>
                      </div>
                      {currentAiReport.questionsToInvestigate.length>0&&(
                        <div className="space-y-1.5">
                          <span className="text-[11px] font-semibold text-slate-400">Questions to Investigate:</span>
                          <div className="space-y-1">
                            {currentAiReport.questionsToInvestigate.map((q,idx)=>(
                              <button
                                key={idx}
                                onClick={()=>handleAskQuestion(q)}
                                className="w-full text-left text-[11px] text-slate-400 hover:text-indigo-300 hover:bg-slate-900/80 p-1.5 rounded transition border border-transparent hover:border-slate-800 flex items-center justify-between group"
                              >
                                <span>• {q}</span>
                                <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition text-indigo-400"/>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ):(
                    <div className="py-2 text-center text-xs text-slate-400">
                      <button
                        onClick={()=>fetchAiReportForRecord(selectedResult.sourceRecordId)}
                        disabled={isLoadingAiReport}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition"
                      >
                        <Bot className="h-3.5 w-3.5"/>
                        <span>{isLoadingAiReport?"Analyzing Case with AI...":"Generate AI Case Report"}</span>
                      </button>
                    </div>
                  )}
                </div>
                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-white">
                    <MessageSquare className="h-3.5 w-3.5 text-indigo-400"/>
                    <span>Ask LedgerLens Copilot</span>
                  </div>
                  {currentChats.length>0&&(
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {currentChats.map(chat=>(
                        <div key={chat.id} className="space-y-1.5 text-xs">
                          <div className="bg-indigo-950/50 p-2 rounded-lg border border-indigo-800/40 text-indigo-200">
                            <span className="font-semibold text-[10px] text-indigo-400 block uppercase">You asked:</span>
                            {chat.question}
                          </div>
                          <div className="bg-slate-900 p-2 rounded-lg border border-slate-800 text-slate-300 leading-relaxed">
                            <span className="font-semibold text-[10px] text-slate-400 block uppercase">Copilot:</span>
                            {chat.answer}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={currentQuestion}
                      onChange={e=>setCurrentQuestion(e.target.value)}
                      onKeyDown={e=>{if(e.key==="Enter")handleAskQuestion();}}
                      placeholder="Ask why this matched, missing criteria, risk..."
                      className="flex-1 px-3 py-1.5 text-xs bg-slate-900 rounded-lg border border-slate-800 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                    />
                    <button
                      onClick={()=>handleAskQuestion()}
                      disabled={isAskingQuestion||!currentQuestion.trim()}
                      className="p-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 transition"
                    >
                      <Send className="h-3.5 w-3.5"/>
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {[
                      "Why was this verdict chosen?",
                      "What is the operational risk?",
                      "What action should analyst take?"
                    ].map((prompt,idx)=>(
                      <button
                        key={idx}
                        onClick={()=>handleAskQuestion(prompt)}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-slate-900 text-slate-400 hover:text-indigo-300 hover:border-slate-700 border border-slate-800 transition"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
                {candidatesForSelected.length>0&&(
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-slate-300 block">Evaluated Candidate Matches</span>
                    <div className="space-y-2">
                      {candidatesForSelected.map(cand=>{
                        const targetRec=recordsMap.get(cand.targetRecordId);
                        const isWinningMatch=selectedResult.status==="RESOLVED"&&selectedResult.matchedRecordIds.includes(cand.targetRecordId);
                        const isTiedTopCandidate=selectedResult.status==="AMBIGUOUS"&&selectedResult.candidateRecordIds.includes(cand.targetRecordId);
                        return(
                          <div
                            key={cand.targetRecordId}
                            className={`p-3 rounded-lg border text-xs flex items-center justify-between ${
                              isWinningMatch
                                ? "bg-emerald-950/30 border-emerald-800/80 shadow-sm"
                                : isTiedTopCandidate
                                ? "bg-amber-950/30 border-amber-800/80 shadow-sm"
                                : "bg-slate-950/70 border-slate-800"
                            }`}
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-slate-200">{cand.targetRecordId}</span>
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700">{cand.targetType}</span>
                                {isWinningMatch&&(
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-900/80 text-emerald-300 border border-emerald-700/60 font-semibold">
                                    Winning Match
                                  </span>
                                )}
                                {isTiedTopCandidate&&(
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-900/80 text-amber-300 border border-amber-700/60 font-semibold">
                                    Tied Top Candidate
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 font-mono">
                                Ref: {targetRec?.reference||"None"} {targetRec?`• ${formatMoney(targetRec.amount,targetRec.currency)}`:""}
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="font-mono font-semibold text-indigo-300 block">{cand.reasons.length} criteria met</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {selectedResult.status!=="UNMATCHED"&&(
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-slate-300 block">Evidence Criteria Breakdown</span>
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
                        <span className="font-mono font-semibold">+100 pts</span>
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
                        <span className="font-mono font-semibold">+20 pts</span>
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
                        <span className="font-mono font-semibold">+10 pts</span>
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
                        <span className="font-mono font-semibold">+10 pts</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ):(
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-8 text-center text-slate-500 text-xs space-y-2">
                <Target className="h-6 w-6 text-slate-600 mx-auto"/>
                <p>Select any source record from the table to inspect its deterministic candidate evaluation, AI risk analysis, and copilot Q&A.</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
