import {
  InvestigationReport,
  ExecutiveSummaryReport,
  AskInvestigationResponse,
  InvestigationContext,
  ReconciliationSummary,
  RiskLevel,
  AttentionLevel
} from "@ledgerlens/shared";
export interface AiOptions{
  geminiApiKey?:string;
  openaiApiKey?:string;
  preferredProvider?:"gemini"|"openai"|"deterministic-fallback";
  timeoutMs?:number;
}
export function getActiveProvider(options?:AiOptions):"gemini"|"openai"|"deterministic-fallback"{
  if(options?.preferredProvider==="deterministic-fallback")return "deterministic-fallback";
  const geminiKey=options?.geminiApiKey||process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY;
  const openaiKey=options?.openaiApiKey||process.env.OPENAI_API_KEY;
  if(options?.preferredProvider==="gemini"&&geminiKey)return "gemini";
  if(options?.preferredProvider==="openai"&&openaiKey)return "openai";
  if(geminiKey)return "gemini";
  if(openaiKey)return "openai";
  return "deterministic-fallback";
}
export function getAiProviderInfo(options?:AiOptions):{provider:"gemini"|"openai"|"deterministic-fallback";isAiConfigured:boolean}{
  const provider=getActiveProvider(options);
  return{
    provider,
    isAiConfigured:provider!=="deterministic-fallback"
  };
}
function formatMoneyString(amountMinor:number,currency:string="USD"):string{
  const major=(amountMinor/100).toFixed(2);
  return `${currency} $${Number(major).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
}
export function generateDeterministicInvestigationReport(context:InvestigationContext):InvestigationReport{
  const {record,result,candidates}=context;
  const isResolved=result.status==="RESOLVED";
  const isAmbiguous=result.status==="AMBIGUOUS";
  const isUnmatched=result.status==="UNMATCHED";
  const formattedAmount=formatMoneyString(record.amount,record.currency);
  let riskLevel:RiskLevel="LOW";
  let attentionLevel:AttentionLevel="NO_ACTION";
  let summary="";
  let whyThisStatus="";
  let explanation="";
  const keyEvidence:string[]=[];
  let recommendedAction="";
  let recommendedActions:string[]=[];
  const questionsToInvestigate:string[]=[];
  if(isResolved){
    riskLevel="LOW";
    attentionLevel=result.evidenceScore>=140?"NO_ACTION":"MONITOR";
    const winnerId=result.matchedRecordIds[0]||"target";
    summary=`${record.type} ${record.id} (${formattedAmount}) was uniquely resolved to candidate ${winnerId} with an evidence score of ${result.evidenceScore}/140.`;
    whyThisStatus=`Candidate ${winnerId} attained the strictly highest evidence score without tie or competing counter-evidence.`;
    explanation=`A unique candidate (${winnerId}) achieved the highest evidence score of ${result.evidenceScore}/140 based on exact matching criteria. The match can be accepted based on recorded evidence.`;
    if(result.reasons.includes("EXACT_REFERENCE")){
      keyEvidence.push(`Exact Reference Match: '${record.reference||""}' matches candidate reference (+100 pts).`);
    }
    if(result.reasons.includes("AMOUNT_COMPATIBLE")){
      keyEvidence.push(`Amount Compatibility: ${formattedAmount} satisfies directional amount bounds (+20 pts).`);
    }
    if(result.reasons.includes("CURRENCY_COMPATIBLE")){
      keyEvidence.push(`Currency Compatibility: Matching '${record.currency}' currency code (+10 pts).`);
    }
    if(result.reasons.includes("TIME_WINDOW_COMPATIBLE")){
      keyEvidence.push(`Temporal Window: Transaction occurred within the permitted 7-day chronological window (+10 pts).`);
    }
    if(attentionLevel==="NO_ACTION"){
      recommendedActions=[
        "No manual operational intervention required.",
        "Proceed with automated ledger posting and batch settlement closure.",
        "Verify standard clearing house confirmation in next scheduled cycle."
      ];
    }else{
      recommendedActions=[
        "Monitor downstream settlement batch for secondary adjustments.",
        "Verify candidate reference linkage in clearing file.",
        "Accept match once the 30-day dispute window elapses."
      ];
    }
    recommendedAction=recommendedActions[0];
    questionsToInvestigate.push(
      "Confirm final bank ledger posting status with clearing network.",
      "Verify no secondary dispute or chargeback is received within the 30-day window."
    );
  }else if(isAmbiguous){
    riskLevel="HIGH";
    attentionLevel="REVIEW_REQUIRED";
    const tiedCount=result.candidateRecordIds.length;
    const tiedList=result.candidateRecordIds.join(", ");
    summary=`${record.type} ${record.id} (${formattedAmount}) has ${tiedCount} competing candidates with identical top evidence score (${result.evidenceScore} pts).`;
    whyThisStatus=`Multiple candidates (${tiedList}) tied for the highest evidence score. The deterministic engine refuses to guess without definitive differentiating reference or timestamp linkage.`;
    explanation=`Two or more candidates (${tiedList}) tied with the highest evidence score of ${result.evidenceScore} because all share compatible amounts and parameters. Do not automatically reconcile this transaction without disambiguation.`;
    keyEvidence.push(
      `${tiedCount} candidates share compatible amounts and valid 7-day chronological timestamps.`,
      `Tied candidate IDs: ${tiedList}.`
    );
    if(result.evidenceScore>=100){
      keyEvidence.push(`Candidates share duplicate or reused reference '${record.reference||"N/A"}'.`);
    }
    recommendedActions=[
      "Do not automatically reconcile this transaction.",
      "Hold automated batch payout until manual review is complete.",
      "Verify settlement identifiers and authorization codes against payment provider logs.",
      `Confirm which specific candidate (${tiedList}) belongs to the source payment.`
    ];
    recommendedAction=recommendedActions[0];
    questionsToInvestigate.push(
      `Do candidates ${tiedList} represent split settlements or duplicate payment gateway webhook events?`,
      "Can provider clearing logs confirm which settlement batch included this specific authorization code?"
    );
  }else{
    riskLevel=record.amount>100000?"HIGH":"MEDIUM";
    attentionLevel="REVIEW_REQUIRED";
    summary=`${record.type} ${record.id} (${formattedAmount}) could not be matched with any candidate record in the ingestion batch.`;
    whyThisStatus="Zero candidates in the dataset satisfied the directional relationship, currency, chronological timestamp, 7-day temporal window, and amount criteria.";
    explanation="No eligible candidate satisfied all deterministic reconciliation rules. Review the transaction reference, amount, currency, timestamp, and check whether a corresponding record is missing from the dataset.";
    keyEvidence.push(
      `No candidate record discovered for source ${record.id} within 7-day window.`,
      `Source parameters: ${record.type}, ${formattedAmount}, Ref: ${record.reference||"None"}.`
    );
    recommendedActions=[
      "Review transaction reference, amount, currency, and timestamps against source systems.",
      "Check whether downstream payment gateway or bank clearing files are delayed past 7 days.",
      "Verify whether the transaction was voided, charged back, or processed under an alternative entity identifier.",
      "Re-ingest missing clearing batch files if the transaction is confirmed settled."
    ];
    recommendedAction=recommendedActions[0];
    questionsToInvestigate.push(
      "Has the corresponding bank statement or payment gateway batch file for this date range been fully ingested?",
      "Was this transaction voided, charged back, or processed under an alternative entity identifier?"
    );
  }
  return{
    summary,
    whyThisStatus,
    explanation,
    keyEvidence,
    riskLevel,
    attentionLevel,
    recommendedAction,
    recommendedActions,
    questionsToInvestigate,
    provider:"deterministic-fallback"
  };
}
export function generateDeterministicExecutiveSummary(summaryData:ReconciliationSummary):ExecutiveSummaryReport{
  const evaluated=summaryData.resolved+summaryData.ambiguous+summaryData.unmatched;
  const resolvedPct=evaluated>0?((summaryData.resolved/evaluated)*100).toFixed(1):"0.0";
  const ambiguousPct=evaluated>0?((summaryData.ambiguous/evaluated)*100).toFixed(1):"0.0";
  const unmatchedPct=evaluated>0?((summaryData.unmatched/evaluated)*100).toFixed(1):"0.0";
  const overview=`Reconciliation batch evaluated ${summaryData.totalInputRecords} total input records (${summaryData.acceptedRecords} normalized, ${summaryData.rejectedRecords} rejected). Out of ${evaluated} evaluated flows, ${summaryData.resolved} (${resolvedPct}%) were deterministically resolved, ${summaryData.ambiguous} (${ambiguousPct}%) require review due to candidate score ties, and ${summaryData.unmatched} (${unmatchedPct}%) remain unmatched.`;
  const keyFindings=[
    `Automated resolution rate reached ${resolvedPct}% across ${summaryData.resolved} clean single-winner flows.`,
    `${summaryData.ambiguous} source records (${ambiguousPct}%) yielded score ties across ${summaryData.candidateCount} total candidate relationships.`,
    `${summaryData.unmatched} source records (${unmatchedPct}%) have no eligible counterpart within the 7-day temporal window.`
  ];
  if(summaryData.rejectedRecords>0){
    keyFindings.push(`${summaryData.rejectedRecords} raw input records failed initial schema normalization and were rejected at ingestion boundary.`);
  }
  const attentionRequired:string[]=[];
  if(summaryData.ambiguous>0){
    attentionRequired.push(`Investigate ${summaryData.ambiguous} ambiguous record flows where multiple candidates share identical evidence scores.`);
  }
  if(summaryData.unmatched>0){
    attentionRequired.push(`Review ${summaryData.unmatched} unmatched records for potential delayed clearing files or missing gateway batches.`);
  }
  if(summaryData.rejectedRecords>0){
    attentionRequired.push(`Remediate ${summaryData.rejectedRecords} rejected raw input payloads containing invalid types or malformed money formats.`);
  }
  if(attentionRequired.length===0){
    attentionRequired.push("No exceptions detected. All records resolved cleanly without operational risk.");
  }
  const recommendedNextSteps=[
    "Approve and release automated ledger postings for all RESOLVED transactions.",
    "Route AMBIGUOUS candidates to operations queue for secondary reference disambiguation.",
    "Verify whether clearing files for UNMATCHED items are pending in subsequent batch windows."
  ];
  return{
    overview,
    keyFindings,
    attentionRequired,
    recommendedNextSteps,
    provider:"deterministic-fallback"
  };
}
export function generateDeterministicAskAnswer(question:string,context:InvestigationContext):AskInvestigationResponse{
  const q=question.toLowerCase();
  const {record,result}=context;
  const isResolved=result.status==="RESOLVED";
  const isAmbiguous=result.status==="AMBIGUOUS";
  const isUnmatched=result.status==="UNMATCHED";
  const formattedAmount=formatMoneyString(record.amount,record.currency);
  if(q.includes("why")||q.includes("status")||q.includes("reason")){
    if(isResolved){
      return{
        answer:`Record ${record.id} was RESOLVED because candidate ${result.matchedRecordIds[0]} uniquely attained the highest evidence score (${result.evidenceScore} pts), satisfying reference, amount, currency, and temporal rules.`,
        provider:"deterministic-fallback"
      };
    }
    if(isAmbiguous){
      return{
        answer:`Record ${record.id} is AMBIGUOUS because ${result.candidateRecordIds.length} candidates (${result.candidateRecordIds.join(", ")}) tied with the identical highest evidence score (${result.evidenceScore} pts). LedgerLens deterministic engine never guesses between equal candidates.`,
        provider:"deterministic-fallback"
      };
    }
    return{
      answer:`Record ${record.id} is UNMATCHED because no candidate in the current ingestion batch satisfied all compatibility criteria (supported type pair, matching currency '${record.currency}', positive chronological order within 7 days, and amount bounds).`,
      provider:"deterministic-fallback"
    };
  }
  if(q.includes("risk")||q.includes("level")||q.includes("severity")){
    if(isResolved){
      return{
        answer:`Risk is LOW (Attention: ${result.evidenceScore>=140?"NO_ACTION":"MONITOR"}). The match is unique and meets deterministic criteria (+${result.evidenceScore} evidence score). Automated posting is safe.`,
        provider:"deterministic-fallback"
      };
    }
    if(isAmbiguous){
      return{
        answer:`Risk is HIGH (Attention: REVIEW_REQUIRED). Automated posting is blocked because assigning ${record.id} to the wrong candidate among ${result.candidateRecordIds.join(", ")} would corrupt ledger reconciliation.`,
        provider:"deterministic-fallback"
      };
    }
    return{
      answer:`Risk is MEDIUM/HIGH (Attention: REVIEW_REQUIRED). Amount ${formattedAmount} is unreconciled. Operational verification is needed to confirm if the counterpart transaction is missing or delayed.`,
      provider:"deterministic-fallback"
    };
  }
  if(q.includes("action")||q.includes("next")||q.includes("do")||q.includes("check")||q.includes("analyst")){
    if(isResolved){
      return{
        answer:`Recommended action: Proceed with automated batch settlement and ledger journal creation. No manual intervention required.`,
        provider:"deterministic-fallback"
      };
    }
    if(isAmbiguous){
      return{
        answer:`Recommended action: Do not automatically reconcile this transaction. Hold payout. Cross-check merchant batch IDs and authorization codes across candidates ${result.candidateRecordIds.join(" and ")} in provider logs.`,
        provider:"deterministic-fallback"
      };
    }
    return{
      answer:`Recommended action: Review transaction reference, amount, and timestamp. Inspect clearing files for the next 7 days or query the payment gateway for refund/cancellation status on record ${record.id}.`,
      provider:"deterministic-fallback"
    };
  }
  if(q.includes("score")||q.includes("evidence")||q.includes("points")||q.includes("weights")){
    return{
      answer:`Evidence scoring model: Exact Reference = +100 pts, Amount Compatible = +20 pts, Currency Compatible = +10 pts, Within 7-Day Window = +10 pts (Max 140 pts). This record achieved a score of ${result.evidenceScore} pts.`,
      provider:"deterministic-fallback"
    };
  }
  return{
    answer:`Record ${record.id} is a ${record.type} for ${formattedAmount} with status ${result.status} (score: ${result.evidenceScore} pts). Evaluation is strictly grounded in deterministic rules.`,
    provider:"deterministic-fallback"
  };
}
async function callGeminiApi(prompt:string,apiKey:string,timeoutMs:number=10000):Promise<string>{
  const models=["gemini-1.5-flash","gemini-2.0-flash","gemini-1.5-flash-8b"];
  let lastError:Error|null=null;
  for(const model of models){
    const url=`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const res=await fetch(url,{
        method:"POST",
        headers:{
          "Content-Type":"application/json"
        },
        body:JSON.stringify({
          contents:[{
            role:"user",
            parts:[{text:prompt}]
          }],
          generationConfig:{
            temperature:0.1,
            responseMimeType:"application/json"
          }
        }),
        signal:controller.signal
      });
      clearTimeout(timer);
      if(!res.ok){
        const errText=await res.text().catch(()=>"");
        lastError=new Error(`Gemini ${model} returned ${res.status}: ${errText}`);
        continue;
      }
      const data=await res.json() as {candidates?:Array<{content?:{parts?:Array<{text?:string}>}}>};
      const text=data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if(!text){
        lastError=new Error("Empty Gemini response");
        continue;
      }
      return text;
    }catch(err){
      clearTimeout(timer);
      lastError=err instanceof Error?err:new Error(String(err));
    }
  }
  throw lastError||new Error("All Gemini model endpoints failed");
}
async function callOpenAiApi(prompt:string,apiKey:string,timeoutMs:number=10000):Promise<string>{
  const url="https://api.openai.com/v1/chat/completions";
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const res=await fetch(url,{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Authorization":`Bearer ${apiKey}`
      },
      body:JSON.stringify({
        model:"gpt-4o-mini",
        messages:[
          {role:"system",content:"You are LedgerLens AI Investigator, an expert financial reconciliation copilot. You output only valid strict JSON."},
          {role:"user",content:prompt}
        ],
        temperature:0.1,
        response_format:{type:"json_object"}
      }),
      signal:controller.signal
    });
    clearTimeout(timer);
    if(!res.ok){
      throw new Error(`OpenAI API error ${res.status}`);
    }
    const data=await res.json() as {choices?:Array<{message?:{content?:string}}>};
    const text=data?.choices?.[0]?.message?.content;
    if(!text)throw new Error("Empty OpenAI response");
    return text;
  }finally{
    clearTimeout(timer);
  }
}
function cleanJsonText(raw:string):string{
  let text=raw.trim();
  if(text.startsWith("```json")){
    text=text.slice(7);
  }else if(text.startsWith("```")){
    text=text.slice(3);
  }
  if(text.endsWith("```")){
    text=text.slice(0,-3);
  }
  text=text.trim();
  const firstBrace=text.indexOf("{");
  const lastBrace=text.lastIndexOf("}");
  if(firstBrace!==-1&&lastBrace!==-1&&lastBrace>firstBrace){
    return text.slice(firstBrace,lastBrace+1);
  }
  return text;
}
export async function generateInvestigationReport(context:InvestigationContext,options?:AiOptions):Promise<InvestigationReport>{
  const provider=getActiveProvider(options);
  if(provider==="deterministic-fallback"){
    return generateDeterministicInvestigationReport(context);
  }
  const systemPrompt=`You are LedgerLens AI Investigator, an expert financial reconciliation copilot.
Your job is to provide an explanatory audit report and concrete analyst actions for a deterministic reconciliation result.
CRITICAL RULES:
1. You must NEVER override the deterministic status (${context.result.status}) or change scores (${context.result.evidenceScore}).
2. Ground your explanation ONLY in the supplied record and candidate data. Never invent IDs or transactions.
3. Determine:
   - riskLevel: "LOW" | "MEDIUM" | "HIGH"
   - attentionLevel: "REVIEW_REQUIRED" | "MONITOR" | "NO_ACTION" (AMBIGUOUS/UNMATCHED must be REVIEW_REQUIRED; full-score clean RESOLVED is NO_ACTION; partial-score RESOLVED is MONITOR)
4. Return STRICT JSON conforming to this schema:
{
  "summary": "Concise summary of the flow and finding",
  "whyThisStatus": "Clear explanation of why deterministic rules produced this status",
  "explanation": "Concise explanation why this happened grounded in evidence and parameters",
  "keyEvidence": ["Evidence point 1", "Evidence point 2"],
  "riskLevel": "LOW" | "MEDIUM" | "HIGH",
  "attentionLevel": "REVIEW_REQUIRED" | "MONITOR" | "NO_ACTION",
  "recommendedAction": "Primary next step for operations team",
  "recommendedActions": ["Action step 1", "Action step 2", "Action step 3"],
  "questionsToInvestigate": ["Question 1", "Question 2"]
}`;
  const contextJson=JSON.stringify({
    sourceRecord:{
      id:context.record.id,
      type:context.record.type,
      amount:context.record.amount,
      currency:context.record.currency,
      timestamp:context.record.timestamp,
      reference:context.record.reference||null
    },
    deterministicResult:{
      status:context.result.status,
      evidenceScore:context.result.evidenceScore,
      matchedRecordIds:context.result.matchedRecordIds,
      candidateRecordIds:context.result.candidateRecordIds,
      reasons:context.result.reasons
    },
    candidates:context.candidates.map(c=>({
      targetRecordId:c.targetRecordId,
      targetType:c.targetType,
      reasons:c.reasons
    }))
  },null,2);
  const userPrompt=`Analyze this reconciliation case:\n${contextJson}\n\nReturn JSON conforming strictly to the requested schema.`;
  try{
    const apiKey=provider==="gemini"
      ?(options?.geminiApiKey||process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY||"")
      :(options?.openaiApiKey||process.env.OPENAI_API_KEY||"");
    const rawText=provider==="gemini"
      ?await callGeminiApi(`${systemPrompt}\n\n${userPrompt}`,apiKey,options?.timeoutMs)
      :await callOpenAiApi(`${systemPrompt}\n\n${userPrompt}`,apiKey,options?.timeoutMs);
    const parsed=JSON.parse(cleanJsonText(rawText)) as Partial<InvestigationReport>;
    const riskLevel:RiskLevel=(parsed.riskLevel==="LOW"||parsed.riskLevel==="MEDIUM"||parsed.riskLevel==="HIGH")
      ?parsed.riskLevel
      :(context.result.status==="AMBIGUOUS"?"HIGH":context.result.status==="UNMATCHED"?"MEDIUM":"LOW");
    const attentionLevel:AttentionLevel=(parsed.attentionLevel==="REVIEW_REQUIRED"||parsed.attentionLevel==="MONITOR"||parsed.attentionLevel==="NO_ACTION")
      ?parsed.attentionLevel
      :(context.result.status==="AMBIGUOUS"||context.result.status==="UNMATCHED"?"REVIEW_REQUIRED":context.result.evidenceScore>=140?"NO_ACTION":"MONITOR");
    const explanation=typeof parsed.explanation==="string"&&parsed.explanation.trim().length>0
      ?parsed.explanation
      :typeof parsed.whyThisStatus==="string"&&parsed.whyThisStatus.trim().length>0
      ?parsed.whyThisStatus
      :typeof parsed.summary==="string"
      ?parsed.summary
      :"Deterministic rule evaluation completed.";
    const whyThisStatus=typeof parsed.whyThisStatus==="string"&&parsed.whyThisStatus.trim().length>0
      ?parsed.whyThisStatus
      :explanation;
    const summary=typeof parsed.summary==="string"&&parsed.summary.trim().length>0
      ?parsed.summary
      :explanation;
    const recommendedActions=Array.isArray(parsed.recommendedActions)&&parsed.recommendedActions.length>0
      ?parsed.recommendedActions.map(String)
      :typeof parsed.recommendedAction==="string"&&parsed.recommendedAction.trim().length>0
      ?[parsed.recommendedAction]
      :["Review record in provider portal."];
    const recommendedAction=typeof parsed.recommendedAction==="string"&&parsed.recommendedAction.trim().length>0
      ?parsed.recommendedAction
      :recommendedActions[0];
    const keyEvidence=Array.isArray(parsed.keyEvidence)?parsed.keyEvidence.map(String):[];
    const questionsToInvestigate=Array.isArray(parsed.questionsToInvestigate)?parsed.questionsToInvestigate.map(String):[];
    return{
      summary,
      whyThisStatus,
      explanation,
      keyEvidence,
      riskLevel,
      attentionLevel,
      recommendedAction,
      recommendedActions,
      questionsToInvestigate,
      provider
    };
  }catch(err){
    const fallback=generateDeterministicInvestigationReport(context);
    return fallback;
  }
}
export async function generateExecutiveSummary(summaryData:ReconciliationSummary,options?:AiOptions):Promise<ExecutiveSummaryReport>{
  const provider=getActiveProvider(options);
  if(provider==="deterministic-fallback"){
    return generateDeterministicExecutiveSummary(summaryData);
  }
  const systemPrompt=`You are LedgerLens AI Investigator. Generate an executive reconciliation summary for operations leadership.
CRITICAL RULES:
1. Use the EXACT numbers provided in the summary data. Never fabricate or change counts.
2. Return STRICT JSON conforming to this schema:
{
  "overview": "High-level executive summary of batch reconciliation results",
  "keyFindings": ["Finding 1", "Finding 2", "Finding 3"],
  "attentionRequired": ["Exception item 1", "Exception item 2"],
  "recommendedNextSteps": ["Step 1", "Step 2", "Step 3"]
}`;
  const userPrompt=`Reconciliation Batch Summary Data:\n${JSON.stringify(summaryData,null,2)}\n\nReturn JSON matching the schema.`;
  try{
    const apiKey=provider==="gemini"
      ?(options?.geminiApiKey||process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY||"")
      :(options?.openaiApiKey||process.env.OPENAI_API_KEY||"");
    const rawText=provider==="gemini"
      ?await callGeminiApi(`${systemPrompt}\n\n${userPrompt}`,apiKey,options?.timeoutMs)
      :await callOpenAiApi(`${systemPrompt}\n\n${userPrompt}`,apiKey,options?.timeoutMs);
    const parsed=JSON.parse(cleanJsonText(rawText)) as Partial<ExecutiveSummaryReport>;
    if(
      typeof parsed.overview==="string"&&
      Array.isArray(parsed.keyFindings)&&
      Array.isArray(parsed.attentionRequired)&&
      Array.isArray(parsed.recommendedNextSteps)
    ){
      return{
        overview:parsed.overview,
        keyFindings:parsed.keyFindings.map(String),
        attentionRequired:parsed.attentionRequired.map(String),
        recommendedNextSteps:parsed.recommendedNextSteps.map(String),
        provider
      };
    }
    throw new Error("Invalid schema from AI");
  }catch(err){
    return generateDeterministicExecutiveSummary(summaryData);
  }
}
export async function askInvestigationQuestion(question:string,context:InvestigationContext,options?:AiOptions):Promise<AskInvestigationResponse>{
  const provider=getActiveProvider(options);
  if(provider==="deterministic-fallback"){
    return generateDeterministicAskAnswer(question,context);
  }
  const systemPrompt=`You are LedgerLens AI Copilot, assisting a financial operations analyst investigating a reconciliation result.
CRITICAL RULES:
1. Be concise, precise, professional, and clear.
2. Ground all answers ONLY in the provided record and deterministic candidate match data.
3. Return JSON: { "answer": "your answer text" }`;
  const userPrompt=`Case Context:\n${JSON.stringify({
    record:context.record,
    result:context.result,
    candidates:context.candidates
  },null,2)}\n\nUser Question: ${question}\n\nReturn JSON: { "answer": "..." }`;
  try{
    const apiKey=provider==="gemini"
      ?(options?.geminiApiKey||process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY||"")
      :(options?.openaiApiKey||process.env.OPENAI_API_KEY||"");
    const rawText=provider==="gemini"
      ?await callGeminiApi(`${systemPrompt}\n\n${userPrompt}`,apiKey,options?.timeoutMs)
      :await callOpenAiApi(`${systemPrompt}\n\n${userPrompt}`,apiKey,options?.timeoutMs);
    const cleaned=cleanJsonText(rawText);
    const parsed=JSON.parse(cleaned) as {answer?:string;response?:string;text?:string};
    const answerText=parsed.answer||parsed.response||parsed.text||cleaned;
    if(typeof answerText==="string"&&answerText.trim().length>0){
      return{
        answer:answerText.trim(),
        provider
      };
    }
    throw new Error("Invalid answer from AI");
  }catch(err){
    return generateDeterministicAskAnswer(question,context);
  }
}
