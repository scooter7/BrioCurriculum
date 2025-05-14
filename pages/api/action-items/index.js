// File: pages/api/action-items/index.js
import prisma from '../../../lib/prisma'; // Adjust path to your prisma client

export default async function handler(req, res) {
  console.log(`[API /action-items] Received request: ${req.method} ${req.url}`);

  if (req.method === 'GET') {
    const { curriculumId } = req.query;
    console.log(`[API GET /action-items] Query params:`, req.query);

    if (!curriculumId) {
      console.log("[API GET /action-items] Error: Curriculum ID is missing.");
      return res.status(400).json({ error: "Curriculum ID is required to fetch action items." });
    }

    try {
      console.log(`[API GET /action-items] Fetching action items for curriculumId: ${curriculumId}`);
      const actionItems = await prisma.actionItem.findMany({
        where: {
          curriculumId: String(curriculumId),
        },
        orderBy: {
          createdAt: 'asc',
        },
      });
      console.log(`[API GET /action-items] Found ${actionItems.length} action items.`);

      const serializedActionItems = actionItems.map(item => ({
        ...item,
        startDate: item.startDate ? item.startDate.toISOString() : null,
        endDate: item.endDate ? item.endDate.toISOString() : null,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      }));
      
      console.log(`[API GET /action-items] Sending ${serializedActionItems.length} serialized action items.`);
      return res.status(200).json(serializedActionItems); // Explicit return

    } catch (error) {
      console.error(`[API GET /action-items] Failed to fetch action items for curriculum ${curriculumId}:`, error.message, error.stack);
      // Ensure a response is sent even in case of an unexpected error during processing
      if (!res.headersSent) {
        return res.status(500).json({ error: "Unable to fetch action items due to a server error." });
      }
    }
  } else if (req.method === 'POST') {
    console.log("[API POST /action-items] Received request to create action item.");
    try {
      const { title, curriculumId, status, startDate, endDate } = req.body;
      console.log("[API POST /action-items] Request body:", req.body);

      if (!title || !curriculumId) {
        console.error("[API POST /action-items] Validation failed: Title or CurriculumId missing.");
        return res.status(400).json({ error: "Title and Curriculum ID are required." });
      }

      let startDateTime = null;
      if (startDate) {
        startDateTime = new Date(startDate);
        if (isNaN(startDateTime.getTime())) {
          console.error("[API POST /action-items] Invalid start date format:", startDate);
          return res.status(400).json({ error: "Invalid start date format." });
        }
      }

      let endDateTime = null;
      if (endDate) {
        endDateTime = new Date(endDate);
        if (isNaN(endDateTime.getTime())) {
          console.error("[API POST /action-items] Invalid end date format:", endDate);
          return res.status(400).json({ error: "Invalid end date format." });
        }
      }
      
      if (startDateTime && endDateTime && endDateTime < startDateTime) {
        console.error("[API POST /action-items] Validation failed: End date before start date.");
        return res.status(400).json({ error: "End date cannot be before start date." });
      }

      const dataToCreate = {
        title,
        curriculumId: String(curriculumId),
        status: status || "Not Started",
        startDate: startDateTime,
        endDate: endDateTime,
      };
      console.log("[API POST /action-items] Data for Prisma create:", dataToCreate);

      const newActionItem = await prisma.actionItem.create({
        data: dataToCreate,
      });
      console.log("[API POST /action-items] Action item created successfully:", newActionItem.id);

      const serializedNewActionItem = {
        ...newActionItem,
        startDate: newActionItem.startDate ? newActionItem.startDate.toISOString() : null,
        endDate: newActionItem.endDate ? newActionItem.endDate.toISOString() : null,
        createdAt: newActionItem.createdAt.toISOString(),
        updatedAt: newActionItem.updatedAt.toISOString(),
      };

      return res.status(201).json(serializedNewActionItem); // Explicit return

    } catch (error) {
      console.error("[API POST /action-items] Error creating action item:", error.message, error.stack, error.code);
      if (!res.headersSent) {
        if (error.code === 'P2003') {
          return res.status(400).json({ error: "Invalid curriculumId. The specified curriculum does not exist or there was a foreign key violation." });
        }
        return res.status(500).json({ error: "Unable to create action item. Check server logs." });
      }
    }
  } else {
    console.log(`[API /action-items] Method ${req.method} Not Allowed.`);
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`); // Explicit return
  }

  // Fallback safety net - should ideally not be reached if all paths are handled
  if (!res.headersSent) {
    console.error("[API /action-items] Fallback: API resolved without sending a response for method:", req.method);
    res.status(500).json({ error: "Server failed to send a response." });
  }
}
