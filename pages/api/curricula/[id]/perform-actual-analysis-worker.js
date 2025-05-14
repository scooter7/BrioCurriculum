// File: pages/api/curricula/[id]/perform-actual-analysis-worker.js
import prisma from '../../../../lib/prisma';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import fetch from 'node-fetch';
// import path from 'path'; // Not strictly needed if using basename from originalFilename

const apiKey = process.env.GEMINI_API_KEY;
let genAI;
if (apiKey) {
  genAI = new GoogleGenerativeAI(apiKey);
} else {
  console.error("[Worker] GEMINI_API_KEY is not set. AI analysis will be disabled.");
}

const generationConfig = {
  temperature: 0.2, // Low temperature for more factual, structured output
  topK: 1,
  topP: 0.95,
  maxOutputTokens: 8192, // Allow for larger JSON responses
  responseMimeType: "application/json", // Crucial for enforcing JSON output
};
const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

// --- Benchmark Data (Keep these comprehensive) ---
const USAO_ADMISSIONS_REQUIREMENTS = {
  englishUnits: { id: "USAO-HS-ENGLISH", required: 4, label: "English (Grammar, Composition, Literature)", keywords: ["english", "literature", "composition", "writing", "grammar", "rhetoric", "speech", "debate"] },
  mathUnits: { id: "USAO-HS-MATH", required: 3, label: "Mathematics (Algebra I, Geometry, Algebra II or higher)", keywords: ["math", "algebra i", "algebra 1", "algebra ii", "algebra 2", "geometry", "trigonometry", "pre-calculus", "calculus", "statistics", "math analysis"] },
  scienceUnits: { id: "USAO-HS-SCIENCE", required: 3, label: "Lab Science (Biology, Chemistry, Physics, etc.)", keywords: ["science", "biology", "chemistry", "physics", "lab science", "environmental science", "physical science", "anatomy", "physiology"] },
  historyUnits: { id: "USAO-HS-HISTORY", required: 3, label: "History & Citizenship (inc. 1 unit American History)", keywords: ["history", "american history", "u.s. history", "world history", "government", "civics", "social studies", "economics", "geography", "oklahoma history", "non-western culture"] },
  electivesUnits: { id: "USAO-HS-ELECTIVES", required: 2, label: "Additional Units (from subjects above, or Foreign Lang, Comp Sci, Fine Arts, AP courses)", keywords: ["spanish", "french", "german", "latin", "computer science", "programming", "ap ", "advanced placement", "psychology", "sociology", "art", "music", "drama", "speech", "debate", "fine arts"] },
  totalUnits: 15,
};

const USAO_INTRO_COURSE_THEMES = {
  english: { id_prefix: "USAO-INTRO-ENGL", label: "English Composition & Literature", themes: ["effective written composition", "rhetorical analysis", "critical reading of diverse literary texts", "research methodologies and academic writing", "oral communication fundamentals"] },
  math: { id_prefix: "USAO-INTRO-MATH", label: "Foundational Mathematics", themes: ["college algebra proficiency", "functions and their graphs", "introduction to pre-calculus concepts", "basic statistical literacy and data interpretation", "logical reasoning and quantitative problem-solving"] },
  science: { id_prefix: "USAO-INTRO-SCI", label: "Core Scientific Principles", themes: ["fundamental principles of biology (e.g., cell biology, genetics, evolution)", "core concepts of general chemistry (e.g., atomic structure, bonding, stoichiometry)", "introductory physics concepts (e.g., mechanics, energy)", "application of the scientific method and inquiry", "basic laboratory techniques and safety", "data analysis and interpretation from experiments"] },
  humanities: { id_prefix: "USAO-INTRO-HUM", label: "Humanities & Social Sciences", themes: ["survey of American history and government", "overview of world civilizations or non-Western cultures", "introduction to philosophical inquiry and ethics", "foundational concepts in psychology or sociology", "critical thinking about social issues"] },
  // arts: { id_prefix: "USAO-INTRO-ART", label: "Arts Appreciation & Fundamentals", themes: ["art history and appreciation", "music theory fundamentals", "introduction to theatre arts", "elements and principles of design"] }, // Example
};

