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
  maxOutputTokens: 8192, 
  // Explicitly ask for JSON output if the model/API version supports it directly
  // responseMimeType: "application/json", // For Gemini 1.5 models, this is preferred
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
const USAO_INTRO_COURSE_THEMES = { /* ... */ };
const REGIONAL_HIGH_GROWTH_INDUSTRIES_OK = [ /* ... */ ];

async function callGeminiAndParseJson(promptContent, modelInstance, attempt = 1, maxAttempts = 3) {
  console.log(`[callGeminiAndParseJson] Attempt ${attempt} for prompt (first 100 chars): ${typeof promptContent === 'string' ? promptContent.substring(0,100) : JSON.stringify(promptContent).substring(0,100)}...`);
  let rawTextResponse = "";
  try {
    // For models that support explicit JSON output mode, this is preferred.
    // If using "gemini-1.5-flash-latest" or "gemini-1.5-pro-latest",
    // ensure `responseMimeType: "application/json"` is in generationConfig for the model.
    // The current SDK might infer this if the prompt asks for JSON.

    const result = await modelInstance.generateContent(promptContent);
    const response = result.response;
    rawTextResponse = response.text();
    console.log(`[callGeminiAndParseJson] Raw Gemini response text (length: ${rawTextResponse.length}):\n---\n${rawTextResponse.substring(0, 800)}...\n---`); // Log more of the response

    // Try to extract JSON from within markdown code blocks if present
    let jsonText = rawTextResponse;
    const jsonMatch = rawTextResponse.match(/```json\s*([\s\S]*?)\s*```/s); // Added 's' flag for multiline
    if (jsonMatch && jsonMatch[1]) {
      jsonText = jsonMatch[1];
      console.log("[callGeminiAndParseJson] Extracted JSON content from markdown block.");
    } else {
        // If no markdown block, try to find the first '{' and last '}' aggressively
        const firstBrace = jsonText.indexOf('{');
        const lastBrace = jsonText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            jsonText = jsonText.substring(firstBrace, lastBrace + 1);
            console.log("[callGeminiAndParseJson] Extracted JSON content by finding first/last braces.");
        } else {
            console.log("[callGeminiAndParseJson] Could not reliably isolate JSON block using braces.");
            // If extraction is still problematic, the rawTextResponse itself might be the JSON
            // or it might contain non-JSON text. JSON.parse will throw if it's not pure JSON.
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
    // Log more details from the error object if available, and the rawTextResponse
    if (error.response && error.response.promptFeedback) {
        console.error("[callGeminiAndParseJson] Prompt Feedback:", JSON.stringify(error.response.promptFeedback, null, 2));
    }
    console.error("[callGeminiAndParseJson] Full raw text that failed parsing (attempt " + attempt + "):\n>>>>>>>>>>>>\n" + rawTextResponse + "\n<<<<<<<<<<<<");
    
    if (attempt < maxAttempts) {
      console.log(`[callGeminiAndParseJson] Retrying... (${attempt + 1}/${maxAttempts})`);
      await new Promise(resolve => setTimeout(resolve, 2000 * attempt)); // Increased backoff
      // Pass the original promptContent, not the potentially modified jsonText
      return callGeminiAndParseJson(promptContent, modelInstance, attempt + 1, maxAttempts);
    } else {
      console.error("[callGeminiAndParseJson] Max attempts reached. Failed to parse JSON from Gemini.");
      const parseError = new Error(`Failed to get valid JSON from AI after ${maxAttempts} attempts. Last error: ${error.message}. Check server logs for raw AI response.`);
      // parseError.rawText = rawTextResponse; // Client won't see this, but good for server log
      throw parseError;
    }
  }
}

async function performRealAnalysisWithGemini(curriculum, extractedText) {
  // ... (Setup and checks for genAI and extractedText as before) ...
  if (!genAI) { /* ... return error ... */ }
  if (!extractedText || extractedText.trim().length < 50) { /* ... return insufficient data error ... */ }

  const MAX_TEXT_LENGTH = 700000; 
  let textToAnalyze = extractedText.length > MAX_TEXT_LENGTH ? extractedText.substring(0, MAX_TEXT_LENGTH) : extractedText;

  // Explicitly tell Gemini to output JSON in the system instruction.
  // And for each specific prompt, reiterate this.
  const systemInstructionText = `You are an expert curriculum analyst. Your task is to evaluate high school curriculum text against specific criteria. Respond ONLY with a valid JSON object. Do not include any explanatory text, apologies, or markdown formatting like \`\`\`json or \`\`\` unless it is part of the valid JSON string itself. Your entire response must be a single, parsable JSON object.`;

  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash-latest",
    generationConfig: { ...generationConfig, responseMimeType: "application/json" }, // Enforce JSON output
    safetySettings,
    systemInstruction: { role: "system", parts: [{ text: systemInstructionText }] },
  });

  let analysisResults = { /* ... initial structure as before ... */ };

  try {
    const admissionsPrompt = `
      Analyze the provided curriculum text solely for alignment with USAO freshman admissions unit requirements.
      Curriculum Text Snippet: """${textToAnalyze.substring(0, 20000)}""" (Consider relevant sections for brevity if full text is too long for this specific query)
      USAO Requirements:
      - English: ${USAO_ADMISSIONS_REQUIREMENTS.englishUnits.required} units (${USAO_ADMISSIONS_REQUIREMENTS.englishUnits.label})
      - Math: ${USAO_ADMISSIONS_REQUIREMENTS.mathUnits.required} units (${USAO_ADMISSIONS_REQUIREMENTS.mathUnits.label})
      - Lab Science: ${USAO_ADMISSIONS_REQUIREMENTS.scienceUnits.required} units (${USAO_ADMISSIONS_REQUIREMENTS.scienceUnits.label})
      - History/Citizenship: ${USAO_ADMISSIONS_REQUIREMENTS.historyUnits.required} units (${USAO_ADMISSIONS_REQUIREMENTS.historyUnits.label})
      - Electives: ${USAO_ADMISSIONS_REQUIREMENTS.electivesUnits.required} units (${USAO_ADMISSIONS_REQUIREMENTS.electivesUnits.label})
      
      For each requirement, determine if it's "Met", "Partially Met", "Gap", or "Unclear". Provide brief, factual reasoning based *only* on the provided text.
      Your response MUST be a single, valid JSON object with a top-level key "admissionsFindings". This key should hold an array of objects.
      Each object in the array must have these exact keys: "standardId" (string, e.g., "USAO-HS-ENGLISH"), "description" (string, the requirement label), "alignmentStatus" (string, one of "Met", "Partially Met", "Gap", "Unclear"), and "reasoning" (string, brief, max 50 words).
      Do not include any text outside of this JSON object.
      Example: {"admissionsFindings": [{"standardId": "USAO-HS-ENGLISH", "description": "English (Grammar, Composition, Literature)", "alignmentStatus": "Met", "reasoning": "Curriculum details 4 years of English with literature and composition."}]}
    `;

    console.log("[performRealAnalysisWithGemini] Sending admissions prompt to Gemini...");
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
        const defaultMessage = "AI response for admissions was not in the expected JSON format or data was missing.";
        analysisResults.standardAlignmentDetails.summary += defaultMessage;
        analysisResults.standardAlignmentDetails.findings.push({id: "adm-error", standardId: "USAO-HS-ALL", description: "All Requirements", alignmentStatus: "Error", reasoning: defaultMessage});
        console.warn("[performRealAnalysisWithGemini] Admissions data from AI was not in expected format:", admissionsData);
    }

    // TODO: Implement similar calls for USAO_INTRO_COURSE_THEMES and REGIONAL_HIGH_GROWTH_INDUSTRIES_OK
    // Each with its own specific prompt asking for JSON and parsing logic.

    analysisResults.analysisComplete = true;
    console.log("[performRealAnalysisWithGemini] Analysis generation complete.");

  } catch (error) {
    console.error("[performRealAnalysisWithGemini] Error during AI analysis calls:", error.message);
    if (error.rawText) {
        console.error("[performRealAnalysisWithGemini] Raw Gemini text that caused parsing error:\n", error.rawText);
    }
    analysisResults.error = "An error occurred during AI analysis: " + error.message;
    analysisResults.overallStatusText = "Analysis Failed";
    analysisResults.analysisComplete = false;
  }
  return analysisResults;
}

