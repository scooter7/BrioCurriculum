// File: pages/api/curricula/index.js
import prisma from '../../../lib/prisma';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const curricula = await prisma.curriculum.findMany({
        select: {
          id: true,
          name: true,
          schoolTag: true,
          uploadedAt: true,
          updatedAt: true,
          analysisResults: true, // Include analysisResults to parse it
        },
        orderBy: {
          uploadedAt: 'desc',
        },
      });
      const serializedCurricula = curricula.map(c => ({
        ...c,
        uploadedAt: c.uploadedAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        // Parse analysisResults string back to JSON for client, or handle if null/empty
        analysisResults: c.analysisResults ? JSON.parse(c.analysisResults) : {},
      }));
      res.status(200).json(serializedCurricula);
    } catch (error) {
      console.error("Failed to fetch curricula:", error);
      res.status(500).json({ error: "Unable to fetch curricula. Please try again later." });
    }
  }
  else if (req.method === 'POST') {
    try {
      const { name, originalFileName, schoolTag, userId } = req.body;

      if (!name || !originalFileName) {
        return res.status(400).json({ error: "Curriculum name and original file name are required." });
      }

      const simulatedFilePath = `uploads/mock/${originalFileName}`;
      const initialAnalysisResultsObject = {}; // Start with an empty object
      const initialAnalysisResultsString = JSON.stringify(initialAnalysisResultsObject); // Stringify it

      const newCurriculum = await prisma.curriculum.create({
        data: {
          name,
          originalFileName,
          schoolTag: schoolTag || null,
          filePath: simulatedFilePath,
          analysisResults: initialAnalysisResultsString, // Save stringified empty JSON
          // userId: userId || null,
        },
      });

      const serializedNewCurriculum = {
        ...newCurriculum,
        uploadedAt: newCurriculum.uploadedAt.toISOString(),
        updatedAt: newCurriculum.updatedAt.toISOString(),
        // Parse analysisResults string back to JSON for client response
        analysisResults: JSON.parse(newCurriculum.analysisResults || '{}'),
      };

      res.status(201).json(serializedNewCurriculum);
    } catch (error) {
      console.error("Failed to create curriculum:", error);
      res.status(500).json({ error: "Unable to create curriculum." });
    }
  }
  else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
