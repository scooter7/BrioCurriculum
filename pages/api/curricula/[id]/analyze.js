// File: pages/api/curricula/[id]/analyze.js
import prisma from '../../../../lib/prisma';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import fetch from 'node-fetch';
import path from 'path';

const apiKey = process.env.GEMINI_API_KEY;
let genAI;
if (apiKey) {
  genAI = new GoogleGenerativeAI(apiKey);
} else {
  console.error("GEMINI_API_KEY is not set. AI analysis will be disabled.");
}

const generationConfig = {
  temperature: 0.1, // Lowered for more deterministic JSON output
  topK: 1,
  topP: 0.95,
  maxOutputTokens: 8192,
  responseMimeType: "application/json", // Crucial for enforcing JSON output
};
const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

const USAO_ADMISSIONS_REQUIREMENTS = {
  englishUnits: { required: 4, label: "English (Grammar, Composition, Literature)", keywords: ["english", "literature", "composition", "writing", "grammar", "rhetoric"] },
  mathUnits: { required: 3, label: "Mathematics (Algebra I, Geometry, Algebra II or higher)", keywords: ["math", "algebra", "geometry", "trigonometry", "pre-calculus", "calculus", "statistics"] },
  scienceUnits: { required: 3, label: "Lab Science (Biology, Chemistry, Physics, etc.)", keywords: ["science", "biology", "chemistry", "physics", "lab", "environmental", "physical science"] },
  historyUnits: { required: 3, label: "History & Citizenship (inc. American History)", keywords: ["history", "government", "civics", "social studies", "economics", "geography", "world history", "us history", "american history"] },
  electivesUnits: { required: 2, label: "Electives (Foreign Lang, Comp Sci, other AP)", keywords: ["spanish", "french", "german", "latin", "computer science", "programming", "ap", "advanced placement", "psychology", "sociology", "art", "music", "drama"] },
  totalUnits: 15,
};
const USAO_INTRO_COURSE_THEMES = { /* ... */ }; // Keep as defined before
const REGIONAL_HIGH_GROWTH_INDUSTRIES_OK = [ /* ... */ ]; // Keep as defined before


async function callGeminiAndParseJson(promptContent, modelInstance, attempt = 1, maxAttempts = 2) { // Reduced maxAttempts for faster feedback
  console.log(`[callGeminiAndParseJson] Attempt ${attempt}/${maxAttempts} for prompt (first 100 chars): ${typeof promptContent === 'string' ? promptContent.substring(0,100) : JSON.stringify(promptContent).substring(0,100)}...`);
  let rawTextResponse = "";
  try {
    const result = await modelInstance.generateContent(promptContent);
    const response = result.response;
    rawTextResponse = response.text();
    console.log(`[callGeminiAndParseJson] Raw Gemini response text (length: ${rawTextResponse.length}):\n---\n${rawTextResponse.substring(0, 1000)}...\n---`); // Log more

    // With responseMimeType: "application/json", Gemini should return clean JSON.
    // The ```json ... ``` cleanup might not be necessary but kept as a fallback.
    let jsonText = rawTextResponse;
    const jsonMatch = rawTextResponse.match(/```json\s*([\s\S]*?)\s*```/s);
    if (jsonMatch && jsonMatch[1]) {
      jsonText = jsonMatch[1];
      console.log("[callGeminiAndParseJson] Extracted JSON content from markdown block.");
    } else {
        // If no markdown, assume the whole response is the JSON (or try to find first/last brace if still problematic)
        const firstBrace = jsonText.indexOf('{');
        const lastBrace = jsonText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            jsonText = jsonText.substring(firstBrace, lastBrace + 1);
        } else if (!jsonText.trim().startsWith("{") || !jsonText.trim().endsWith("}")){
             console.warn("[callGeminiAndParseJson] Response does not appear to be JSON or wrapped in markdown. Trying to parse as is.");
        }
    }
    
    jsonText = jsonText.trim();
    if (!jsonText) {
        throw new Error("Extracted JSON text is empty after cleaning.");
    }
    
    const jsonData = JSON.parse(jsonText);
    console.log("[callGeminiAndParseJson] Successfully parsed JSON from Gemini.");
    return jsonData;
  } catch (error) {
    console.error(`[callGeminiAndParseJson] Error on attempt ${attempt}:`, error.message);
    // Log the full raw text on any parsing error for debugging
    console.error("[callGeminiAndParseJson] Full raw text that failed parsing (attempt " + attempt + "):\n>>>>>>>>>>>>\n" + rawTextResponse + "\n<<<<<<<<<<<<");
    
    if (attempt < maxAttempts) {
      console.log(`[callGeminiAndParseJson] Retrying... (${attempt + 1}/${maxAttempts})`);
      await new Promise(resolve => setTimeout(resolve, 2500 * attempt)); // Slightly increased backoff
      return callGeminiAndParseJson(promptContent, modelInstance, attempt + 1, maxAttempts);
    } else {
      console.error("[callGeminiAndParseJson] Max attempts reached. Failed to parse JSON from Gemini.");
      const parseError = new Error(`Failed to get valid JSON from AI after ${maxAttempts} attempts. Last error: ${error.message}. Check server logs for the raw AI response that failed parsing.`);
      parseError.rawResponse = rawTextResponse; // Attach raw response to the error
      throw parseError;
    }
  }
}