// ... (extractTextFromFile function remains the same) ...
// ... (default API handler function remains the same, ensuring it calls performRealAnalysisWithGemini) ...
// Ensure USAO_INTRO_COURSE_THEMES and REGIONAL_HIGH_GROWTH_INDUSTRIES_OK are defined as before.

async function extractTextFromFile(fileBuffer, mimeType) {
  console.log(`[extractTextFromFile] Attempting to extract text for mimeType: ${mimeType}`);
  if (mimeType === 'application/pdf') {
    try {
      const data = await pdf(fileBuffer);
      console.log(`[extractTextFromFile] PDF text extracted. Length: ${data.text.length}`);
      return data.text;
    } catch (error) {
      console.error("[extractTextFromFile] Error parsing PDF:", error);
      throw new Error("Failed to parse PDF content.");
    }
  } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') { // DOCX
    try {
      const { value } = await mammoth.extractRawText({ buffer: fileBuffer });
      console.log(`[extractTextFromFile] DOCX text extracted. Length: ${value.length}`);
      return value;
    } catch (error) {
      console.error("[extractTextFromFile] Error parsing DOCX:", error);
      throw new Error("Failed to parse DOCX content.");
    }
  } else if (mimeType === 'text/plain') {
    try {
      const text = fileBuffer.toString('utf8');
      console.log(`[extractTextFromFile] TXT text extracted. Length: ${text.length}`);
      return text;
    } catch (error) {
      console.error("[extractTextFromFile] Error parsing TXT:", error);
      throw new Error("Failed to parse TXT content.");
    }
  } else {
    console.warn(`[extractTextFromFile] Unsupported mimeType for text extraction: ${mimeType}`);
    throw new Error(`Unsupported file type for text extraction: ${mimeType}`);
  }
}

