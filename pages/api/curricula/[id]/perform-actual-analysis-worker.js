// File: pages/api/curricula/[id]/perform-actual-analysis-worker.js
import prisma from '../../../../lib/prisma';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import pdf from 'pdf-parse'; // Ensure this is pdf-parse, not another 'pdf'
import mammoth from 'mammoth';
import fetch from 'node-fetch';

const apiKey = process.env.GEMINI_API_KEY;
let genAI;
if (apiKey) { genAI = new GoogleGenerativeAI(apiKey); }
else { console.error("[Worker] GEMINI_API_KEY is not set."); }

const generationConfig = { temperature: 0.1, topK: 1, topP: 0.95, maxOutputTokens: 1024, responseMimeType: "application/json" };
const safetySettings = [ /* ... */ ];
const USAO_ADMISSIONS_REQUIREMENTS_SIMPLIFIED = { englishUnits: { required: 4, label: "English" }};

async function callGeminiAndParseJson(promptContent, modelInstance, attempt = 1, maxAttempts = 1) {
  console.log(`[Worker/callGemini] Attempt ${attempt}/${maxAttempts}. Prompt snippet: ${String(promptContent).substring(0,70)}...`);
  let rawTextResponse = "No response received from AI.";
  try {
    const result = await modelInstance.generateContent(promptContent);
    rawTextResponse = result.response.text(); 
    console.log(`[Worker/callGemini] RAW GEMINI RESPONSE (Attempt ${attempt}, Length: ${rawTextResponse.length}):\n>>>>>>>>>>>>\n${rawTextResponse}\n<<<<<<<<<<<<`);
    let jsonText = rawTextResponse.trim();
    if (jsonText.startsWith("```json")) { jsonText = jsonText.substring(7, jsonText.endsWith("```") ? jsonText.length - 3 : undefined).trim(); }
    else if (jsonText.startsWith("```")) { jsonText = jsonText.substring(3, jsonText.endsWith("```") ? jsonText.length - 3 : undefined).trim(); }
    if (!jsonText) throw new Error("Cleaned JSON text is empty.");
    return JSON.parse(jsonText);
  } catch (error) {
    console.error(`[Worker/callGemini] JSON PARSING FAILED on attempt ${attempt}: ${error.message}.`);
    const enhancedError = new Error(`Failed to get valid JSON from AI. Last error: ${error.message}. Raw response logged above.`);
    enhancedError.rawResponse = rawTextResponse; 
    throw enhancedError;
  }
}

