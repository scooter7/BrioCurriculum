// File: pages/api/curricula/[id]/trigger-analysis.js
import prisma from '../../../../lib/prisma';
// We will import the actual analysis function from a separate file
import { performFullAnalysis } from './perform-actual-analysis-worker'; // We'll create/refactor this next

export default async function handler(req, res) {
  const { id } = req.query;
  console.log(`[API /trigger-analysis] Received POST request for curriculum ID: ${id}`);

  if (req.method === 'POST') {
    let updatedCurriculumForResponse;
    try {
      const curriculumExists = await prisma.curriculum.findUnique({ 
        where: { id: String(id) },
        select: { id: true } // Just check existence
      });

      if (!curriculumExists) {
        console.log(`[API /trigger-analysis] Curriculum ${id} not found.`);
        return res.status(404).json({ error: "Curriculum not found." });
      }

      // Update status to PROCESSING and clear old results/errors
      // Also set lastAnalysisTriggeredAt
      const updatedCurriculum = await prisma.curriculum.update({
        where: { id: String(id) },
        data: {
          analysisStatus: "PROCESSING",
          analysisResults: Prisma.JsonNull, // Explicitly set to JSON null to clear it
          analysisError: null,
          lastAnalysisTriggeredAt: new Date(),
          lastAnalysisCompletedAt: null, // Clear previous completion time
        },
      });
      console.log(`[API /trigger-analysis] Curriculum ${id} status set to PROCESSING.`);
      
      updatedCurriculumForResponse = {
        ...updatedCurriculum,
        analysisResults: {}, // Send empty object for consistency in response
        uploadedAt: updatedCurriculum.uploadedAt.toISOString(),
        updatedAt: updatedCurriculum.updatedAt.toISOString(),
        lastAnalysisTriggeredAt: updatedCurriculum.lastAnalysisTriggeredAt?.toISOString(),
        lastAnalysisCompletedAt: null,
      };

      // Respond to client immediately that processing has started
      res.status(202).json({ 
        message: "Analysis has been initiated. Please check status periodically.",
        curriculum: updatedCurriculumForResponse
      });

      // "Fire-and-forget" the actual analysis.
      // This will run in the background (within Vercel's function execution limits).
      // If performFullAnalysis itself is too long, it will time out,
      // and its own finally block should update the DB status to FAILED.
      performFullAnalysis(id).catch(backgroundError => {
        console.error(`[API /trigger-analysis] Background analysis for ${id} CRASHED UNEXPECTEDLY:`, backgroundError.message, backgroundError.stack);
        // Attempt to mark as failed if not already handled by performFullAnalysis's finally block
        prisma.curriculum.update({
            where: { id: String(id) },
            data: { 
                analysisStatus: "FAILED", 
                analysisError: "Background task crashed: " + backgroundError.message,
                lastAnalysisCompletedAt: new Date(),
            }
        }).catch(dbUpdateError => console.error(`[API /trigger-analysis] Failed to update status to FAILED for ${id} after background task crash:`, dbUpdateError));
      });

    } catch (error) {
      console.error(`[API /trigger-analysis] Error starting analysis for ${id}:`, error.message, error.stack);
      if (!res.headersSent) { // Ensure response is only sent once
        if (error.code === 'P2025') { // Record to update not found
          return res.status(404).json({ error: "Curriculum not found to start analysis." });
        }
        return res.status(500).json({ error: "Unable to start analysis. " + error.message });
      }
    }
  } else {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
