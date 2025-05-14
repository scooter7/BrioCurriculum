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
  temperature: 0.2, 
  topK: 1,
  topP: 0.95,
  maxOutputTokens: 8192, // Increased for potentially larger JSON, Gemini 1.5 Flash supports larger
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
const USAO_INTRO_COURSE_THEMES = { /* ... as defined before ... */ };
const REGIONAL_HIGH_GROWTH_INDUSTRIES_OK = [ /* ... as defined before ... */ ];


async function callGeminiAndParseJson(prompt, modelInstance, attempt = 1, maxAttempts = 3) {
  console.log(`[callGeminiAndParseJson] Attempt ${attempt} for prompt (first 100 chars): ${prompt.substring(0,100)}...`);
  let rawTextResponse = ""; // To store the full raw text for debugging
  try {
    const result = await modelInstance.generateContent(prompt);
    const response = result.response;
    rawTextResponse = response.text(); // Get the full text
    console.log(`[callGeminiAndParseJson] Raw Gemini response text (length: ${rawTextResponse.length}):\n---\n${rawTextResponse.substring(0, 500)}...\n---`);

    // Try to extract JSON from within markdown code blocks if present
    let jsonText = rawTextResponse;
    const jsonMatch = rawTextResponse.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      jsonText = jsonMatch[1];
      console.log("[callGeminiAndParseJson] Extracted JSON content from markdown block.");
    } else {
        // If no markdown block, try to find the first '{' and last '}'
        // This is a more aggressive attempt if the LLM doesn't use markdown but might add leading/trailing text.
        const firstBrace = jsonText.indexOf('{');
        const lastBrace = jsonText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            jsonText = jsonText.substring(firstBrace, lastBrace + 1);
            console.log("[callGeminiAndParseJson] Extracted JSON content by finding first/last braces.");
        }
    }
    
    jsonText = jsonText.trim(); // Trim any whitespace around the extracted/original text
    
    const jsonData = JSON.parse(jsonText);
    console.log("[callGeminiAndParseJson] Successfully parsed JSON from Gemini.");
    return jsonData;
  } catch (error) {
    console.error(`[callGeminiAndParseJson] Error on attempt ${attempt}:`, error.message);
    console.error("[callGeminiAndParseJson] Full raw text that failed parsing:\n", rawTextResponse); // Log the full raw text on error
    if (attempt < maxAttempts) {
      console.log(`[callGeminiAndParseJson] Retrying... (${attempt + 1}/${maxAttempts})`);
      await new Promise(resolve => setTimeout(resolve, 1500 * attempt)); // Slightly longer backoff
      return callGeminiAndParseJson(prompt, modelInstance, attempt + 1, maxAttempts);
    } else {
      console.error("[callGeminiAndParseJson] Max attempts reached. Failed to parse JSON from Gemini.");
      // Pass the raw text in the error for better debugging
      const parseError = new Error(`Failed to get valid JSON from AI after ${maxAttempts} attempts. Last error: ${error.message}.`);
      parseError.rawText = rawTextResponse; // Attach raw text to the error
      throw parseError;
    }
  }
}