async function generateRealAnalysisResults(curriculum, extractedText) {
  console.log(`[Worker/generateReal] For: ${curriculum?.name}. Received extracted text length: ${extractedText?.length || 0}`);
  if (!genAI) return { error: "Gemini API key not configured.", analysisComplete: false, lastAnalyzed: new Date().toISOString(), analyzedBy: "GeminiEngine (Disabled)" };
  
  const MIN_TEXT_LENGTH = 20; // Define minimum length clearly
  if (!extractedText || extractedText.trim().length < MIN_TEXT_LENGTH) {
    console.warn(`[Worker/generateReal] Extracted text ("${String(extractedText).substring(0,50)}...") is shorter than minimum ${MIN_TEXT_LENGTH} chars.`);
    return { 
        error: `Extracted text too short for analysis (min ${MIN_TEXT_LENGTH} chars). Received ${extractedText?.trim().length || 0} chars.`, 
        analysisComplete: false,
        lastAnalyzed: new Date().toISOString(), analyzedBy: "GeminiEngine (Insufficient Text)",
        overallAlignmentScore: 5, overallStatusText: "Insufficient Data for AI",
        standardAlignmentDetails: { summary: "Not enough text from curriculum to perform analysis.", findings: []},
        extractedTextSnippet: extractedText ? extractedText.substring(0, 100) + "..." : "No text extracted.",
    };
  }

  const MAX_PROMPT_TEXT_SNIPPET = 3000;
  const textForPrompting = extractedText.length > MAX_PROMPT_TEXT_SNIPPET ? extractedText.substring(0, MAX_PROMPT_TEXT_SNIPPET) : extractedText;
  const systemInstructionText = `You are an expert curriculum analyst. Respond ONLY with a valid JSON object. Do not include any other text or markdown. Your entire response must be a single, parsable JSON object.`;
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest", generationConfig, safetySettings, systemInstruction: { role: "system", parts: [{ text: systemInstructionText }] } });
  
  let analysisResultsBuild = { /* ... initial structure ... */ };
  analysisResultsBuild.lastAnalyzed = new Date().toISOString();
  analysisResultsBuild.analyzedBy = "GeminiWorker-Simplified-v1.1";
  analysisResultsBuild.extractedTextSnippet = textForPrompting.substring(0, 200) + "...";
  analysisResultsBuild.errors = [];

  try {
    const admissionsPrompt = `Analyze curriculum text snippet for USAO freshman admissions (English only). Text: """${textForPrompting}""" Requirement: English: ${USAO_ADMISSIONS_REQUIREMENTS_SIMPLIFIED.englishUnits.required} units. Respond ONLY with JSON: {"englishAnalysis": {"alignmentStatus": "Met/Partially Met/Gap/Unclear", "reasoning": "brief, max 5 words"}}`;
    console.log("[Worker/generateReal] Sending simplified admissions prompt to Gemini...");
    const admissionsData = await callGeminiAndParseJson(admissionsPrompt, model);
    
    if (admissionsData && admissionsData.englishAnalysis && typeof admissionsData.englishAnalysis.alignmentStatus === 'string') {
      analysisResultsBuild.standardAlignmentDetails = {
        findings: [{
            standardId: "USAO-HS-ENGLISH-SIMPLE",
            description: "English Unit Requirement (Simplified Check)",
            alignmentStatus: admissionsData.englishAnalysis.alignmentStatus,
            reasoning: admissionsData.englishAnalysis.reasoning || "N/A"
        }],
        summary: "Simplified USAO English admissions assessment complete.",
        overallStatusText: `English: ${admissionsData.englishAnalysis.alignmentStatus}`,
        overallScore: admissionsData.englishAnalysis.alignmentStatus === "Met" ? 100 : (admissionsData.englishAnalysis.alignmentStatus === "Partially Met" ? 50 : 10),
      };
      analysisResultsBuild.overallStatusText = `English: ${admissionsData.englishAnalysis.alignmentStatus}`;
      analysisResultsBuild.overallAlignmentScore = analysisResultsBuild.standardAlignmentDetails.overallScore;
      analysisResultsBuild.analysisComplete = true;
    } else {
      analysisResultsBuild.errors.push("Simplified admissions analysis from AI was malformed or key 'englishAnalysis' was missing.");
      analysisResultsBuild.overallStatusText = "Partial Failure (AI Format)";
      console.warn("[Worker/generateReal] Simplified admissions data error. Received:", admissionsData);
    }
  } catch (error) {
    console.error("[Worker/generateReal] Critical error during simplified AI analysis:", error.message);
    if (error.rawResponse) console.error("Raw Gemini text for failed call:\n", error.rawResponse);
    analysisResultsBuild.errors.push("Critical error in AI call: " + error.message);
    analysisResultsBuild.overallStatusText = "Failed Critically (AI Call)";
    analysisResultsBuild.analysisComplete = false;
  }
  return analysisResultsBuild;
}

async function extractTextFromFile(fileBuffer, mimeType) {
  console.log(`[extractTextFromFile] Attempting text extraction. MimeType: ${mimeType}, Buffer length: ${fileBuffer?.length}`);
  if (!fileBuffer || fileBuffer.length === 0) {
    console.warn("[extractTextFromFile] Received empty or null file buffer.");
    return ""; // Return empty string if buffer is empty
  }

  if (mimeType === 'application/pdf') {
    try {
      const data = await pdf(fileBuffer);
      const text = data.text || "";
      console.log(`[extractTextFromFile] PDF text extracted. Length: ${text.length}. Snippet: "${text.substring(0,100)}..."`);
      return text;
    } catch (error) {
      console.error("[extractTextFromFile] Error parsing PDF:", error.message, error.stack);
      throw new Error(`Failed to parse PDF content: ${error.message}`);
    }
  } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') { // DOCX
    try {
      const { value } = await mammoth.extractRawText({ buffer: fileBuffer });
      const text = value || "";
      console.log(`[extractTextFromFile] DOCX text extracted. Length: ${text.length}. Snippet: "${text.substring(0,100)}..."`);
      return text;
    } catch (error) {
      console.error("[extractTextFromFile] Error parsing DOCX:", error.message, error.stack);
      throw new Error(`Failed to parse DOCX content: ${error.message}`);
    }
  } else if (mimeType === 'text/plain') {
    try {
      const text = fileBuffer.toString('utf8');
      console.log(`[extractTextFromFile] TXT text extracted. Length: ${text.length}. Snippet: "${text.substring(0,100)}..."`);
      return text;
    } catch (error) {
      console.error("[extractTextFromFile] Error parsing TXT:", error.message, error.stack);
      throw new Error(`Failed to parse TXT content: ${error.message}`);
    }
  } else {
    console.warn(`[extractTextFromFile] Unsupported mimeType for text extraction: ${mimeType}`);
    throw new Error(`Unsupported file type for text extraction: ${mimeType}`);
  }
}