const REGIONAL_HIGH_GROWTH_INDUSTRIES_OK = [
  { id: "health", name: "Health Care & Social Assistance", keywords: ["health", "medical", "nursing", "biology", "chemistry", "anatomy", "physiology", "psychology", "social work", "patient care", "therapy"], skills: ["Patient Care Fundamentals", "Medical Terminology", "Empathy & Communication", "Scientific Literacy (Biology/Chemistry)", "Data Interpretation", "Ethical Considerations", "Health Informatics Awareness"] },
  { id: "manufacturing_aerospace", name: "Manufacturing (inc. Advanced & Aerospace)", keywords: ["manufacturing", "engineering", "aerospace", "aviation", "robotics", "cad", "cam", "industrial technology", "mechanics", "electronics", "logistics", "supply chain", "uas", "drone"], skills: ["Technical Aptitude & Problem-Solving", "Applied Mathematics & Physics", "Understanding of Design & Schematics (CAD awareness)", "Quality Control Principles", "Safety Protocols", "Automation & Robotics Concepts", "Logistics Basics"] },
  { id: "professional_tech_it", name: "Professional, Scientific, & Technical Services (inc. IT)", keywords: ["business administration", "management", "accounting", "finance", "information technology", "it", "computer science", "software development", "programming", "cybersecurity", "data analysis", "data science", "research", "consulting"], skills: ["Analytical & Critical Thinking", "IT Literacy & Digital Fluency", "Programming Fundamentals (e.g., Python, Java)", "Data Management & Analysis Basics", "Cybersecurity Awareness & Principles", "Cloud Computing Concepts (AWS/Azure awareness)", "Professional Communication & Collaboration", "Project Management Basics"] },
  { id: "energy", name: "Energy (inc. Oil & Gas, Renewables)", keywords: ["energy", "oil", "gas", "petroleum", "renewable energy", "wind energy", "solar energy", "geology", "environmental science", "sustainability", "power systems"], skills: ["Understanding of Energy Systems (Traditional/Renewable)", "Environmental Science Principles & Sustainability", "Technical Problem Solving in Engineering Contexts", "Safety Regulations & Compliance", "Data Monitoring & Analysis for Efficiency", "Geoscience Fundamentals (for traditional energy)"] }
];


// Helper to call Gemini and parse JSON (robust version from before)
async function callGeminiAndParseJson(promptContent, modelInstance, attempt = 1, maxAttempts = 2) {
  console.log(`[Worker/callGemini] Attempt ${attempt}/${maxAttempts}. Prompt snippet: ${String(promptContent).substring(0,100)}...`);
  let rawTextResponse = "No response received from AI.";
  try {
    const result = await modelInstance.generateContent(promptContent);
    rawTextResponse = result.response.text(); 
    console.log(`[Worker/callGemini] RAW GEMINI RESPONSE (Attempt ${attempt}, Length: ${rawTextResponse.length}):\n>>>>>>>>>>>>\n${rawTextResponse}\n<<<<<<<<<<<<`);
    let jsonText = rawTextResponse.trim();
    if (jsonText.startsWith("```json")) { jsonText = jsonText.substring(7, jsonText.endsWith("```") ? jsonText.length - 3 : undefined).trim(); }
    else if (jsonText.startsWith("```")) { jsonText = jsonText.substring(3, jsonText.endsWith("```") ? jsonText.length - 3 : undefined).trim(); }
    if (!jsonText) throw new Error("Cleaned JSON text is empty.");
    const jsonData = JSON.parse(jsonText);
    console.log("[Worker/callGemini] Successfully parsed JSON.");
    return jsonData;
  } catch (error) {
    console.error(`[Worker/callGemini] JSON PARSING FAILED on attempt ${attempt}: ${error.message}.`);
    const enhancedError = new Error(`Failed to get valid JSON from AI. Last error: ${error.message}. Raw response logged above.`);
    enhancedError.rawResponse = rawTextResponse; 
    throw enhancedError;
  }
}

