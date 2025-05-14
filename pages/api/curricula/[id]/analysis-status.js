// File: pages/api/curricula/[id]/analysis-status.js
import prisma from '../../../../lib/prisma';

export default async function handler(req, res) {
  const { id } = req.query;
  // console.log(`[API /analysis-status] Received GET request for curriculum ID: ${id}`);

  if (req.method === 'GET') {
    try {
      const curriculum = await prisma.curriculum.findUnique({
        where: { id: String(id) },
        select: {
          id: true,
          name: true,
          analysisStatus: true,
          analysisError: true,
          analysisResults: true, // Send full results if completed
          lastAnalysisTriggeredAt: true,
          lastAnalysisCompletedAt: true,
          updatedAt: true, // For general update timestamp
        },
      });

      if (!curriculum) {
        return res.status(404).json({ error: "Curriculum not found." });
      }

      const responseData = {
        ...curriculum,
        analysisResults: curriculum.analysisResults || {},
        lastAnalysisTriggeredAt: curriculum.lastAnalysisTriggeredAt?.toISOString() || null,
        lastAnalysisCompletedAt: curriculum.lastAnalysisCompletedAt?.toISOString() || null,
        updatedAt: curriculum.updatedAt.toISOString(),
      };
      
      return res.status(200).json(responseData);

    } catch (error) {
      console.error(`[API /analysis-status] Error fetching status for ${id}:`, error.message, error.stack);
      if (!res.headersSent) {
        return res.status(500).json({ error: "Unable to fetch analysis status." });
      }
    }
  } else {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