async function performRealAnalysisWithGemini(curriculum, extractedText) {
  // ... (rest of the function as before, ensuring it calls the updated callGeminiAndParseJson) ...
  // ... (and that it handles errors from callGeminiAndParseJson, potentially logging error.rawText)
  console.log(`[performRealAnalysisWithGemini] Starting for curriculum: ${curriculum?.name}. Extracted text length: ${extractedText?.length || 0}`);
  if (!genAI) {
    return { 
        lastAnalyzed: new Date().toISOString(), analyzedBy: "GeminiEngine (Disabled)", 
        error: "Gemini API key not configured.", analysisComplete: false,
        extractedTextSnippet: extractedText ? extractedText.substring(0, 200) + "..." : "No text extracted."
    };
  }
  if (!extractedText || extractedText.trim().length < 100) {
    return { 
        lastAnalyzed: new Date().toISOString(), analyzedBy: "GeminiEngine (Insufficient Text)",
        error: "Extracted text too short for analysis.", analysisComplete: false,
        overallAlignmentScore: 20, overallStatusText: "Insufficient Data for Analysis",
        standardAlignmentDetails: { summary: "Not enough text from curriculum to perform analysis.", findings: [], overallScore: 20, overallStatusText: "Insufficient Data"},
        gapAnalysis: { summary: "Cannot perform gap analysis due to insufficient text.", identifiedGaps: []},
        regionalIndustryAlignment: { region: "Central Oklahoma", summary: "Cannot perform industry alignment due to insufficient text.", topHighGrowthIndustries: [], curriculumAlignmentWithKeyIndustries: []},
        extractedTextSnippet: extractedText ? extractedText.substring(0, 500) + "..." : "No text extracted or text too short.",
    };
  }

  const MAX_TEXT_LENGTH = 700000; // Gemini 1.5 Flash has a large context window (1M tokens, ~3M chars)
                                  // Let's use a generous limit, but be mindful of processing time/cost.
  let textToAnalyze = extractedText.length > MAX_TEXT_LENGTH ? extractedText.substring(0, MAX_TEXT_LENGTH) : extractedText;

  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash-latest",
    generationConfig,
    safetySettings,
    systemInstruction: "You are an expert curriculum analyst. Your goal is to evaluate the provided high school curriculum text against specific criteria (USAO admissions, USAO introductory course themes, and regional Oklahoma high-growth industries). Provide structured, factual, and concise evaluations. When asked for JSON, ensure your output is valid JSON and nothing else."
  });

  let analysisResults = {
    lastAnalyzed: new Date().toISOString(),
    analyzedBy: "GeminiAnalysisEngine V1.1",
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
    extractedTextSnippet: textToAnalyze.substring(0, 500) + "...",
    analysisComplete: false,
  };

  try {
    const admissionsPrompt = `
      Analyze the following extracted curriculum text for alignment with USAO freshman admissions requirements.
      Curriculum Text: """${textToAnalyze}"""
      USAO Requirements:
      - English: ${USAO_ADMISSIONS_REQUIREMENTS.englishUnits.required} units (${USAO_ADMISSIONS_REQUIREMENTS.englishUnits.label})
      - Math: ${USAO_ADMISSIONS_REQUIREMENTS.mathUnits.required} units (${USAO_ADMISSIONS_REQUIREMENTS.mathUnits.label})
      - Lab Science: ${USAO_ADMISSIONS_REQUIREMENTS.scienceUnits.required} units (${USAO_ADMISSIONS_REQUIREMENTS.scienceUnits.label})
      - History/Citizenship: ${USAO_ADMISSIONS_REQUIREMENTS.historyUnits.required} units (${USAO_ADMISSIONS_REQUIREMENTS.historyUnits.label})
      - Electives: ${USAO_ADMISSIONS_REQUIREMENTS.electivesUnits.required} units (${USAO_ADMISSIONS_REQUIREMENTS.electivesUnits.label})
      
      For each requirement, determine if it's "Met", "Partially Met", "Gap", or "Unclear". Provide brief reasoning.
      Respond ONLY with a valid JSON object (no surrounding text or markdown) with a key "admissionsFindings", which is an array of objects.
      Each object in the array should have: "standardId" (e.g., "USAO-HS-ENGLISH"), "description" (the requirement label), "alignmentStatus" (string), and "reasoning" (string, max 100 words).
      Example for one item: {"standardId": "USAO-HS-ENGLISH", "description": "English (Grammar, Composition, Literature)", "alignmentStatus": "Met", "reasoning": "The curriculum details extensive coursework in literature and composition across multiple years."}
    `;
    const admissionsData = await callGeminiAndParseJson(admissionsPrompt, model);
    if (admissionsData && admissionsData.admissionsFindings) {
      analysisResults.standardAlignmentDetails.findings.push(...admissionsData.admissionsFindings);
      analysisResults.standardAlignmentDetails.summary = "Assessed against USAO high school curricular requirements. ";
      const metCount = admissionsData.admissionsFindings.filter(f => f.alignmentStatus === "Met").length;
      const totalReqs = Object.keys(USAO_ADMISSIONS_REQUIREMENTS).filter(k => k !== 'totalUnits').length;
      const admissionScore = totalReqs > 0 ? Math.round((metCount / totalReqs) * 100) : 0;
      analysisResults.standardAlignmentDetails.overallScore = admissionScore;
      if (admissionScore >= 80) analysisResults.standardAlignmentDetails.overallStatusText = "Strongly Aligned with HS Requirements";
      else if (admissionScore >= 60) analysisResults.standardAlignmentDetails.overallStatusText = "Partially Aligned with HS Requirements";
      else analysisResults.standardAlignmentDetails.overallStatusText = "Gaps in HS Requirements";
      analysisResults.overallAlignmentScore = admissionScore;
      analysisResults.overallStatusText = analysisResults.standardAlignmentDetails.overallStatusText;
    } else {
        analysisResults.standardAlignmentDetails.summary += "Could not determine admissions alignment from AI. ";
        analysisResults.standardAlignmentDetails.findings.push({id: "adm-error", standardId: "USAO-HS-ALL", description: "All Requirements", alignmentStatus: "Error", reasoning: "AI response for admissions was not in the expected JSON format."});
    }
    
    // TODO: Implement similar calls for USAO_INTRO_COURSE_THEMES and REGIONAL_HIGH_GROWTH_INDUSTRIES_OK
    // Ensure prompts for these also explicitly ask for ONLY a valid JSON object as the response.

    if (analysisResults.gapAnalysis.identifiedGaps.length === 0) {
        analysisResults.gapAnalysis.summary = analysisResults.gapAnalysis.summary || "Further analysis needed for detailed gaps beyond admissions.";
    }
    if (analysisResults.regionalIndustryAlignment.curriculumAlignmentWithKeyIndustries.length === 0) {
        analysisResults.regionalIndustryAlignment.summary = analysisResults.regionalIndustryAlignment.summary || "Further analysis needed for detailed industry alignment.";
    }

    analysisResults.analysisComplete = true;
    console.log("[performRealAnalysisWithGemini] Analysis generation complete.");

  } catch (error) {
    console.error("[performRealAnalysisWithGemini] Error during AI analysis calls:", error.message);
    if (error.rawText) { // Log raw text if it was attached to the error by callGeminiAndParseJson
        console.error("[performRealAnalysisWithGemini] Raw Gemini text that caused parsing error:\n", error.rawText);
    }
    analysisResults.error = "An error occurred during AI analysis: " + error.message;
    analysisResults.overallStatusText = "Analysis Failed";
    analysisResults.analysisComplete = false;
  }
  return analysisResults;
}

// --- File Text Extraction Helper ---
async function extractTextFromFile(fileBuffer, mimeType) { /* ... same as before ... */ }

// --- API Route Handler ---
export default async function handler(req, res) { /* ... same as before, ensuring it calls performRealAnalysisWithGemini ... */ }

// Make sure the constants are defined or imported if they were moved
// const USAO_ADMISSIONS_REQUIREMENTS = { /* ... */ };
// const USAO_INTRO_COURSE_THEMES = { /* ... */ };
// const REGIONAL_HIGH_GROWTH_INDUSTRIES_OK = [ /* ... */ ];
// The API handler and text extraction function should be complete as in the previous version.
// The main change is within performRealAnalysisWithGemini and callGeminiAndParseJson.