export async function performFullAnalysis(curriculumId) {
  console.log(`[Worker/performFullAnalysis] Starting for curriculum ID: ${curriculumId}`);
  let analysisStatus = "PROCESSING_WORKER";
  let analysisResultsObject = { /* Default initial structure */ };
  let analysisErrorMsg = null;

  try {
    const curriculum = await prisma.curriculum.findUnique({ where: { id: String(curriculumId) } });
    if (!curriculum) throw new Error("Curriculum not found in worker.");
    if (!curriculum.filePath) throw new Error("Curriculum filePath is missing in worker.");

    console.log(`[Worker/performFullAnalysis] Fetching file from Blob: ${curriculum.filePath}`);
    const fileResponse = await fetch(curriculum.filePath);
    if (!fileResponse.ok) throw new Error(`Blob fetch failed: ${fileResponse.status} ${fileResponse.statusText}`);
    
    // Use arrayBuffer() then Buffer.from() for wider compatibility than response.buffer()
    const arrayBuffer = await fileResponse.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);
    
    const mimeType = fileResponse.headers.get('content-type') || 'application/octet-stream';
    console.log(`[Worker/performFullAnalysis] File fetched. Size: ${fileBuffer.length}, MIME Type: ${mimeType}`);
    
    let extractedText = "";
    try {
      extractedText = await extractTextFromFile(fileBuffer, mimeType);
      console.log(`[Worker/performFullAnalysis] Text successfully extracted. Length: ${extractedText.length}. Snippet: "${extractedText.substring(0,100)}..."`);
    } catch (extractionError) {
      console.error(`[Worker/performFullAnalysis] Text extraction failed:`, extractionError.message);
      // This error will be caught by the outer catch block
      throw new Error(`Text extraction failed: ${extractionError.message}`);
    }
    
    analysisResultsObject = await generateRealAnalysisResults(curriculum, extractedText);

    if (analysisResultsObject.error || (analysisResultsObject.errors && analysisResultsObject.errors.length > 0) ) {
        analysisStatus = "FAILED";
        analysisErrorMsg = analysisResultsObject.error || (analysisResultsObject.errors || []).join('; ');
    } else if (!analysisResultsObject.analysisComplete) {
        analysisStatus = "FAILED"; 
        analysisErrorMsg = "AI Analysis did not complete successfully (marked as incomplete).";
    } else {
        analysisStatus = "COMPLETED";
    }

  } catch (error) {
    console.error(`[Worker/performFullAnalysis] Top-level error for ${curriculumId}:`, error.message, error.stack);
    analysisStatus = "FAILED";
    analysisErrorMsg = error.message || "Unknown worker error.";
    analysisResultsObject.error = analysisResultsObject.error || analysisErrorMsg;
    analysisResultsObject.analysisComplete = false;
    if (!analysisResultsObject.lastAnalyzed) analysisResultsObject.lastAnalyzed = new Date().toISOString();
  } finally {
    console.log(`[Worker/performFullAnalysis] Updating DB for ${curriculumId}, status: ${analysisStatus}, error: ${analysisErrorMsg ? `"${analysisErrorMsg}"` : 'null'}`);
    try {
      await prisma.curriculum.update({
        where: { id: String(curriculumId) },
        data: {
          analysisResults: analysisResultsObject,
          analysisStatus: analysisStatus,
          analysisError: analysisErrorMsg,
          lastAnalysisCompletedAt: new Date(),
        },
      });
      console.log(`[Worker/performFullAnalysis] DB updated for ${curriculumId}.`);
    } catch (dbError) {
      console.error(`[Worker/performFullAnalysis] CRITICAL: DB update FAILED for ${curriculumId}:`, dbError);
    }
  }
}
