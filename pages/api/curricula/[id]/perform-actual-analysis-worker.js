// File: pages/api/curricula/[id]/perform-actual-analysis-worker.js
import prisma from '../../../../lib/prisma';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import fetch from 'node-fetch';

const apiKey = process.env.GEMINI_API_KEY;
let genAI;
if (apiKey) {
  genAI = new GoogleGenerativeAI(apiKey);
} else {
  console.error("[Worker] GEMINI_API_KEY is not set. AI analysis will be disabled.");
}

const generationConfig = {
  temperature: 0.1,
  topK: 1,
  topP: 0.95,
  maxOutputTokens: 1024, // Keep small for this focused test
  responseMimeType: "application/json",
};
const safetySettings = [ /* ... same ... */ ];
const USAO_ADMISSIONS_REQUIREMENTS_SIMPLIFIED = {
  englishUnits: { required: 4, label: "English" },
  // mathUnits: { required: 3, label: "Mathematics" }, // Further simplify, only one item for now
};

async function callGeminiAndParseJson(promptContent, modelInstance, attempt = 1, maxAttempts = 1) { // MAX 1 ATTEMPT
  console.log(`[Worker/callGemini] Attempt ${attempt}/${maxAttempts}. Prompt: "${String(promptContent).substring(0, 150)}..."`);
  let rawTextResponse = "No response received from AI."; // Default for error cases
  try {
    const result = await modelInstance.generateContent(promptContent);
    const response = result.response;
    rawTextResponse = response.text();
    // LOG THE ENTIRE RAW RESPONSE FROM GEMINI
    console.log(`[Worker/callGemini] RAW GEMINI RESPONSE (Attempt ${attempt}, Length: ${rawTextResponse.length}):\n>>>>>>>>>>>> START OF GEMINI RAW RESPONSE >>>>>>>>>>>>\n${rawTextResponse}\n<<<<<<<<<<<< END OF GEMINI RAW RESPONSE <<<<<<<<<<<<`);

    let jsonText = rawTextResponse.trim();
    // If responseMimeType: "application/json" is working, no further cleaning should be needed.
    // Add back minimal cleaning if issues persist.
    // if (jsonText.startsWith("```json")) { /* ... */ } else if (jsonText.startsWith("```")) { /* ... */ }
    
    if (!jsonText) {
        const emptyError = new Error("Cleaned JSON text from Gemini is empty.");
        emptyError.rawResponse = rawTextResponse;
        throw emptyError;
    }
    
    const jsonData = JSON.parse(jsonText); // This is where "Unexpected token 'A'" would happen if not JSON
    console.log("[Worker/callGemini] Successfully parsed JSON from Gemini.");
    return jsonData;
  } catch (error) {
    console.error(`[Worker/callGemini] ERROR ON ATTEMPT ${attempt}: ${error.message}`);
    // Raw response was logged above.
    const enhancedError = new Error(`Failed to get valid JSON from AI (attempt ${attempt}). Last error: ${error.message}.`);
    enhancedError.rawResponse = rawTextResponse; // Attach raw response to the error
    throw enhancedError; // Re-throw to be caught by performRealAnalysisLogic
  }
}

