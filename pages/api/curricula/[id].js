// File: pages/api/curricula/[id].js
import prisma from '../../../lib/prisma';

export default async function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: "Curriculum ID is required." });
  }

  if (req.method === 'GET') {
    try {
      const curriculum = await prisma.curriculum.findUnique({
        where: { id: String(id) },
      });

      if (curriculum) {
        const serializedCurriculum = {
          ...curriculum,
          uploadedAt: curriculum.uploadedAt.toISOString(),
          updatedAt: curriculum.updatedAt.toISOString(),
          analysisResults: curriculum.analysisResults ? JSON.parse(curriculum.analysisResults) : {}, // Parse string to JSON
        };
        res.status(200).json(serializedCurriculum);
      } else {
        res.status(404).json({ error: "Curriculum not found." });
      }
    } catch (error) {
      console.error(`Failed to fetch curriculum with ID ${id}:`, error);
      res.status(500).json({ error: "Unable to fetch curriculum. Please try again later." });
    }
  }
  else if (req.method === 'PUT') {
    try {
      const requestBody = req.body;
      const dataToUpdate = {};

      if (requestBody.hasOwnProperty('name')) dataToUpdate.name = requestBody.name;
      if (requestBody.hasOwnProperty('schoolTag')) dataToUpdate.schoolTag = requestBody.schoolTag;
      if (requestBody.hasOwnProperty('filePath')) dataToUpdate.filePath = requestBody.filePath;
      
      // If analysisResults is being updated, it should come as an object from the client
      // We need to stringify it before saving to the String field in SQLite
      if (requestBody.hasOwnProperty('analysisResults')) {
        dataToUpdate.analysisResults = JSON.stringify(requestBody.analysisResults || {});
      }


      if (Object.keys(dataToUpdate).length === 0) {
        return res.status(400).json({ error: "No valid fields provided for update." });
      }

      const updatedCurriculum = await prisma.curriculum.update({
        where: { id: String(id) },
        data: dataToUpdate,
      });
      
      const serializedUpdatedCurriculum = {
        ...updatedCurriculum,
        uploadedAt: updatedCurriculum.uploadedAt.toISOString(),
        updatedAt: updatedCurriculum.updatedAt.toISOString(),
        analysisResults: updatedCurriculum.analysisResults ? JSON.parse(updatedCurriculum.analysisResults) : {}, // Parse for response
      };
      res.status(200).json(serializedUpdatedCurriculum);
    } catch (error) {
      console.error(`Failed to update curriculum with ID ${id}:`, error);
      if (error.code === 'P2025') {
        res.status(404).json({ error: "Curriculum not found for update." });
      } else {
        res.status(500).json({ error: "Unable to update curriculum." });
      }
    }
  }
  else if (req.method === 'DELETE') {
    // DELETE logic remains the same as it doesn't interact with analysisResults directly
    try {
      await prisma.curriculum.delete({
        where: { id: String(id) },
      });
      res.status(204).end();
    } catch (error) {
      console.error(`Failed to delete curriculum with ID ${id}:`, error);
      if (error.code === 'P2025') {
        res.status(404).json({ error: "Curriculum not found for deletion." });
      } else {
        res.status(500).json({ error: "Unable to delete curriculum." });
      }
    }
  }
  else {
    res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