// Main AI Analysis Logic Function
async function generateRealAnalysisResults(curriculum, extractedText) {
  console.log(`[Worker/generateReal] For: ${curriculum?.name}. Text length: ${extractedText?.length || 0}`);
  if (!genAI) return { error: "Gemini API key not configured.", analysisComplete: false, lastAnalyzed: new Date().toISOString(), analyzedBy: "GeminiEngine (Disabled)" };
  
  const MIN_TEXT_FOR_ANALYSIS = 500; // Require at least 500 chars for a somewhat meaningful analysis
  if (!extractedText || extractedText.trim().length < MIN_TEXT_FOR_ANALYSIS) {
    return { 
        error: `Extracted text too short for analysis (min ${MIN_TEXT_FOR_ANALYSIS} chars). Received ${extractedText?.trim().length || 0} chars.`, 
        analysisComplete: false,
        lastAnalyzed: new Date().toISOString(), analyzedBy: "GeminiEngine (Insufficient Text)",
        overallAlignmentScore: 5, overallStatusText: "Insufficient Data for AI",
        standardAlignmentDetails: { summary: "Not enough text from curriculum to perform analysis.", findings: []},
        gapAnalysis: { summary: "Cannot perform gap analysis due to insufficient text.", identifiedGaps: []},
        regionalIndustryAlignment: { region: "Central Oklahoma", summary: "Cannot perform industry alignment due to insufficient text.", topHighGrowthIndustries: REGIONAL_HIGH_GROWTH_INDUSTRIES_OK.map(ind => ({ name: ind.name, projectedGrowth: "Varies" })), curriculumAlignmentWithKeyIndustries: []},
        extractedTextSnippet: extractedText ? extractedText.substring(0, 100) + "..." : "No text extracted.",
    };
  }

  // Use a significant portion of the text. Gemini 1.5 Flash has 1M token context.
  // Be mindful of API costs and processing time for very large documents.
  // For now, let's cap at around 200k characters (roughly 50k-70k tokens) as a safety.
  const MAX_TEXT_LENGTH_FOR_ANALYSIS = 200000; 
  const textToAnalyze = extractedText.length > MAX_TEXT_LENGTH_FOR_ANALYSIS 
    ? extractedText.substring(0, MAX_TEXT_LENGTH_FOR_ANALYSIS) 
    : extractedText;
  console.log(`[Worker/generateReal] Using text of length ${textToAnalyze.length} for analysis prompts.`);

  const systemInstructionText = `You are an expert curriculum analyst. Respond ONLY with a valid JSON object as specified in each prompt. Do not include any other text, markdown, or explanations outside of the JSON structure. Your entire response must be a single, parsable JSON object.`;
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest", generationConfig, safetySettings, systemInstruction: { role: "system", parts: [{ text: systemInstructionText }] } });
  
  let analysisResultsBuild = {
    lastAnalyzed: new Date().toISOString(),
    analyzedBy: "GeminiWorker-MultiAspect-v1.0",
    overallAlignmentScore: 0, // To be aggregated
    overallStatusText: "Analysis In Progress...",
    standardAlignmentDetails: { summary: "", findings: [], overallScore: 0, overallStatusText: "" },
    gapAnalysis: { summary: "Pending detailed gap analysis.", identifiedGaps: [] },
    regionalIndustryAlignment: {
      region: "Central Oklahoma (USAO Service Area)",
      summary: "Pending regional industry alignment.",
      topHighGrowthIndustries: REGIONAL_HIGH_GROWTH_INDUSTRIES_OK.map(ind => ({ id: ind.id, name: ind.name, projectedGrowth: "Varies (BLS/Regional Data)" })),
      curriculumAlignmentWithKeyIndustries: [],
    },
    extractedTextSnippet: textToAnalyze.substring(0, 500) + "...",
    analysisComplete: false,
    errors: []
  };

  let totalPossibleScore = 0;
  let actualScore = 0;

  // --- 1. USAO Admissions Requirements Analysis ---
  try {
    const admissionsRequirementsString = Object.values(USAO_ADMISSIONS_REQUIREMENTS)
        .filter(req => req.label) // Exclude 'totalUnits'
        .map(req => `- ${req.label}: ${req.required} units (Keywords: ${req.keywords.join(', ')})`)
        .join('\n');

    const admissionsPrompt = `
      Analyze the provided curriculum text for alignment with USAO freshman admissions unit requirements.
      Curriculum Text: """${textToAnalyze}"""
      USAO Requirements:
      ${admissionsRequirementsString}
      
      For each requirement, determine if it's "Met", "Partially Met", "Gap", or "Unclear". Provide brief, factual reasoning (max 30 words) based ONLY on the provided text.
      Your response MUST be a single, valid JSON object with ONLY one top-level key: "admissionsFindings".
      This key's value must be an array of objects. Each object must have these exact keys: "standardId" (string, use IDs like "USAO-HS-ENGLISH"), "description" (string, the requirement label), "alignmentStatus" (string: "Met", "Partially Met", "Gap", "Unclear"), and "reasoning" (string).
      Example: {"admissionsFindings": [{"standardId": "USAO-HS-MATH", "description": "Mathematics...", "alignmentStatus": "Met", "reasoning": "Covers Algebra I, Geometry, and Algebra II."}]}
    `;
    console.log("[Worker/generateReal] Sending USAO admissions prompt to Gemini...");
    const admissionsData = await callGeminiAndParseJson(admissionsPrompt, model);
    if (admissionsData && Array.isArray(admissionsData.admissionsFindings)) {
      analysisResultsBuild.standardAlignmentDetails.findings.push(...admissionsData.admissionsFindings);
      analysisResultsBuild.standardAlignmentDetails.summary += "USAO HS Requirements: Assessed. ";
      let metCount = 0;
      let reqCount = 0;
      admissionsData.admissionsFindings.forEach(f => {
          reqCount++;
          if (f.alignmentStatus === "Met") metCount++;
          else if (f.alignmentStatus === "Partially Met") metCount += 0.5;
      });
      actualScore += metCount;
      totalPossibleScore += reqCount;
    } else {
      analysisResultsBuild.errors.push("Admissions analysis from AI was malformed or 'admissionsFindings' array was missing.");
      console.warn("[Worker/generateReal] Admissions data error. Received:", admissionsData);
    }
  } catch (error) {
    console.error("[Worker/generateReal] Error during USAO admissions analysis:", error.message);
    analysisResultsBuild.errors.push(`USAO Admissions Analysis Error: ${error.message}`);
    if (error.rawResponse) console.error("Raw response for admissions error:\n", error.rawResponse);
  }

  // --- 2. USAO Introductory Course Themes Analysis (Example for English & Math) ---
  // You would loop through USAO_INTRO_COURSE_THEMES for all subjects
  try {
    const introCourseSubjectsToAnalyze = ['english', 'math']; // Analyze a subset for now
    let introCourseFindings = [];
    let introCourseGaps = [];

    for (const subject of introCourseSubjectsToAnalyze) {
        const subjectThemes = USAO_INTRO_COURSE_THEMES[subject];
        if (!subjectThemes) continue;

        const introPrompt = `
        Analyze the curriculum text for preparedness for USAO introductory ${subjectThemes.label} course themes.
        Curriculum Text: """${textToAnalyze}"""
        Key Themes for ${subjectThemes.label}: ${subjectThemes.themes.join('; ')}.
        
        Respond ONLY with a valid JSON object with one top-level key: "${subject}IntroCourseAlignment".
        This key's value should be an array of objects. Each object must have "theme" (string), "preparedness" (string: "Well Prepared", "Adequately Prepared", "Needs Development", "Unclear"), and "evidenceOrGap" (string, max 30 words).
        Example: {"englishIntroCourseAlignment": [{"theme": "effective written composition", "preparedness": "Well Prepared", "evidenceOrGap": "Multiple writing assignments noted."}]}
        `;
        console.log(`[Worker/generateReal] Sending USAO Intro ${subject} prompt to Gemini...`);
        const introData = await callGeminiAndParseJson(introPrompt, model);
        
        const alignmentKey = `${subject}IntroCourseAlignment`;
        if (introData && Array.isArray(introData[alignmentKey])) {
            introData[alignmentKey].forEach(item => {
                introCourseFindings.push({
                    id: `${subjectThemes.id_prefix}-${item.theme.replace(/\s/g, '')}`,
                    standardId: `USAO-INTRO-${subject.toUpperCase()}`,
                    description: `Intro ${subjectThemes.label} Theme: ${item.theme}`,
                    alignmentStatus: item.preparedness,
                    reasoning: item.evidenceOrGap
                });
                totalPossibleScore += 1; // 1 point per theme
                if (item.preparedness === "Well Prepared") actualScore += 1;
                else if (item.preparedness === "Adequately Prepared") actualScore += 0.5;
                else introCourseGaps.push({id: `gap-intro-${subject}-${item.theme.replace(/\s/g, '')}`, area: `Intro ${subjectThemes.label}: ${item.theme}`, description: item.evidenceOrGap, severity: "Medium"});
            });
        } else {
            analysisResultsBuild.errors.push(`Intro ${subjectThemes.label} analysis from AI was malformed.`);
            console.warn(`[Worker/generateReal] Intro ${subject} data error. Received:`, introData);
        }
    }
    analysisResultsBuild.standardAlignmentDetails.findings.push(...introCourseFindings);
    analysisResultsBuild.gapAnalysis.identifiedGaps.push(...introCourseGaps);
    analysisResultsBuild.gapAnalysis.summary += `Introductory course preparedness assessed. `;

  } catch (error) {
    console.error("[Worker/generateReal] Error during USAO intro courses analysis:", error.message);
    analysisResultsBuild.errors.push(`USAO Intro Courses Analysis Error: ${error.message}`);
    if (error.rawResponse) console.error("Raw response for intro courses error:\n", error.rawResponse);
  }
  
  // --- 3. Regional Industry Alignment (Example for one industry) ---
  // You would loop through REGIONAL_HIGH_GROWTH_INDUSTRIES_OK
  try {
    const industryToAnalyze = REGIONAL_HIGH_GROWTH_INDUSTRIES_OK[0]; // Example: Health Care
    if (industryToAnalyze) {
        const industryPrompt = `
        Analyze the curriculum text for alignment with skills needed for the '${industryToAnalyze.name}' sector in Central Oklahoma.
        Curriculum Text: """${textToAnalyze}"""
        Key skills for ${industryToAnalyze.name}: ${industryToAnalyze.skills.join('; ')}.
        
        Respond ONLY with a valid JSON object with one top-level key: "industryAlignment".
        This key's value should be an object with "industryName" (string), "alignmentScorePercent" (number, 0-100), "alignmentStatusText" (string: "Strong", "Moderate", "Some", "Limited"), "keySkillsCovered" (array of strings), "identifiedGaps" (array of strings), and "opportunities" (array of strings).
        Example: {"industryAlignment": {"industryName": "${industryToAnalyze.name}", "alignmentScorePercent": 75, "alignmentStatusText": "Moderate", "keySkillsCovered": ["Skill A", "Skill B"], "identifiedGaps": ["Missing Skill C"], "opportunities": ["Internship program"]}}
        `;
        console.log(`[Worker/generateReal] Sending ${industryToAnalyze.name} industry prompt to Gemini...`);
        const industryData = await callGeminiAndParseJson(industryPrompt, model);

        if (industryData && industryData.industryAlignment) {
            analysisResultsBuild.regionalIndustryAlignment.curriculumAlignmentWithKeyIndustries.push(industryData.industryAlignment);
            totalPossibleScore += 3; // 3 points for this industry alignment
            actualScore += Math.floor((industryData.industryAlignment.alignmentScorePercent || 0) / 33);
        } else {
            analysisResultsBuild.errors.push(`${industryToAnalyze.name} industry analysis from AI was malformed.`);
            console.warn(`[Worker/generateReal] Industry ${industryToAnalyze.name} data error. Received:`, industryData);
        }
    }
    analysisResultsBuild.regionalIndustryAlignment.summary += `Regional industry alignment assessed. `;

  } catch (error) {
    console.error("[Worker/generateReal] Error during regional industry analysis:", error.message);
    analysisResultsBuild.errors.push(`Regional Industry Analysis Error: ${error.message}`);
    if (error.rawResponse) console.error("Raw response for industry error:\n", error.rawResponse);
  }

  // Finalize overall score and status
  if (totalPossibleScore > 0) {
    analysisResultsBuild.overallAlignmentScore = Math.min(98, Math.round((actualScore / totalPossibleScore) * 100));
  } else if (analysisResultsBuild.errors.length === 0) { // No scoring but no errors
    analysisResultsBuild.overallAlignmentScore = 75; // Default if no specific scoring happened but no errors
  } else {
    analysisResultsBuild.overallAlignmentScore = 25; // Low score if errors occurred
  }

  if (analysisResultsBuild.errors.length > 0) {
    analysisResultsBuild.overallStatusText = "Analysis Completed with Errors";
  } else if (analysisResultsBuild.overallAlignmentScore >= 85) analysisResultsBuild.overallStatusText = "Strong Overall Alignment";
  else if (analysisResultsBuild.overallAlignmentScore >= 70) analysisResultsBuild.overallStatusText = "Good Overall Alignment";
  else if (analysisResultsBuild.overallAlignmentScore >= 50) analysisResultsBuild.overallStatusText = "Moderate Overall Alignment";
  else analysisResultsBuild.overallStatusText = "Needs Further Review";
  
  analysisResultsBuild.analysisComplete = true; // Mark as complete even if there were partial errors
  console.log("[Worker/generateReal] Multi-aspect analysis generation finished.");
  return analysisResultsBuild;
}

