// File: pages/api/curricula/[id]/trigger-analysis.js
import prisma from '../../../../lib/prisma'; // Your Prisma client instance
import { Prisma } from '@prisma/client';    // Import Prisma namespace for JsonNull
import { performFullAnalysis } from './perform-actual-analysis-worker';

export default async function handler(req, res) {
  const { id } = req.query;
  console.log(`[API /trigger-analysis] Received POST request for curriculum ID: ${id}`);

  if (req.method === 'POST') {
    let updatedCurriculumForResponse;
    try {
      const curriculumExists = await prisma.curriculum.findUnique({ 
        where: { id: String(id) },
        select: { id: true } 
      });

      if (!curriculumExists) {
        console.log(`[API /trigger-analysis] Curriculum ${id} not found.`);
        return res.status(404).json({ error: "Curriculum not found." });
      }

      const updatedCurriculum = await prisma.curriculum.update({
        where: { id: String(id) },
        data: {
          analysisStatus: "PROCESSING",
          analysisResults: Prisma.JsonNull, // Now Prisma.JsonNull is correctly referenced
          analysisError: null,
          lastAnalysisTriggeredAt: new Date(),
          lastAnalysisCompletedAt: null,
        },
      });
      console.log(`[API /trigger-analysis] Curriculum ${id} status set to PROCESSING.`);
      
      updatedCurriculumForResponse = {
        ...updatedCurriculum,
        analysisResults: {}, // Send empty object for consistency in this initial response
        uploadedAt: updatedCurriculum.uploadedAt.toISOString(),
        updatedAt: updatedCurriculum.updatedAt.toISOString(),
        lastAnalysisTriggeredAt: updatedCurriculum.lastAnalysisTriggeredAt?.toISOString(),
        lastAnalysisCompletedAt: null, // It hasn't completed yet
      };

      res.status(202).json({ 
        message: "Analysis has been initiated. Please check status periodically.",
        curriculum: updatedCurriculumForResponse
      });

      performFullAnalysis(id).catch(backgroundError => {
        console.error(`[API /trigger-analysis] Background analysis for ${id} CRASHED UNEXPECTEDLY:`, backgroundError.message, backgroundError.stack);
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
      if (!res.headersSent) {
        if (error.code === 'P2025') {
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
