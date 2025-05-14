// File: pages/api/curricula/[id]/perform-actual-analysis-worker.js
import prisma from '../../../../lib/prisma';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import fetch from 'node-fetch';
// import path from 'path'; // Not strictly needed if using basename from originalFilename

// --- Gemini API Client Setup ---
const apiKey = process.env.GEMINI_API_KEY;
let genAI;
if (apiKey) { genAI = new GoogleGenerativeAI(apiKey); }
else { console.error("[Worker] GEMINI_API_KEY is not set. AI analysis will be disabled."); }

const generationConfig = { temperature: 0.1, topK: 1, topP: 0.95, maxOutputTokens: 2048, responseMimeType: "application/json" };
const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];
const USAO_ADMISSIONS_REQUIREMENTS = {
  englishUnits: { required: 4, label: "English (Grammar, Composition, Literature)"},
  mathUnits: { required: 3, label: "Mathematics (Algebra I, Geometry, Algebra II or higher)"},
};
// Define or import USAO_INTRO_COURSE_THEMES and REGIONAL_HIGH_GROWTH_INDUSTRIES_OK here if needed for more analysis steps

async function callGeminiAndParseJson(promptContent, modelInstance, attempt = 1, maxAttempts = 1) {
  console.log(`[Worker/callGemini] Attempt ${attempt}/${maxAttempts}. Prompt snippet: ${String(promptContent).substring(0,70)}...`);
  let rawTextResponse = ""; 
  try {
    const result = await modelInstance.generateContent(promptContent);
    rawTextResponse = result.response.text(); 
    console.log(`[Worker/callGemini] RAW GEMINI RESPONSE (Full):\n>>>>>>>>>>>>\n${rawTextResponse}\n<<<<<<<<<<<<`);
    let jsonText = rawTextResponse.trim();
    if (jsonText.startsWith("```json")) { jsonText = jsonText.substring(7, jsonText.endsWith("```") ? jsonText.length - 3 : undefined).trim(); }
    else if (jsonText.startsWith("```")) { jsonText = jsonText.substring(3, jsonText.endsWith("```") ? jsonText.length - 3 : undefined).trim(); }
    if (!jsonText) throw new Error("Cleaned JSON text is empty.");
    return JSON.parse(jsonText);
  } catch (error) {
    console.error(`[Worker/callGemini] JSON PARSING FAILED on attempt ${attempt}: ${error.message}.`);
    const parseError = new Error(`Failed to get valid JSON from AI. Last error: ${error.message}. Raw response logged above.`);
    parseError.rawResponse = rawTextResponse; 
    throw parseError;
  }
}

async function generateAnalysisResultsLogic(curriculum, extractedText) {
  // This is the core of your previous performRealAnalysisWithGemini function
  // It should return the analysisResults object or throw an error.
  console.log(`[Worker/generateAnalysis] For: ${curriculum?.name}. Text length: ${extractedText?.length || 0}`);
  if (!genAI) return { error: "Gemini API key not configured.", analysisComplete: false, lastAnalyzed: new Date().toISOString(), analyzedBy: "GeminiEngine (Disabled)" };
  if (!extractedText || extractedText.trim().length < 10) return { error: "Extracted text too short.", analysisComplete: false, /* ... other default fields ... */ };

  const MAX_PROMPT_TEXT_SNIPPET = 3000;
  const textForPrompting = extractedText.length > MAX_PROMPT_TEXT_SNIPPET ? extractedText.substring(0, MAX_PROMPT_TEXT_SNIPPET) : extractedText;
  const systemInstructionText = `You are an expert curriculum analyst. Respond ONLY with a valid JSON object. Do not include any other text or markdown. Your entire response must be a single, parsable JSON object.`;
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest", generationConfig, safetySettings, systemInstruction: { role: "system", parts: [{ text: systemInstructionText }] } });
  
  let analysisResultsBuild = {
    lastAnalyzed: new Date().toISOString(),
    analyzedBy: "GeminiWorker-Async-v1.0",
    overallAlignmentScore: 0,
    overallStatusText: "Analysis In Progress...",
    standardAlignmentDetails: { summary: "", findings: [], overallScore: 0, overallStatusText: "" },
    extractedTextSnippet: textForPrompting.substring(0, 200) + "...",
    analysisComplete: false,
    errors: []
  };

  try {
    const admissionsPrompt = `Analyze curriculum text snippet for USAO freshman admissions (English & Math only). Text: """${textForPrompting}""" USAO Req: English: 4 units; Math: 3 units. Respond ONLY with JSON: {"admissionsFindings": [{"standardId": "USAO-HS-ENGLISH", "description": "English", "alignmentStatus": "Met/Partially Met/Gap/Unclear", "reasoning": "brief, max 10 words"}, {"standardId": "USAO-HS-MATH", "description": "Mathematics", "alignmentStatus": "Met/Partially Met/Gap/Unclear", "reasoning": "brief, max 10 words"}]}`;
    console.log("[Worker/generateAnalysis] Sending simplified admissions prompt to Gemini...");
    const admissionsData = await callGeminiAndParseJson(admissionsPrompt, model);
    
    if (admissionsData && Array.isArray(admissionsData.admissionsFindings)) {
      analysisResultsBuild.standardAlignmentDetails.findings = admissionsData.admissionsFindings;
      analysisResultsBuild.standardAlignmentDetails.summary = "Initial USAO admissions assessment (simplified).";
      // ... (calculate scores as before) ...
      const metCount = admissionsData.admissionsFindings.filter(f => f.alignmentStatus === "Met").length;
      const totalReqs = Object.keys(USAO_ADMISSIONS_REQUIREMENTS).filter(k => k === 'englishUnits' || k === 'mathUnits').length;
      const admissionScore = totalReqs > 0 ? Math.round((metCount / totalReqs) * 100) : 0;
      analysisResultsBuild.standardAlignmentDetails.overallScore = admissionScore;
      analysisResultsBuild.overallAlignmentScore = admissionScore;
      analysisResultsBuild.overallStatusText = admissionScore >= 75 ? "Good Initial Alignment" : "Initial Gaps Identified";
      analysisResultsBuild.standardAlignmentDetails.overallStatusText = analysisResultsBuild.overallStatusText;
    } else {
      analysisResultsBuild.errors.push("Admissions analysis from AI was malformed.");
    }
    
    // TODO: Add other analysis calls here (Intro Courses, Industry)
    // If any call fails, add to analysisResultsBuild.errors

    analysisResultsBuild.analysisComplete = analysisResultsBuild.errors.length === 0;
    if (analysisResultsBuild.errors.length > 0) {
        analysisResultsBuild.overallStatusText = "Completed with Errors";
    } else if (analysisResultsBuild.analysisComplete) {
        analysisResultsBuild.overallStatusText = "Completed Successfully";
    }


  } catch (error) {
    console.error("[Worker/generateAnalysis] Critical error during AI analysis:", error.message);
    if (error.rawResponse) console.error("Raw Gemini text for failed call:\n", error.rawResponse);
    analysisResultsBuild.error = "A critical error occurred during AI analysis: " + error.message;
    analysisResultsBuild.analysisComplete = false;
    analysisResultsBuild.overallStatusText = "Failed Critically";
  }
  return analysisResultsBuild;
}

