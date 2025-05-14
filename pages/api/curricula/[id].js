// File: pages/api/curricula/[id].js
import prisma from '../../../lib/prisma';

export default async function handler(req, res) {
  const { id } = req.query;
  console.log(`[API /curricula/${id}] Received request: ${req.method}`);

  if (!id) {
    console.log(`[API /curricula/${id}] Error: Curriculum ID is missing.`);
    return res.status(400).json({ error: "Curriculum ID is required." });
  }

  if (req.method === 'GET') {
    try {
      console.log(`[API GET /curricula/${id}] Fetching curriculum...`);
      const curriculum = await prisma.curriculum.findUnique({
        where: { id: String(id) },
      });

      if (curriculum) {
        console.log(`[API GET /curricula/${id}] Curriculum found: ${curriculum.name}`);
        const serializedCurriculum = {
          ...curriculum,
          uploadedAt: curriculum.uploadedAt.toISOString(),
          updatedAt: curriculum.updatedAt.toISOString(),
          analysisResults: curriculum.analysisResults || {}, // Already an object or null
        };
        return res.status(200).json(serializedCurriculum);
      } else {
        console.log(`[API GET /curricula/${id}] Curriculum not found.`);
        return res.status(404).json({ error: "Curriculum not found." });
      }
    } catch (error) {
      console.error(`[API GET /curricula/${id}] Failed to fetch curriculum:`, error.message, error.stack);
      if (!res.headersSent) {
        return res.status(500).json({ error: "Unable to fetch curriculum. Please try again later." });
      }
    }
  } else if (req.method === 'PUT') {
    console.log(`[API PUT /curricula/${id}] Received request to update curriculum.`);
    try {
      const requestBody = req.body;
      console.log(`[API PUT /curricula/${id}] Request body:`, requestBody);
      const dataToUpdate = {};

      if (requestBody.hasOwnProperty('name')) dataToUpdate.name = requestBody.name;
      if (requestBody.hasOwnProperty('schoolTag')) dataToUpdate.schoolTag = requestBody.schoolTag;
      if (requestBody.hasOwnProperty('filePath')) dataToUpdate.filePath = requestBody.filePath;
      
      // analysisResults comes as an object from the client, save directly for JSONB
      if (requestBody.hasOwnProperty('analysisResults')) {
        dataToUpdate.analysisResults = requestBody.analysisResults || {};
      }

      if (Object.keys(dataToUpdate).length === 0) {
        console.log(`[API PUT /curricula/${id}] No valid fields provided for update.`);
        return res.status(400).json({ error: "No valid fields provided for update." });
      }
      console.log(`[API PUT /curricula/${id}] Data for Prisma update:`, dataToUpdate);

      const updatedCurriculum = await prisma.curriculum.update({
        where: { id: String(id) },
        data: dataToUpdate,
      });
      console.log(`[API PUT /curricula/${id}] Curriculum updated successfully.`);
      
      const serializedUpdatedCurriculum = {
        ...updatedCurriculum,
        uploadedAt: updatedCurriculum.uploadedAt.toISOString(),
        updatedAt: updatedCurriculum.updatedAt.toISOString(),
        analysisResults: updatedCurriculum.analysisResults || {}, // Already an object
      };
      return res.status(200).json(serializedUpdatedCurriculum);
    } catch (error) {
      console.error(`[API PUT /curricula/${id}] Failed to update curriculum:`, error.message, error.stack, error.code);
      if (!res.headersSent) {
        if (error.code === 'P2025') { // Prisma error code for record not found
          return res.status(404).json({ error: "Curriculum not found for update." });
        } else {
          return res.status(500).json({ error: "Unable to update curriculum." });
        }
      }
    }
  } else if (req.method === 'DELETE') {
    console.log(`[API DELETE /curricula/${id}] Received request to delete curriculum.`);
    try {
      await prisma.curriculum.delete({
        where: { id: String(id) },
      });
      console.log(`[API DELETE /curricula/${id}] Successfully deleted curriculum.`);
      return res.status(204).end();
    } catch (error) {
      console.error(`[API DELETE /curricula/${id}] Failed to delete curriculum:`, error.message, error.stack, error.code);
      if (!res.headersSent) {
        if (error.code === 'P2025') {
          return res.status(404).json({ error: "Curriculum not found for deletion." });
        } else {
          return res.status(500).json({ error: "Unable to delete curriculum. Check server logs for details." });
        }
      }
    }
  } else {
    console.log(`[API /curricula/${id}] Method ${req.method} Not Allowed.`);
    res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
