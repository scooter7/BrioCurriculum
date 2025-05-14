// File: pages/api/action-items/[actionItemId].js
import prisma from '../../../lib/prisma'; // Adjust path

export default async function handler(req, res) {
  const { actionItemId } = req.query;

  if (!actionItemId) {
    return res.status(400).json({ error: "Action Item ID is required." });
  }

  if (req.method === 'PUT') {
    try {
      const { title, status, startDate, endDate } = req.body;
      const dataToUpdate = {};

      if (typeof title === 'string') dataToUpdate.title = title;
      if (typeof status === 'string') dataToUpdate.status = status;
      
      // Handle startDate update (allows setting to null or a new date)
      if (startDate !== undefined) {
        if (startDate === null || startDate === '') {
            dataToUpdate.startDate = null;
        } else {
            const startDateTime = new Date(startDate);
            if (isNaN(startDateTime.getTime())) {
                return res.status(400).json({ error: "Invalid start date format." });
            }
            dataToUpdate.startDate = startDateTime;
        }
      }

      // Handle endDate update (allows setting to null or a new date)
      if (endDate !== undefined) {
        if (endDate === null || endDate === '') {
            dataToUpdate.endDate = null;
        } else {
            const endDateTime = new Date(endDate);
            if (isNaN(endDateTime.getTime())) {
                return res.status(400).json({ error: "Invalid end date format." });
            }
            dataToUpdate.endDate = endDateTime;
        }
      }

      if (Object.keys(dataToUpdate).length === 0) {
        return res.status(400).json({ error: "No valid fields provided for update." });
      }

      const updatedActionItem = await prisma.actionItem.update({
        where: { id: String(actionItemId) },
        data: dataToUpdate,
      });

      const serializedActionItem = {
        ...updatedActionItem,
        startDate: updatedActionItem.startDate ? updatedActionItem.startDate.toISOString() : null,
        endDate: updatedActionItem.endDate ? updatedActionItem.endDate.toISOString() : null,
        createdAt: updatedActionItem.createdAt.toISOString(),
        updatedAt: updatedActionItem.updatedAt.toISOString(),
      };
      res.status(200).json(serializedActionItem);

    } catch (error) {
      console.error(`Failed to update action item ${actionItemId}:`, error);
      if (error.code === 'P2025') {
        return res.status(404).json({ error: "Action item not found for update." });
      }
      res.status(500).json({ error: "Unable to update action item." });
    }
  } else if (req.method === 'DELETE') {
    try {
      await prisma.actionItem.delete({
        where: { id: String(actionItemId) },
      });
      res.status(204).end();
    } catch (error) {
      console.error(`Failed to delete action item ${actionItemId}:`, error);
      if (error.code === 'P2025') {
        return res.status(404).json({ error: "Action item not found for deletion." });
      }
      res.status(500).json({ error: "Unable to delete action item." });
    }
  } else {
    res.setHeader('Allow', ['GET', 'PUT', 'DELETE']); // Note: GET for single item is not implemented here, but could be.
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