async function performRealAnalysisWithGemini(curriculum, extractedText) {
  console.log(`[performRealAnalysisWithGemini] Starting for curriculum: ${curriculum?.name}. Extracted text length: ${extractedText?.length || 0}`);
  if (!genAI) {
    return { 
        lastAnalyzed: new Date().toISOString(), analyzedBy: "GeminiEngine (Disabled)", 
        error: "Gemini API key not configured.", analysisComplete: false,
        extractedTextSnippet: extractedText ? extractedText.substring(0, 200) + "..." : "No text extracted."
    };
  }
  if (!extractedText || extractedText.trim().length < 50) { // Minimal text length
    return { 
        lastAnalyzed: new Date().toISOString(), analyzedBy: "GeminiEngine (Insufficient Text)",
        error: "Extracted text too short for meaningful analysis.", analysisComplete: false,
        overallAlignmentScore: 10, overallStatusText: "Insufficient Data",
        standardAlignmentDetails: { summary: "Not enough text from curriculum to perform analysis.", findings: [], overallScore: 10, overallStatusText: "Insufficient Data"},
        gapAnalysis: { summary: "Cannot perform gap analysis.", identifiedGaps: []},
        regionalIndustryAlignment: { region: "Central Oklahoma", summary: "Cannot perform industry alignment.", topHighGrowthIndustries: [], curriculumAlignmentWithKeyIndustries: []},
        extractedTextSnippet: extractedText ? extractedText.substring(0, 500) + "..." : "No text extracted or text too short.",
    };
  }

  // Truncate text sent to Gemini for each prompt to manage token usage and response time
  const MAX_PROMPT_TEXT_LENGTH = 30000; // Adjust based on model and complexity
  const textForPrompting = extractedText.length > MAX_PROMPT_TEXT_LENGTH 
    ? extractedText.substring(0, MAX_PROMPT_TEXT_LENGTH) 
    : extractedText;

  const systemInstructionText = `You are an expert curriculum analyst. Your task is to evaluate high school curriculum text against specific criteria. Respond ONLY with a valid JSON object as specified in the prompt. Do not include any explanatory text, apologies, or markdown formatting like \`\`\`json or \`\`\` unless it is part of a valid JSON string value itself. Your entire response must be a single, parsable JSON object.`;

  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash-latest",
    generationConfig, // Includes responseMimeType: "application/json"
    safetySettings,
    systemInstruction: { role: "system", parts: [{ text: systemInstructionText }] },
  });

  let analysisResults = {
    lastAnalyzed: new Date().toISOString(),
    analyzedBy: "GeminiAnalysisEngine V1.2",
    overallAlignmentScore: 0,
    overallStatusText: "Analysis In Progress...",
    standardAlignmentDetails: { summary: "", findings: [], overallScore: 0, overallStatusText: "" },
    gapAnalysis: { summary: "", identifiedGaps: [] },
    regionalIndustryAlignment: {
      region: "Central Oklahoma (USAO Service Area)",
      summary: "",
      topHighGrowthIndustries: REGIONAL_HIGH_GROWTH_INDUSTRIES_OK.map(ind => ({ name: ind.name, projectedGrowth: "Varies" })),
      curriculumAlignmentWithKeyIndustries: [],
    },
    extractedTextSnippet: textForPrompting.substring(0, 500) + "...",
    analysisComplete: false,
    errors: [] // To store errors from individual AI calls
  };

  try {
    // 1. USAO Admissions Requirements Analysis
    const admissionsPrompt = `
      Analyze the following curriculum text for alignment with USAO freshman admissions unit requirements.
      Curriculum Text: """${textForPrompting}"""
      USAO Requirements:
      - English: ${USAO_ADMISSIONS_REQUIREMENTS.englishUnits.required} units (${USAO_ADMISSIONS_REQUIREMENTS.englishUnits.label})
      - Math: ${USAO_ADMISSIONS_REQUIREMENTS.mathUnits.required} units (${USAO_ADMISSIONS_REQUIREMENTS.mathUnits.label})
      - Lab Science: ${USAO_ADMISSIONS_REQUIREMENTS.scienceUnits.required} units (${USAO_ADMISSIONS_REQUIREMENTS.scienceUnits.label})
      - History/Citizenship: ${USAO_ADMISSIONS_REQUIREMENTS.historyUnits.required} units (${USAO_ADMISSIONS_REQUIREMENTS.historyUnits.label})
      - Electives: ${USAO_ADMISSIONS_REQUIREMENTS.electivesUnits.required} units (${USAO_ADMISSIONS_REQUIREMENTS.electivesUnits.label})
      
      For each requirement, determine if it's "Met", "Partially Met", "Gap", or "Unclear". Provide brief, factual reasoning (max 30 words) based ONLY on the provided text.
      Your response MUST be a single, valid JSON object with a top-level key "admissionsFindings". This key should hold an array of objects.
      Each object in the array must have these exact keys: "standardId" (string, e.g., "USAO-HS-ENGLISH"), "description" (string, the requirement label), "alignmentStatus" (string, one of "Met", "Partially Met", "Gap", "Unclear"), and "reasoning" (string).
      Example: {"admissionsFindings": [{"standardId": "USAO-HS-ENGLISH", "description": "English (Grammar, Composition, Literature)", "alignmentStatus": "Met", "reasoning": "Curriculum details 4 years of English."}]}
    `; // Removed "Do not include any text outside of this JSON object." as systemInstruction and responseMimeType should handle it.

    console.log("[performRealAnalysisWithGemini] Sending admissions prompt to Gemini...");
    const admissionsData = await callGeminiAndParseJson(admissionsPrompt, model);
    
    if (admissionsData && Array.isArray(admissionsData.admissionsFindings)) {
      analysisResults.standardAlignmentDetails.findings.push(...admissionsData.admissionsFindings);
      analysisResults.standardAlignmentDetails.summary = "Assessed against USAO high school curricular requirements. ";
      const metCount = admissionsData.admissionsFindings.filter(f => f.alignmentStatus === "Met").length;
      const totalReqs = Object.keys(USAO_ADMISSIONS_REQUIREMENTS).filter(k => k !== 'totalUnits').length;
      const admissionScore = totalReqs > 0 ? Math.round((metCount / totalReqs) * 100) : 0;
      analysisResults.standardAlignmentDetails.overallScore = admissionScore;
      if (admissionScore >= 80) analysisResults.standardAlignmentDetails.overallStatusText = "Strongly Aligned with HS Requirements";
      else if (admissionScore >= 60) analysisResults.standardAlignmentDetails.overallStatusText = "Partially Aligned with HS Requirements";
      else analysisResults.standardAlignmentDetails.overallStatusText = "Potential Gaps in HS Requirements";
      analysisResults.overallAlignmentScore = admissionScore; // Base overall score on this for now
      analysisResults.overallStatusText = analysisResults.standardAlignmentDetails.overallStatusText;
    } else {
        const errorMessage = "AI response for admissions was not in the expected JSON format or 'admissionsFindings' array was missing.";
        console.warn("[performRealAnalysisWithGemini] Admissions data from AI error:", errorMessage, "Received data:", admissionsData);
        analysisResults.standardAlignmentDetails.summary += errorMessage;
        analysisResults.standardAlignmentDetails.findings.push({id: "adm-error", standardId: "USAO-HS-ALL", description: "All Requirements", alignmentStatus: "Error", reasoning: errorMessage});
        analysisResults.errors.push(errorMessage);
    }
    
    // TODO: Implement similar calls for USAO_INTRO_COURSE_THEMES and REGIONAL_HIGH_GROWTH_INDUSTRIES_OK
    // Each with its own specific prompt asking for JSON and parsing logic.
    // Remember to add their results to the overall score and status if desired.

    if (analysisResults.gapAnalysis.identifiedGaps.length === 0 && !analysisResults.errors.length) {
        analysisResults.gapAnalysis.summary = analysisResults.gapAnalysis.summary || "No major gaps identified in initial analysis.";
    }
    if (analysisResults.regionalIndustryAlignment.curriculumAlignmentWithKeyIndustries.length === 0 && !analysisResults.errors.length) {
        analysisResults.regionalIndustryAlignment.summary = analysisResults.regionalIndustryAlignment.summary || "Industry alignment requires further specific analysis.";
    }

    analysisResults.analysisComplete = analysisResults.errors.length === 0;
    if (analysisResults.errors.length > 0) {
        analysisResults.overallStatusText = "Analysis Completed with Errors";
    }
    console.log("[performRealAnalysisWithGemini] Analysis generation finished.");

  } catch (error) {
    console.error("[performRealAnalysisWithGemini] Critical error during AI analysis calls:", error.message);
    if (error.rawResponse) { // Check if rawResponse was attached by callGeminiAndParseJson
        console.error("[performRealAnalysisWithGemini] Raw Gemini text that caused parsing error:\n", error.rawResponse);
    }
    analysisResults.error = "An error occurred during AI analysis: " + error.message;
    analysisResults.overallStatusText = "Analysis Failed Critically";
    analysisResults.analysisComplete = false;
  }
  return analysisResults;
}

async function extractTextFromFile(fileBuffer, mimeType) { /* ... same as before ... */ }
export default async function handler(req, res) { /* ... same as before, calls performRealAnalysisWithGemini ... */ }

// Constants should be defined at the top level of the module.
// const USAO_ADMISSIONS_REQUIREMENTS = { /* ... */ };
// const USAO_INTRO_COURSE_THEMES = { /* ... */ };
// const REGIONAL_HIGH_GROWTH_INDUSTRIES_OK = [ /* ... */ ];