export default async function handler(req, res) {
  const { id } = req.query;
  console.log(`[API /analyze] Received request for curriculum ID: ${id}`);

  if (req.method === 'POST') {
    try {
      console.log(`[API /analyze] Fetching curriculum ${id}...`);
      const curriculum = await prisma.curriculum.findUnique({
        where: { id: String(id) },
      });

      if (!curriculum) {
        console.log(`[API /analyze] Curriculum ${id} not found.`);
        return res.status(404).json({ error: "Curriculum not found." });
      }
      if (!curriculum.filePath) {
        console.log(`[API /analyze] Curriculum ${id} has no filePath for analysis.`);
        return res.status(400).json({ error: "Curriculum file path is missing. Cannot analyze." });
      }
      console.log(`[API /analyze] Curriculum ${id} found. FilePath: ${curriculum.filePath}`);

      console.log(`[API /analyze] Fetching file from Blob: ${curriculum.filePath}`);
      const fileResponse = await fetch(curriculum.filePath);
      if (!fileResponse.ok) {
        throw new Error(`Failed to fetch file from Blob storage: ${fileResponse.status} ${fileResponse.statusText}`);
      }
      const fileBuffer = await fileResponse.buffer();
      const mimeType = fileResponse.headers.get('content-type') || 'application/octet-stream';
      console.log(`[API /analyze] File fetched. Size: ${fileBuffer.length}, MIME Type: ${mimeType}`);

      let extractedText = "";
      try {
        extractedText = await extractTextFromFile(fileBuffer, mimeType);
      } catch (extractionError) {
        console.error(`[API /analyze] Text extraction failed for ${curriculum.name}:`, extractionError.message);
        extractedText = `Text extraction failed: ${extractionError.message}. Cannot perform AI analysis.`;
        const analysisWithError = { 
            lastAnalyzed: new Date().toISOString(), analyzedBy: "AnalysisPreProcessor",
            error: "Text extraction failed.", extractedTextSnippet: extractedText.substring(0,500),
            analysisComplete: false,
            overallStatusText: "Text Extraction Failed"
        };
        const updatedCurriculumWithError = await prisma.curriculum.update({
            where: { id: String(id) }, data: { analysisResults: analysisWithError },
        });
        return res.status(200).json({ 
            message: "Text extraction failed. Analysis could not be performed.", 
            curriculum: { ...updatedCurriculumWithError, analysisResults: analysisWithError, uploadedAt: updatedCurriculumWithError.uploadedAt.toISOString(), updatedAt: updatedCurriculumWithError.updatedAt.toISOString() }
        });
      }
      
      const analysisDataObject = await performRealAnalysisWithGemini(curriculum, extractedText);
      
      console.log(`[API /analyze] Updating curriculum ${id} in database with AI analysis object...`);
      const updatedCurriculum = await prisma.curriculum.update({
        where: { id: String(id) },
        data: {
          analysisResults: analysisDataObject,
        },
      });
      console.log(`[API /analyze] Curriculum ${id} updated successfully with AI analysis.`);

      const serializedUpdatedCurriculum = {
        ...updatedCurriculum,
        analysisResults: updatedCurriculum.analysisResults || {},
        uploadedAt: updatedCurriculum.uploadedAt.toISOString(),
        updatedAt: updatedCurriculum.updatedAt.toISOString(),
      };

      return res.status(200).json({ message: "AI-powered analysis complete and results saved.", curriculum: serializedUpdatedCurriculum });

    } catch (error) {
      console.error(`[API /analyze] Critical error for curriculum ID ${id}:`, error.message, error.stack);
      if (!res.headersSent) {
        if (error.code === 'P2025') {
          return res.status(404).json({ error: "Curriculum not found to update." });
        }
        return res.status(500).json({ error: "Unable to analyze curriculum due to a server error. " + error.message });
      }
    }
  } else {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
