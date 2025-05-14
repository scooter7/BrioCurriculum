// File: pages/api/curricula/[id]/analyze.js
import prisma from '../../../../lib/prisma';

// --- Data Structures for USAO & Regional Context (Simplified) ---
const USAO_ADMISSIONS_REQUIREMENTS = {
  englishUnits: { required: 4, label: "English (Grammar, Composition, Literature)" },
  mathUnits: { required: 3, label: "Mathematics (Algebra I, Geometry, Algebra II or higher)" },
  scienceUnits: { required: 3, label: "Lab Science (Biology, Chemistry, Physics, etc.)" },
  historyUnits: { required: 3, label: "History & Citizenship (inc. American History)" },
  electivesUnits: { required: 2, label: "Electives (Foreign Lang, Comp Sci, other AP)" },
  totalUnits: 15,
};
const USAO_INTRO_COURSE_THEMES = {
  english: ["composition", "literature", "critical reading", "communication fundamentals"],
  math: ["college algebra", "pre-calculus concepts", "introductory statistics", "problem-solving"],
  science: ["principles of biology", "general chemistry", "foundations of physics", "scientific inquiry", "lab skills"],
  humanities: ["american history survey", "world civilizations", "intro to philosophy", "social sciences overview"],
  arts: ["art appreciation", "music fundamentals", "theatre introduction", "design basics"],
};
const REGIONAL_HIGH_GROWTH_INDUSTRIES_OK = [
  { id: "health", name: "Health Care & Social Assistance", keywords: ["health", "biology", "chemistry", "anatomy", "psychology", "cna", "medical"], skills: ["Patient Care Fundamentals", "Basic Medical Terminology", "Empathy & Communication", "Scientific Literacy (Biology/Chemistry)"] },
  { id: "manufacturing", name: "Manufacturing (including Advanced)", keywords: ["manufacturing", "engineering", "tech", "robotics", "cad", "shop", "industrial"], skills: ["Technical Aptitude", "Problem-Solving", "Basic Math/Physics Application", "Intro to Design/CAD (awareness)", "Safety Protocols"] },
  { id: "retail", name: "Retail Trade", keywords: ["business", "marketing", "sales", "economics"], skills: ["Customer Service Principles", "Basic Sales Techniques", "Communication", "Inventory Awareness (basic math)"] },
  { id: "professional", name: "Professional, Scientific, & Technical Services", keywords: ["business", "accounting", "it", "computer science", "research", "analysis"], skills: ["Analytical Thinking", "Basic IT Literacy/Computer Science", "Research Skills", "Professional Communication"] },
];

