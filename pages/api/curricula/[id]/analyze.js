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
  temperature: 0.1, 
  topK: 1,
  topP: 0.95,
  maxOutputTokens: 4096, // Still allow for a decent JSON response
  responseMimeType: "application/json", // Crucial for enforcing JSON output
};
const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

const USAO_ADMISSIONS_REQUIREMENTS = {
  englishUnits: { required: 4, label: "English (Grammar, Composition, Literature)"},
  mathUnits: { required: 3, label: "Mathematics (Algebra I, Geometry, Algebra II or higher)"},
  scienceUnits: { required: 3, label: "Lab Science (Biology, Chemistry, Physics, etc.)"},
  historyUnits: { required: 3, label: "History & Citizenship (inc. American History)"},
  electivesUnits: { required: 2, label: "Electives (Foreign Lang, Comp Sci, other AP)"},
  totalUnits: 15,
};
// Keep USAO_INTRO_COURSE_THEMES and REGIONAL_HIGH_GROWTH_INDUSTRIES_OK as defined before
const USAO_INTRO_COURSE_THEMES = {
  english: ["composition", "literature analysis", "critical reading skills", "research writing", "communication fundamentals"],
  math: ["college algebra concepts", "functions", "pre-calculus topics", "introductory statistics reasoning", "quantitative problem-solving"],
  science: ["principles of biology (cells, genetics, evolution)", "general chemistry concepts (atomic structure, bonding, reactions)", "foundations of physics (mechanics, energy)", "scientific method and inquiry", "laboratory techniques and data interpretation"],
  humanities: ["survey of american history", "world civilizations overview", "introduction to philosophy and ethics", "foundational concepts in social sciences (e.g., psychology, sociology)"],
  arts: ["art history and appreciation", "music theory fundamentals", "introduction to theatre arts", "elements and principles of design"],
};
const REGIONAL_HIGH_GROWTH_INDUSTRIES_OK = [
  { id: "health", name: "Health Care & Social Assistance", keywords: ["health", "medical", "nursing", "biology", "chemistry", "anatomy", "physiology", "psychology", "social work"], skills: ["Patient Care Fundamentals", "Medical Terminology", "Empathy & Communication", "Scientific Literacy (Biology/Chemistry)", "Data Interpretation", "Ethical Considerations"] },
  { id: "manufacturing", name: "Manufacturing (including Advanced & Aerospace)", keywords: ["manufacturing", "engineering", "aerospace", "aviation", "robotics", "cad", "cam", "industrial technology", "mechanics", "electronics"], skills: ["Technical Aptitude & Problem-Solving", "Applied Mathematics & Physics", "Understanding of Design & Schematics (CAD awareness)", "Quality Control Principles", "Safety Protocols", "Automation Concepts"] },
  { id: "professional_tech", name: "Professional, Scientific, & Technical Services (inc. IT)", keywords: ["business administration", "accounting", "information technology", "it", "computer science", "software development", "cybersecurity", "data analysis", "research", "consulting"], skills: ["Analytical & Critical Thinking", "IT Literacy & Digital Fluency", "Programming Fundamentals (e.g., Python)", "Data Management & Analysis Basics", "Cybersecurity Awareness", "Professional Communication & Collaboration", "Project Management Basics"] },
  { id: "energy", name: "Energy (inc. Oil & Gas, Renewables)", keywords: ["energy", "oil", "gas", "renewable", "wind", "solar", "geology", "environmental science", "engineering"], skills: ["Understanding of Energy Systems", "Environmental Awareness", "Technical Problem Solving", "Safety Regulations", "Data Monitoring & Analysis"] }
];