async function extractTextFromFile(fileBuffer, mimeType) {
  // ... (Keep the existing extractTextFromFile function as is)
  console.log(`[extractTextFromFile] Attempting to extract text for mimeType: ${mimeType}`);
  if (mimeType === 'application/pdf') { /* ... */ }
  else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') { /* ... */ }
  else if (mimeType === 'text/plain') { /* ... */ }
  else { throw new Error(`Unsupported file type: ${mimeType}`); }
  // Ensure this function returns the extracted text or throws an error
}

export async function performFullAnalysis(curriculumId) {
  console.log(`[Worker/performFullAnalysis] Starting for curriculum ID: ${curriculumId}`);
  let analysisStatus = "PROCESSING_WORKER";
  let analysisResultsObject = {};
  let analysisErrorMsg = null;

  try {
    const curriculum = await prisma.curriculum.findUnique({ where: { id: String(curriculumId) } });
    if (!curriculum) throw new Error("Curriculum not found in worker.");
    if (!curriculum.filePath) throw new Error("Curriculum filePath is missing in worker.");

    const fileResponse = await fetch(curriculum.filePath);
    if (!fileResponse.ok) throw new Error(`Blob fetch failed: ${fileResponse.statusText}`);
    const fileBuffer = await fileResponse.buffer();
    const mimeType = fileResponse.headers.get('content-type') || 'application/octet-stream';
    
    let extractedText = "";
    try {
      extractedText = await extractTextFromFile(fileBuffer, mimeType);
    } catch (extractionError) {
      console.error(`[Worker/performFullAnalysis] Text extraction failed:`, extractionError.message);
      throw new Error(`Text extraction failed: ${extractionError.message}`);
    }
    
    analysisResultsObject = await generateAnalysisResultsLogic(curriculum, extractedText); // Call the refactored logic

    if (analysisResultsObject.error || (analysisResultsObject.errors && analysisResultsObject.errors.length > 0) ) {
        analysisStatus = "FAILED";
        analysisErrorMsg = analysisResultsObject.error || (analysisResultsObject.errors || []).join('; ');
    } else if (!analysisResultsObject.analysisComplete) { // Should ideally be true if no errors
        analysisStatus = "PARTIAL"; // Or FAILED
        analysisErrorMsg = "AI Analysis did not complete fully or had issues.";
    } else {
        analysisStatus = "COMPLETED";
    }

  } catch (error) {
    console.error(`[Worker/performFullAnalysis] Top-level error for ${curriculumId}:`, error.message, error.stack);
    analysisStatus = "FAILED";
    analysisErrorMsg = error.message || "Unknown worker error.";
    // Ensure analysisResultsObject has some error info if it wasn't set before
    analysisResultsObject.error = analysisResultsObject.error || analysisErrorMsg;
    analysisResultsObject.analysisComplete = false;
    if (!analysisResultsObject.lastAnalyzed) analysisResultsObject.lastAnalyzed = new Date().toISOString();
  } finally {
    console.log(`[Worker/performFullAnalysis] Updating DB for ${curriculumId}, status: ${analysisStatus}, error: ${analysisErrorMsg}`);
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