async function generateRealAnalysisResults(curriculum, extractedText) {
  console.log(`[Worker/generateReal] For: ${curriculum?.name}. Text length: ${extractedText?.length || 0}`);
  if (!genAI) return { error: "Gemini API key not configured.", analysisComplete: false, lastAnalyzed: new Date().toISOString(), analyzedBy: "GeminiEngine (Disabled)" };
  if (!extractedText || extractedText.trim().length < 20) { // Very short text minimum for this test
    return { 
        error: "Extracted text too short for analysis (min 20 chars).", analysisComplete: false,
        lastAnalyzed: new Date().toISOString(), analyzedBy: "GeminiEngine (Insufficient Text)",
        overallAlignmentScore: 5, overallStatusText: "Insufficient Data",
        standardAlignmentDetails: { summary: "Not enough text from curriculum to perform analysis.", findings: []},
        extractedTextSnippet: extractedText ? extractedText.substring(0, 100) + "..." : "No text extracted.",
    };
  }

  const MAX_TEXT_SNIPPET = 500; // EXTREMELY reduced text snippet for this focused JSON test
  const textForPrompting = extractedText.length > MAX_TEXT_SNIPPET ? extractedText.substring(0, MAX_TEXT_SNIPPET) : extractedText;
  
  const systemInstructionText = `You are an expert curriculum analyst. Respond ONLY with a valid JSON object. Your entire response must be a single, parsable JSON object. Do not include any markdown, explanations, or conversational text outside of the JSON structure requested.`;
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest", generationConfig, safetySettings, systemInstruction: { role: "system", parts: [{ text: systemInstructionText }] } });
  
  let analysisResultsBuild = {
    lastAnalyzed: new Date().toISOString(),
    analyzedBy: "GeminiWorker-SuperSimple-v1.0",
    overallStatusText: "Analysis In Progress...",
    standardAlignmentDetails: { summary: "Awaiting simple admissions check.", findings: [] },
    extractedTextSnippet: textForPrompting.substring(0, 100) + "...",
    analysisComplete: false,
    errors: []
  };

  try {
    // EXTREMELY Simplified Admissions Requirements Prompt for Debugging JSON output
    const admissionsPrompt = `
      Based on the Curriculum Text Snippet, assess ONLY the English requirement (4 units).
      Curriculum Text Snippet: """${textForPrompting}"""
      Requirement: English: ${USAO_ADMISSIONS_REQUIREMENTS_SIMPLIFIED.englishUnits.required} units.
      Your response MUST be a single, valid JSON object with ONLY one top-level key: "englishAnalysis".
      This key's value must be an object with two keys: "alignmentStatus" (string: "Met", "Partially Met", "Gap", or "Unclear") and "reasoning" (string, strictly max 5 words).
      Example: {"englishAnalysis": {"alignmentStatus": "Met", "reasoning": "Appears to cover requirements."}}
    `;

    console.log("[Worker/generateReal] Sending SUPER SIMPLIFIED prompt to Gemini...");
    const admissionsData = await callGeminiAndParseJson(admissionsPrompt, model);
    
    if (admissionsData && admissionsData.englishAnalysis && typeof admissionsData.englishAnalysis.alignmentStatus === 'string') {
      analysisResultsBuild.standardAlignmentDetails.findings.push({
          standardId: "USAO-HS-ENGLISH-SIMPLE",
          description: "English Unit Requirement (Simplified Check)",
          alignmentStatus: admissionsData.englishAnalysis.alignmentStatus,
          reasoning: admissionsData.englishAnalysis.reasoning || "N/A"
      });
      analysisResultsBuild.standardAlignmentDetails.summary = "Simplified USAO English admissions assessment complete.";
      analysisResultsBuild.overallStatusText = `English: ${admissionsData.englishAnalysis.alignmentStatus}`;
      analysisResultsBuild.analysisComplete = true; // Mark as complete if this one part worked
    } else {
      analysisResultsBuild.errors.push("Simplified admissions analysis from AI was malformed or key 'englishAnalysis' was missing.");
      analysisResultsBuild.overallStatusText = "Partial Failure (AI Format Error)";
      console.warn("[Worker/generateReal] Simplified admissions data error. Received:", admissionsData);
    }

  } catch (error) {
    console.error("[Worker/generateReal] Critical error during simplified AI analysis:", error.message);
    if (error.rawResponse) console.error("Raw Gemini text for failed call:\n", error.rawResponse);
    analysisResultsBuild.errors.push("Critical error in AI call: " + error.message);
    analysisResultsBuild.overallStatusText = "Failed Critically (AI Call)";
    analysisResultsBuild.analysisComplete = false; // Ensure this is false on error
  }
  return analysisResultsBuild;
}

async function extractTextFromFile(fileBuffer, mimeType) {
  // ... (Keep the existing robust extractTextFromFile function) ...
}

export async function performFullAnalysis(curriculumId) {
  console.log(`[Worker/performFullAnalysis] Starting for curriculum ID: ${curriculumId}`);
  let analysisStatus = "PROCESSING"; // Default to PROCESSING
  let analysisResultsObject = {
    lastAnalyzed: new Date().toISOString(),
    analyzedBy: "GeminiWorker-Async",
    error: "Analysis initiated.",
    analysisComplete: false,
  };
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
    
    analysisResultsObject = await generateRealAnalysisResults(curriculum, extractedText);

    if (analysisResultsObject.error || (analysisResultsObject.errors && analysisResultsObject.errors.length > 0) ) {
        analysisStatus = "FAILED";
        analysisErrorMsg = analysisResultsObject.error || (analysisResultsObject.errors || []).join('; ');
    } else if (!analysisResultsObject.analysisComplete) {
        analysisStatus = "FAILED"; // If analysisComplete is false and no specific error, still treat as failed for simplicity
        analysisErrorMsg = "AI Analysis did not complete as expected.";
    } else {
        analysisStatus = "COMPLETED";
    }

  } catch (error) {
    console.error(`[Worker/performFullAnalysis] Top-level error for ${curriculumId}:`, error.message, error.stack);
    analysisStatus = "FAILED";
    analysisErrorMsg = error.message || "Unknown worker error.";
    analysisResultsObject.error = analysisResultsObject.error || analysisErrorMsg; // Preserve existing error if any
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