async function callGeminiAndParseJson(promptContent, modelInstance, attempt = 1, maxAttempts = 2) { // Reduced maxAttempts to 2
  console.log(`[callGeminiAndParseJson] Attempt ${attempt}/${maxAttempts} for prompt (first 100 chars): ${typeof promptContent === 'string' ? promptContent.substring(0,100) : JSON.stringify(promptContent).substring(0,100)}...`);
  let rawTextResponse = "";
  try {
    const result = await modelInstance.generateContent(promptContent);
    const response = result.response;
    rawTextResponse = response.text(); // Get the full text
    // Log more of the raw response to help debug JSON issues
    console.log(`[callGeminiAndParseJson] Raw Gemini response text (length: ${rawTextResponse.length}):\n---\n${rawTextResponse.substring(0, 2500)}...\n---`);

    // With responseMimeType: "application/json", Gemini should return clean JSON.
    // If it's still wrapped, this cleanup might be needed, but ideally not.
    let jsonText = rawTextResponse.trim();
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.substring(7, jsonText.length - 3).trim();
      console.log("[callGeminiAndParseJson] Cleaned markdown from JSON response.");
    } else if (jsonText.startsWith("```")) { // More generic markdown block
        jsonText = jsonText.substring(3, jsonText.length - 3).trim();
        console.log("[callGeminiAndParseJson] Cleaned generic markdown from JSON response.");
    }
    
    if (!jsonText) {
        throw new Error("Extracted JSON text is empty after cleaning.");
    }
    
    const jsonData = JSON.parse(jsonText);
    console.log("[callGeminiAndParseJson] Successfully parsed JSON from Gemini.");
    return jsonData;
  } catch (error) {
    console.error(`[callGeminiAndParseJson] Error on attempt ${attempt}: ${error.message}`);
    console.error("[callGeminiAndParseJson] Full raw text that failed parsing (attempt " + attempt + "):\n>>>>>>>>>>>>\n" + rawTextResponse + "\n<<<<<<<<<<<<");
    
    if (attempt < maxAttempts) {
      console.log(`[callGeminiAndParseJson] Retrying... (${attempt + 1}/${maxAttempts})`);
      await new Promise(resolve => setTimeout(resolve, 3000 * attempt)); // Slightly longer backoff for retries
      return callGeminiAndParseJson(promptContent, modelInstance, attempt + 1, maxAttempts);
    } else {
      console.error("[callGeminiAndParseJson] Max attempts reached. Failed to parse JSON from Gemini.");
      const parseError = new Error(`Failed to get valid JSON from AI after ${maxAttempts} attempts. Last error: ${error.message}. Check server logs for the full raw AI response that failed parsing.`);
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
  if (!extractedText || extractedText.trim().length < 50) {
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

  const MAX_PROMPT_TEXT_LENGTH_ADMISSIONS = 15000; // Reduced for the first, simpler task
  const textForAdmissionsPrompt = extractedText.length > MAX_PROMPT_TEXT_LENGTH_ADMISSIONS 
    ? extractedText.substring(0, MAX_PROMPT_TEXT_LENGTH_ADMISSIONS) 
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
    analyzedBy: "GeminiAnalysisEngine V1.3-debug",
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
    extractedTextSnippet: textForAdmissionsPrompt.substring(0, 500) + "...",
    analysisComplete: false,
    errors: []
  };

  try {
    // 1. USAO Admissions Requirements Analysis (Simplified Request)
    const admissionsPrompt = `
      Analyze the provided curriculum text for alignment with USAO freshman admissions unit requirements.
      Curriculum Text: """${textForAdmissionsPrompt}"""
      USAO Requirements:
      - English: ${USAO_ADMISSIONS_REQUIREMENTS.englishUnits.required} units (${USAO_ADMISSIONS_REQUIREMENTS.englishUnits.label})
      - Math: ${USAO_ADMISSIONS_REQUIREMENTS.mathUnits.required} units (${USAO_ADMISSIONS_REQUIREMENTS.mathUnits.label})
      - Lab Science: ${USAO_ADMISSIONS_REQUIREMENTS.scienceUnits.required} units (${USAO_ADMISSIONS_REQUIREMENTS.scienceUnits.label})
      - History/Citizenship: ${USAO_ADMISSIONS_REQUIREMENTS.historyUnits.required} units (${USAO_ADMISSIONS_REQUIREMENTS.historyUnits.label})
      - Electives: ${USAO_ADMISSIONS_REQUIREMENTS.electivesUnits.required} units (${USAO_ADMISSIONS_REQUIREMENTS.electivesUnits.label})
      
      For each requirement, determine if it's "Met", "Partially Met", "Gap", or "Unclear". Provide brief, factual reasoning (max 25 words) based ONLY on the provided text.
      Your response MUST be a single, valid JSON object with ONLY one top-level key: "admissionsFindings". This key's value must be an array of objects.
      Each object in the "admissionsFindings" array must have these exact keys: "standardId" (string, e.g., "USAO-HS-ENGLISH"), "description" (string, the requirement label), "alignmentStatus" (string: "Met", "Partially Met", "Gap", or "Unclear"), and "reasoning" (string).
      Do not add any other keys or text outside this JSON structure.
      Example: {"admissionsFindings": [{"standardId": "USAO-HS-MATH", "description": "Mathematics (Algebra I, Geometry, Algebra II or higher)", "alignmentStatus": "Met", "reasoning": "Covers Algebra I, Geometry, and Algebra II."}]}
    `;

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
      analysisResults.overallAlignmentScore = admissionScore;
      analysisResults.overallStatusText = analysisResults.standardAlignmentDetails.overallStatusText;
    } else {
        const errorMessage = "AI response for admissions was not in the expected JSON format or 'admissionsFindings' array was missing.";
        console.warn("[performRealAnalysisWithGemini] Admissions data from AI error:", errorMessage, "Received data:", admissionsData);
        analysisResults.standardAlignmentDetails.summary += errorMessage;
        analysisResults.standardAlignmentDetails.findings.push({id: "adm-error", standardId: "USAO-HS-ALL", description: "All Requirements", alignmentStatus: "Error", reasoning: errorMessage});
        analysisResults.errors.push(errorMessage);
    }
    
    // TODO: Implement other analysis calls here (Intro Courses, Industry)
    // For now, we only run the admissions analysis to debug and avoid timeouts.

    analysisResults.analysisComplete = analysisResults.errors.length === 0;
    if (analysisResults.errors.length > 0) {
        analysisResults.overallStatusText = "Analysis Completed with Errors";
    }
    console.log("[performRealAnalysisWithGemini] Analysis generation finished.");

  } catch (error) {
    console.error("[performRealAnalysisWithGemini] Critical error during AI analysis calls:", error.message);
    if (error.rawResponse) {
        console.error("[performRealAnalysisWithGemini] Raw Gemini text that caused parsing error:\n", error.rawResponse);
    }
    analysisResults.error = "An error occurred during AI analysis: " + error.message;
    analysisResults.overallStatusText = "Analysis Failed Critically";
    analysisResults.analysisComplete = false;
  }
  return analysisResults;
}

async function extractTextFromFile(fileBuffer, mimeType) { /* ... same as before ... */ }
export default async function handler(req, res) { /* ... same as before ... */ }
