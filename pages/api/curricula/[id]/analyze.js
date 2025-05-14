// File: pages/api/curricula/[id]/analyze.js
import prisma from '../../../../lib/prisma';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import fetch from 'node-fetch'; // To fetch the file from Vercel Blob URL
import path from 'path';

// --- Gemini API Client Setup ---
const apiKey = process.env.GEMINI_API_KEY;
let genAI;
if (apiKey) {
  genAI = new GoogleGenerativeAI(apiKey);
} else {
  console.error("GEMINI_API_KEY is not set. AI analysis will be disabled.");
}

const generationConfig = {
  temperature: 0.2, // Lower temperature for more factual/deterministic output for analysis
  topK: 1,
  topP: 0.95,
  maxOutputTokens: 4096, // Increased for potentially detailed JSON
};
const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

// --- Data Structures for USAO & Regional Context (Keep these for prompt construction) ---
const USAO_ADMISSIONS_REQUIREMENTS = {
  englishUnits: { required: 4, label: "English (Grammar, Composition, Literature)", keywords: ["english", "literature", "composition", "writing", "grammar", "rhetoric"] },
  mathUnits: { required: 3, label: "Mathematics (Algebra I, Geometry, Algebra II or higher)", keywords: ["math", "algebra", "geometry", "trigonometry", "pre-calculus", "calculus", "statistics"] },
  scienceUnits: { required: 3, label: "Lab Science (Biology, Chemistry, Physics, etc.)", keywords: ["science", "biology", "chemistry", "physics", "lab", "environmental", "physical science"] },
  historyUnits: { required: 3, label: "History & Citizenship (inc. American History)", keywords: ["history", "government", "civics", "social studies", "economics", "geography", "world history", "us history", "american history"] },
  electivesUnits: { required: 2, label: "Electives (Foreign Lang, Comp Sci, other AP)", keywords: ["spanish", "french", "german", "latin", "computer science", "programming", "ap", "advanced placement", "psychology", "sociology", "art", "music", "drama"] },
  totalUnits: 15,
};

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


// --- Helper to call Gemini and parse JSON (with retries for parsing) ---
async function callGeminiAndParseJson(prompt, modelInstance, attempt = 1, maxAttempts = 3) {
  console.log(`[callGeminiAndParseJson] Attempt ${attempt} for prompt (first 100 chars): ${prompt.substring(0,100)}...`);
  try {
    const result = await modelInstance.generateContent(prompt);
    const response = result.response;
    let text = response.text();
    console.log(`[callGeminiAndParseJson] Raw Gemini response text (first 300 chars): ${text.substring(0,300)}...`);

    // Clean the text: remove backticks and "json" prefix if present
    text = text.replace(/^```json\s*/, '').replace(/```$/, '').trim();
    
    const jsonData = JSON.parse(text);
    console.log("[callGeminiAndParseJson] Successfully parsed JSON from Gemini.");
    return jsonData;
  } catch (error) {
    console.error(`[callGeminiAndParseJson] Error on attempt ${attempt}:`, error.message);
    if (attempt < maxAttempts) {
      console.log(`[callGeminiAndParseJson] Retrying... (${attempt + 1}/${maxAttempts})`);
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
      return callGeminiAndParseJson(prompt, modelInstance, attempt + 1, maxAttempts);
    } else {
      console.error("[callGeminiAndParseJson] Max attempts reached. Failed to parse JSON from Gemini.");
      throw new Error(`Failed to get valid JSON from AI after ${maxAttempts} attempts. Last error: ${error.message}. Raw text: ${error.textSnippet || 'N/A'}`);
    }
  }
}