// --- Enhanced Mock Analysis Generation ---
const generateEnhancedAnalysisResults = (curriculum) => {
  console.log("[generateEnhancedAnalysisResults] Starting for curriculum:", curriculum?.name);
  if (!curriculum) {
    console.error("[generateEnhancedAnalysisResults] Curriculum object is null or undefined.");
    return { error: "Curriculum data not provided for analysis.", analysisComplete: false };
  }

  const curriculumNameLower = (curriculum.name || "").toLowerCase();
  const schoolTagLower = (curriculum.schoolTag || "").toLowerCase();
  const combinedText = curriculumNameLower + " " + schoolTagLower;
  console.log("[generateEnhancedAnalysisResults] Combined text for matching:", combinedText);

  let analysis = {
    lastAnalyzed: new Date().toISOString(),
    analyzedBy: "EnhancedMockEngine V2.2 (USAO Focus PG)",
    overallAlignmentScore: 0,
    overallStatusText: "Analysis Pending",
    standardAlignmentDetails: {
      summary: "",
      findings: [],
      overallScore: 0,
      overallStatusText: "Analysis Pending",
    },
    gapAnalysis: {
      summary: "",
      identifiedGaps: [],
    },
    resourceCheck: {
        summary: "Resource check provides general advice based on simulated curriculum focus.",
        resources: [{id: "res_generic", name: "Generic Digital Resources", type: "Digital Platform", alignment: "Medium", notes: "Assumed availability of standard online learning tools."}],
        recommendations: ["Ensure access to USAO's recommended reading lists for incoming freshmen.", "Verify specific software needs if pursuing technical majors at USAO."]
    },
    regionalIndustryAlignment: {
      region: "Central Oklahoma (USAO Service Area - Grady County/Chickasha focus)",
      summary: "",
      topHighGrowthIndustries: REGIONAL_HIGH_GROWTH_INDUSTRIES_OK.map(ind => ({ name: ind.name, projectedGrowth: "Varies (Source: Data USA, Chickasha EDC)" })),
      curriculumAlignmentWithKeyIndustries: [],
    },
    analysisComplete: true, // Flag to indicate successful generation
  };

  let totalScore = 0;
  let maxPossibleScore = 0;

  try {
    // 1. USAO Admissions Curricular Requirements Alignment
    let admissionsFindings = [];
    let admissionsGaps = [];
    let unitsMet = 0;
    Object.keys(USAO_ADMISSIONS_REQUIREMENTS).forEach(key => {
      if (key === 'totalUnits') return;
      const req = USAO_ADMISSIONS_REQUIREMENTS[key];
      let met = "Gap"; let coverage = "None"; let points = 0; maxPossibleScore += 2;
      if (key.includes("english") && combinedText.match(/english|literature|composition|writing/)) { met = "Likely Met"; coverage = "Assumed Full"; points = 2; unitsMet += req.required; }
      else if (key.includes("math") && combinedText.match(/math|algebra|geometry|calculus|statistics|pre-calc/)) { met = "Likely Met"; coverage = "Assumed Full"; points = 2; unitsMet += req.required; }
      else if (key.includes("science") && combinedText.match(/science|biology|chemistry|physics|lab/)) { met = "Likely Met"; coverage = "Assumed Full"; points = 2; unitsMet += req.required; }
      else if (key.includes("history") && combinedText.match(/history|government|civics|social studies|economics|geography/)) { met = "Likely Met"; coverage = "Assumed Full"; points = 2; unitsMet += req.required; }
      else if (key.includes("electives") && combinedText.match(/ap |advanced placement|foreign language|spanish|french|computer science|elective/)) { met = "Likely Met"; coverage = "Assumed Full"; points = 2; unitsMet += req.required; }
      admissionsFindings.push({ id: `adm-${key}`, standardId: `USAO-HS-${key.toUpperCase()}`, description: req.label, alignmentStatus: met, coverage: coverage, notes: met === "Gap" ? `Requires ${req.required} units.` : `Assumed ${req.required} units covered.` });
      if (met === "Gap") admissionsGaps.push({ id: `gap-adm-${key}`, area: `HS Req: ${req.label}`, description: `Curriculum does not clearly indicate coverage of the required ${req.required} units.`, severity: "High" });
      totalScore += points;
    });
    analysis.standardAlignmentDetails.findings.push(...admissionsFindings);
    analysis.gapAnalysis.identifiedGaps.push(...admissionsGaps);
    analysis.standardAlignmentDetails.summary = `Simulated alignment with USAO high school unit requirements. ${unitsMet >= USAO_ADMISSIONS_REQUIREMENTS.totalUnits ? "All core unit requirements appear to be met." : "Potential gaps in core unit requirements."}`;
    
    // 2. USAO Introductory Course Themes Alignment
    let introCourseFindings = []; let introCourseGaps = [];
    Object.keys(USAO_INTRO_COURSE_THEMES).forEach(subjectArea => {
        USAO_INTRO_COURSE_THEMES[subjectArea].forEach((theme, index) => {
            maxPossibleScore += 1;
            if (typeof theme === 'string' && combinedText.match(new RegExp(theme.split(" ")[0], "i"))) {
              introCourseFindings.push({ id: `intro-${subjectArea}-${index}`, standardId: `USAO-INTRO-${subjectArea.toUpperCase()}-${theme.toUpperCase().replace(/\s/g,'')}`, description: `Intro ${subjectArea} Theme: ${theme}`, alignmentStatus: "Potential Alignment", coverage: "Partial to Full (Assumed)" });
              totalScore += 1;
            } else {
              introCourseGaps.push({ id: `gap-intro-${subjectArea}-${index}`, area: `Intro ${subjectArea} Skill: ${theme}`, description: `Curriculum may not explicitly prepare for introductory college-level focus on "${theme}".`, severity: "Medium" });
            }
        });
    });
    analysis.standardAlignmentDetails.findings.push(...introCourseFindings);
    analysis.gapAnalysis.identifiedGaps.push(...introCourseGaps);
    analysis.gapAnalysis.summary = (analysis.gapAnalysis.summary ? analysis.gapAnalysis.summary + " " : "") + (introCourseGaps.length > 0 ? `Gaps also identified in preparedness for some USAO introductory course themes.` : `Appears to provide a good foundation for USAO introductory courses.`);

    // 3. Regional Industry Alignment
    REGIONAL_HIGH_GROWTH_INDUSTRIES_OK.forEach(industry => {
      maxPossibleScore += 3; let alignmentScorePercent = 20; let alignmentStatusText = "Limited Alignment"; let keySkillsCovered = []; let identifiedGaps = [`Further development needed for specific ${industry.name} pathways.`]; let opportunities = [`Explore partnerships with local ${industry.name} employers.`, `Integrate industry-specific project options.`]; let matchCount = 0;
      (industry.keywords || []).forEach(keyword => { if (combinedText.includes(keyword)) matchCount++; });
      if (matchCount > 0) {
        alignmentScorePercent += matchCount * 20;
        if (industry.keywords && matchCount >= industry.keywords.length / 2) {
          keySkillsCovered.push(...(industry.skills || []).slice(0, Math.min(2, (industry.skills || []).length) ));
          identifiedGaps = [`Consider more specialized modules for ${industry.name}.`];
        }
      }
      alignmentScorePercent = Math.min(90, alignmentScorePercent);
      if (alignmentScorePercent >= 75) alignmentStatusText = "Strong Alignment"; else if (alignmentScorePercent >= 50) alignmentStatusText = "Moderate Alignment"; else if (alignmentScorePercent >= 30) alignmentStatusText = "Some Alignment";
      analysis.regionalIndustryAlignment.curriculumAlignmentWithKeyIndustries.push({
        id: `ind-align-${industry.id}`, industrySector: industry.name, relevantPathways: `Based on keywords: ${(industry.keywords || []).join(', ')}`, alignmentScorePercent: alignmentScorePercent, alignmentStatusText: alignmentStatusText, keySkillsCovered: keySkillsCovered.length > 0 ? keySkillsCovered : ["General Foundational Skills"], identifiedGaps: identifiedGaps, opportunities: opportunities,
      });
      totalScore += Math.floor(alignmentScorePercent / 33);
    });
    analysis.regionalIndustryAlignment.summary = `Simulated alignment of '${curriculumNameLower}' with key regional industries. Focus on enhancing pathways for specific high-demand skills is recommended.`;

    // Calculate Overall Score
    analysis.overallAlignmentScore = maxPossibleScore > 0 ? Math.min(98, Math.round((totalScore / maxPossibleScore) * 100)) : 50;
    if (analysis.overallAlignmentScore >= 85) analysis.overallStatusText = "Strong Overall Alignment";
    else if (analysis.overallAlignmentScore >= 70) analysis.overallStatusText = "Good Overall Alignment";
    else if (analysis.overallAlignmentScore >= 50) analysis.overallStatusText = "Moderate Overall Alignment";
    else analysis.overallStatusText = "Needs Improvement";
    analysis.standardAlignmentDetails.overallScore = analysis.overallAlignmentScore;
    analysis.standardAlignmentDetails.overallStatusText = analysis.overallStatusText;
    console.log("[generateEnhancedAnalysisResults] Analysis object generated successfully.");
  } catch (e) {
    console.error("[generateEnhancedAnalysisResults] Error during generation:", e.message, e.stack);
    analysis.error = "Error occurred during analysis generation: " + e.message;
    analysis.overallStatusText = "Analysis Failed";
    analysis.analysisComplete = false;
  }
  return analysis; // Returns a JavaScript object
};

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
      console.log(`[API /analyze] Curriculum ${id} found: ${curriculum.name}`);

      const analysisDataObject = generateEnhancedAnalysisResults(curriculum); // This is a JS object
      
      if (analysisDataObject.error) {
        console.error(`[API /analyze] Error from generateEnhancedAnalysisResults: ${analysisDataObject.error}`);
        // Decide if you still want to save partial/error state or return an error
        // For now, we save it, the client can check for analysisDataObject.error
      }

      console.log(`[API /analyze] Updating curriculum ${id} in database with analysis object...`);
      const updatedCurriculum = await prisma.curriculum.update({
        where: { id: String(id) },
        data: {
          analysisResults: analysisDataObject, // Save the JS object directly (Prisma handles JSONB for PostgreSQL)
        },
      });
      console.log(`[API /analyze] Curriculum ${id} updated successfully.`);

      const serializedUpdatedCurriculum = {
        ...updatedCurriculum,
        // analysisResults is already an object (or null) from Prisma when using Json type
        analysisResults: updatedCurriculum.analysisResults || {}, 
        uploadedAt: updatedCurriculum.uploadedAt.toISOString(),
        updatedAt: updatedCurriculum.updatedAt.toISOString(),
      };

      return res.status(200).json({ message: "Enhanced analysis complete and results saved.", curriculum: serializedUpdatedCurriculum });

    } catch (error) {
      console.error(`[API /analyze] Critical error for curriculum ID ${id}:`, error.message, error.stack, error);
      if (!res.headersSent) {
        if (error.code === 'P2025') {
          return res.status(404).json({ error: "Curriculum not found to update." });
        }
        return res.status(500).json({ error: "Unable to analyze curriculum due to a server error. Check server logs." });
      }
    }
  } else {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