async function extractTextFromFile(fileBuffer, mimeType) {
  console.log(`[extractTextFromFile] Attempting text extraction. MimeType: ${mimeType}, Buffer length: ${fileBuffer?.length}`);
  if (!fileBuffer || fileBuffer.length === 0) {
    console.warn("[extractTextFromFile] Received empty or null file buffer.");
    return "";
  }
  if (mimeType === 'application/pdf') {
    try {
      const data = await pdf(fileBuffer);
      const text = data.text || "";
      console.log(`[extractTextFromFile] PDF text extracted. Length: ${text.length}. Snippet: "${text.substring(0,100)}..."`);
      return text;
    } catch (error) {
      console.error("[extractTextFromFile] Error parsing PDF:", error.message); // Don't log stack here, too verbose for common case
      throw new Error(`Failed to parse PDF content: ${error.message}`);
    }
  } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    try {
      const { value } = await mammoth.extractRawText({ buffer: fileBuffer });
      const text = value || "";
      console.log(`[extractTextFromFile] DOCX text extracted. Length: ${text.length}. Snippet: "${text.substring(0,100)}..."`);
      return text;
    } catch (error) {
      console.error("[extractTextFromFile] Error parsing DOCX:", error.message);
      throw new Error(`Failed to parse DOCX content: ${error.message}`);
    }
  } else if (mimeType === 'text/plain') {
    try {
      const text = fileBuffer.toString('utf8');
      console.log(`[extractTextFromFile] TXT text extracted. Length: ${text.length}. Snippet: "${text.substring(0,100)}..."`);
      return text;
    } catch (error) {
      console.error("[extractTextFromFile] Error parsing TXT:", error.message);
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
  let analysisResultsObject = {
    lastAnalyzed: new Date().toISOString(),
    analyzedBy: "GeminiWorker-MultiAsync-v1.0",
    error: "Analysis initiated.",
    analysisComplete: false,
    errors: ["Analysis initiated but not yet complete."]
  };
  let analysisErrorMsg = "Analysis initiated.";

  try {
    const curriculum = await prisma.curriculum.findUnique({ where: { id: String(curriculumId) } });
    if (!curriculum) throw new Error("Curriculum not found in worker.");
    if (!curriculum.filePath) throw new Error("Curriculum filePath is missing in worker.");

    const fileResponse = await fetch(curriculum.filePath);
    if (!fileResponse.ok) throw new Error(`Blob fetch failed: ${fileResponse.statusText}`);
    const arrayBuffer = await fileResponse.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);
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
        analysisStatus = "FAILED"; 
        analysisErrorMsg = "AI Analysis marked as incomplete by generation logic.";
    } else {
        analysisStatus = "COMPLETED";
        analysisErrorMsg = null; // Clear error message on success
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