// --- Main AI Analysis Function ---
async function performRealAnalysisWithGemini(curriculum, extractedText) {
  console.log(`[performRealAnalysisWithGemini] Starting for curriculum: ${curriculum?.name}. Extracted text length: ${extractedText?.length || 0}`);
  if (!genAI) {
    console.error("[performRealAnalysisWithGemini] Gemini AI client not initialized (API Key likely missing). Returning mock data.");
    return { /* ... simplified mock data or error structure ... */ 
        lastAnalyzed: new Date().toISOString(), analyzedBy: "GeminiEngine (Disabled)", 
        error: "Gemini API key not configured.", analysisComplete: false,
        extractedTextSnippet: extractedText ? extractedText.substring(0, 200) + "..." : "No text extracted."
    };
  }
  if (!extractedText || extractedText.trim().length < 100) { // Minimal text length for meaningful analysis
    console.warn("[performRealAnalysisWithGemini] Extracted text is too short for meaningful analysis. Returning basic data.");
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

  // Truncate extractedText if too long to avoid excessive API costs/limits, though Gemini 1.5 Flash has large context
  const MAX_TEXT_LENGTH = 30000; // Approx 7.5k tokens, well within 1M limit of Flash, adjust as needed
  let textToAnalyze = extractedText.length > MAX_TEXT_LENGTH ? extractedText.substring(0, MAX_TEXT_LENGTH) : extractedText;

  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash-latest",
    generationConfig,
    safetySettings,
    // System instruction can be helpful for overall tone and task
    systemInstruction: "You are an expert curriculum analyst. Your goal is to evaluate the provided high school curriculum text against specific criteria (USAO admissions, USAO introductory course themes, and regional Oklahoma high-growth industries). Provide structured, factual, and concise evaluations. When asked for JSON, ensure your output is valid JSON."
  });

  let analysisResults = {
    lastAnalyzed: new Date().toISOString(),
    analyzedBy: "GeminiAnalysisEngine V1.0",
    overallAlignmentScore: 0, // Will be an aggregate or summary
    overallStatusText: "Analysis In Progress...",
    standardAlignmentDetails: { summary: "", findings: [], overallScore: 0, overallStatusText: "" },
    gapAnalysis: { summary: "", identifiedGaps: [] },
    regionalIndustryAlignment: {
      region: "Central Oklahoma (USAO Service Area)",
      summary: "",
      topHighGrowthIndustries: REGIONAL_HIGH_GROWTH_INDUSTRIES_OK.map(ind => ({ name: ind.name, projectedGrowth: "Varies" })), // Static for now
      curriculumAlignmentWithKeyIndustries: [],
    },
    extractedTextSnippet: textToAnalyze.substring(0, 500) + "...",
    analysisComplete: false,
  };

  try {
    // 1. USAO Admissions Requirements Analysis
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
      Format your response as a valid JSON object with a key "admissionsFindings", which is an array of objects.
      Each object in the array should have: "standardId" (e.g., "USAO-HS-ENGLISH"), "description" (the requirement label), "alignmentStatus", and "reasoning".
      Example for one item: {"standardId": "USAO-HS-ENGLISH", "description": "English (Grammar, Composition, Literature)", "alignmentStatus": "Met", "reasoning": "The curriculum details extensive coursework in literature and composition across multiple years."}
    `;
    const admissionsData = await callGeminiAndParseJson(admissionsPrompt, model);
    if (admissionsData && admissionsData.admissionsFindings) {
      analysisResults.standardAlignmentDetails.findings.push(...admissionsData.admissionsFindings);
      analysisResults.standardAlignmentDetails.summary = "Assessed against USAO high school curricular requirements. ";
      // Simple scoring for overall status based on admissions
      const metCount = admissionsData.admissionsFindings.filter(f => f.alignmentStatus === "Met").length;
      const totalReqs = Object.keys(USAO_ADMISSIONS_REQUIREMENTS).length -1; // exclude totalUnits
      const admissionScore = totalReqs > 0 ? Math.round((metCount / totalReqs) * 100) : 0;
      analysisResults.standardAlignmentDetails.overallScore = admissionScore;
      if (admissionScore >= 80) analysisResults.standardAlignmentDetails.overallStatusText = "Strongly Aligned with HS Requirements";
      else if (admissionScore >= 60) analysisResults.standardAlignmentDetails.overallStatusText = "Partially Aligned with HS Requirements";
      else analysisResults.standardAlignmentDetails.overallStatusText = "Gaps in HS Requirements";
      analysisResults.overallAlignmentScore = admissionScore; // Use this as a base for overall
      analysisResults.overallStatusText = analysisResults.standardAlignmentDetails.overallStatusText;
    } else {
        analysisResults.standardAlignmentDetails.summary += "Could not determine admissions alignment from AI. ";
        analysisResults.standardAlignmentDetails.findings.push({id: "adm-error", standardId: "USAO-HS-ALL", description: "All Requirements", alignmentStatus: "Error", reasoning: "AI response for admissions was not in the expected format."});
    }

    // TODO: Implement similar calls for USAO_INTRO_COURSE_THEMES and REGIONAL_HIGH_GROWTH_INDUSTRIES_OK
    // Each will have its own prompt and parsing logic to populate other sections of analysisResults.
    // For example, for intro courses:
    // const introCoursesPrompt = `Analyze the curriculum text for preparedness for USAO introductory course themes: ${JSON.stringify(USAO_INTRO_COURSE_THEMES)}. Format as JSON with key "introCoursePreparedness"...`;
    // const introCourseData = await callGeminiAndParseJson(introCoursesPrompt, model);
    // ... populate analysisResults.gapAnalysis and add to standardAlignmentDetails.findings ...

    // For industry alignment:
    // const industryPrompt = `Analyze the curriculum text for alignment with skills for these Oklahoma industries: ${REGIONAL_HIGH_GROWTH_INDUSTRIES_OK.map(i => i.name).join(', ')}. Focus on skills like: ${REGIONAL_HIGH_GROWTH_INDUSTRIES_OK.flatMap(i => i.skills).join(', ')}. Format as JSON with key "industryAlignments"...`;
    // const industryData = await callGeminiAndParseJson(industryPrompt, model);
    // ... populate analysisResults.regionalIndustryAlignment.curriculumAlignmentWithKeyIndustries ...
    
    // For now, we'll add placeholder text for other sections if they aren't filled by the first call.
    if (analysisResults.gapAnalysis.identifiedGaps.length === 0) {
        analysisResults.gapAnalysis.summary = analysisResults.gapAnalysis.summary || "Further analysis needed for detailed gaps beyond admissions.";
    }
    if (analysisResults.regionalIndustryAlignment.curriculumAlignmentWithKeyIndustries.length === 0) {
        analysisResults.regionalIndustryAlignment.summary = analysisResults.regionalIndustryAlignment.summary || "Further analysis needed for detailed industry alignment.";
    }


    analysisResults.analysisComplete = true;
    console.log("[performRealAnalysisWithGemini] Analysis generation complete.");

  } catch (error) {
    console.error("[performRealAnalysisWithGemini] Error during AI analysis calls:", error);
    analysisResults.error = "An error occurred during AI analysis: " + error.message;
    analysisResults.overallStatusText = "Analysis Failed";
    analysisResults.analysisComplete = false;
  }
  return analysisResults;
}


// --- File Text Extraction Helper (from previous step) ---
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

// --- API Route Handler ---
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
        // Update DB with extraction error and return
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
      
      // Perform the actual AI analysis using the extracted text
      const analysisDataObject = await performRealAnalysisWithGemini(curriculum, extractedText);
      
      console.log(`[API /analyze] Updating curriculum ${id} in database with AI analysis object...`);
      const updatedCurriculum = await prisma.curriculum.update({
        where: { id: String(id) },
        data: {
          analysisResults: analysisDataObject, // Save the JS object directly
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

// Ensure these constants are defined or imported if used elsewhere, or remove if only for this file
// const USAO_ADMISSIONS_REQUIREMENTS = { /* ... */ };
// const USAO_INTRO_COURSE_THEMES = { /* ... */ };
// const REGIONAL_HIGH_GROWTH_INDUSTRIES_OK = [ /* ... */ ];
