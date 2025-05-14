// File: pages/api/curricula/index.js
import prisma from '../../../lib/prisma';
import { put } from '@vercel/blob';
import { IncomingForm } from 'formidable';
import fs from 'fs'; // Import fs for reading file content

// Disable Next.js body parsing for this route to handle multipart/form-data
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  console.log(`[API /curricula] Received request: ${req.method} ${req.url}`);

  if (req.method === 'GET') {
    try {
      console.log("[API GET /curricula] Fetching all curricula...");
      const curricula = await prisma.curriculum.findMany({
        select: {
          id: true,
          name: true,
          schoolTag: true,
          uploadedAt: true,
          updatedAt: true,
          analysisResults: true, // Prisma handles JSON object directly for PostgreSQL
        },
        orderBy: {
          uploadedAt: 'desc',
        },
      });
      console.log(`[API GET /curricula] Found ${curricula.length} curricula.`);

      // Serialize Date objects and ensure analysisResults is an object
      const serializedCurricula = curricula.map(c => ({
        ...c,
        uploadedAt: c.uploadedAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        analysisResults: c.analysisResults || {}, // Ensure it's an object, or default to empty
      }));
      
      console.log(`[API GET /curricula] Sending ${serializedCurricula.length} serialized curricula.`);
      return res.status(200).json(serializedCurricula);
    } catch (error) {
      console.error("[API GET /curricula] Failed to fetch curricula:", error.message, error.stack);
      if (!res.headersSent) {
        return res.status(500).json({ error: "Unable to fetch curricula. Please try again later." });
      }
    }
  } else if (req.method === 'POST') {
    console.log("[API POST /curricula] Received request to create curriculum.");
    const form = new IncomingForm();

    form.parse(req, async (err, fields, files) => {
      if (err) {
        console.error("[API POST /curricula] Error parsing form data:", err);
        return res.status(500).json({ error: 'Error parsing form data.' });
      }

      try {
        const name = Array.isArray(fields.name) ? fields.name[0] : fields.name;
        const schoolTag = Array.isArray(fields.schoolTag) ? fields.schoolTag[0] : fields.schoolTag;
        const curriculumFile = files.curriculumFile;

        console.log("[API POST /curricula] Parsed fields:", { name, schoolTag });
        // console.log("[API POST /curricula] Parsed file (full object):", curriculumFile); // Can be very verbose

        if (!name || !curriculumFile || (Array.isArray(curriculumFile) && curriculumFile.length === 0)) {
          console.error("[API POST /curricula] Validation failed: Name or curriculumFile missing.");
          return res.status(400).json({ error: "Curriculum name and file are required." });
        }
        
        const fileToUpload = Array.isArray(curriculumFile) ? curriculumFile[0] : curriculumFile;

        if (!fileToUpload || !fileToUpload.originalFilename || !fileToUpload.filepath) {
            console.error("[API POST /curricula] File object is invalid or missing properties.");
            return res.status(400).json({ error: "Invalid file uploaded." });
        }
        console.log(`[API POST /curricula] File to upload: ${fileToUpload.originalFilename}, temp path: ${fileToUpload.filepath}, mimetype: ${fileToUpload.mimetype}`);


        console.log(`[API POST /curricula] Uploading file: ${fileToUpload.originalFilename} to Vercel Blob...`);
        
        const fileContent = fs.readFileSync(fileToUpload.filepath);

        const blob = await put(
          `curricula/${Date.now()}-${fileToUpload.originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_')}`, // Further sanitize filename
          fileContent,
          {
            access: 'public',
            contentType: fileToUpload.mimetype || 'application/octet-stream', // Provide a default content type
          }
        );
        console.log("[API POST /curricula] File uploaded to Vercel Blob:", blob.url);

        const initialAnalysisResultsObject = {}; // Store as an object for PostgreSQL JSON type

        const newCurriculum = await prisma.curriculum.create({
          data: {
            name,
            originalFileName: fileToUpload.originalFilename,
            schoolTag: schoolTag || null,
            filePath: blob.url,
            analysisResults: initialAnalysisResultsObject, // Pass object directly
          },
        });
        console.log("[API POST /curricula] Curriculum record created in DB:", newCurriculum.id);

        const serializedNewCurriculum = {
          ...newCurriculum,
          uploadedAt: newCurriculum.uploadedAt.toISOString(),
          updatedAt: newCurriculum.updatedAt.toISOString(),
          analysisResults: newCurriculum.analysisResults || {}, // Already an object
        };

        return res.status(201).json(serializedNewCurriculum);

      } catch (error) {
        console.error("[API POST /curricula] Error creating curriculum or uploading file:", error.message, error.stack);
        if (!res.headersSent) {
          return res.status(500).json({ error: "Unable to create curriculum or upload file. " + error.message });
        }
      } finally {
        // Clean up temporary file if formidable created one and it still exists
        if (files.curriculumFile) {
            const fileToDelete = Array.isArray(files.curriculumFile) ? files.curriculumFile[0] : files.curriculumFile;
            if (fileToDelete && fileToDelete.filepath) {
                fs.unlink(fileToDelete.filepath, (unlinkErr) => {
                    if (unlinkErr) console.error("[API POST /curricula] Error deleting temp file:", unlinkErr);
                    else console.log("[API POST /curricula] Temp file deleted:", fileToDelete.filepath);
                });
            }
        }
      }
    });
  } else {
    console.log(`[API /curricula] Method ${req.method} Not Allowed.`);
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
