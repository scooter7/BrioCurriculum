// File: pages/api/curricula/index.js
import prisma from '../../../lib/prisma';
import { put } from '@vercel/blob';
import { IncomingForm } from 'formidable';
import fs from 'fs';
import path from 'path'; // For working with file paths

export const config = {
  api: {
    bodyParser: false, // Necessary for formidable to parse multipart/form-data
  },
};

export default async function handler(req, res) {
  if (req.method === 'GET') {
    // GET handler remains the same (ensure analysisResults is handled as object for PG)
    try {
      const curricula = await prisma.curriculum.findMany({
        select: {
          id: true, name: true, schoolTag: true, uploadedAt: true, updatedAt: true, 
          analysisResults: true,
        },
        orderBy: { uploadedAt: 'desc' },
      });
      const serializedCurricula = curricula.map(c => ({
        ...c,
        uploadedAt: c.uploadedAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        analysisResults: c.analysisResults || {}, // Already an object with Json type
      }));
      return res.status(200).json(serializedCurricula);
    } catch (error) {
      console.error("[API GET /curricula] Failed to fetch curricula:", error.message, error.stack);
      return res.status(500).json({ error: "Unable to fetch curricula." });
    }
  } else if (req.method === 'POST') {
    console.log("[API POST /curricula] Received request to create curriculum.");
    
    const form = new IncomingForm({
        uploadDir: "/tmp", // Vercel serverless functions can write to /tmp
        keepExtensions: true,
        multiples: false, // Handle single file upload for 'curriculumFile'
    });

    form.parse(req, async (err, fields, files) => {
      console.log("[API POST /curricula] Formidable parsing initiated.");
      console.log("[API POST /curricula] Formidable raw error (if any):", err);
      console.log("[API POST /curricula] Raw Fields from formidable:", JSON.stringify(fields, null, 2));
      console.log("[API POST /curricula] Raw Files from formidable:", JSON.stringify(files, (key, value) => {
        // Avoid logging large file content if files object contains it directly
        if (key === 'buffer' && value && value.type === 'Buffer') {
          return `Buffer data (${value.data.length} bytes)`;
        }
        return value;
      }, 2));


      if (err) {
        console.error("[API POST /curricula] Error parsing form data with formidable:", err);
        return res.status(500).json({ error: 'Error parsing form data.' });
      }

      let tempFilePath = null; // To ensure cleanup

      try {
        // Formidable wraps single string fields in arrays. Access the first element.
        const name = fields.name && Array.isArray(fields.name) && fields.name.length > 0 ? fields.name[0].trim() : null;
        const schoolTag = fields.schoolTag && Array.isArray(fields.schoolTag) && fields.schoolTag.length > 0 ? fields.schoolTag[0].trim() : null;
        
        // 'curriculumFile' should match the name attribute in your form's file input
        const curriculumFileArray = files.curriculumFile; 
        const fileToUpload = curriculumFileArray && Array.isArray(curriculumFileArray) && curriculumFileArray.length > 0 ? curriculumFileArray[0] : null;
        
        tempFilePath = fileToUpload?.filepath; // Store for cleanup

        console.log("[API POST /curricula] Extracted name:", name);
        console.log("[API POST /curricula] Extracted schoolTag:", schoolTag); // Will be null if empty
        console.log("[API POST /curricula] Extracted fileToUpload (metadata):", fileToUpload ? { originalFilename: fileToUpload.originalFilename, filepath: fileToUpload.filepath, mimetype: fileToUpload.mimetype, size: fileToUpload.size } : "No file object found");

        if (!name) {
          console.error("[API POST /curricula] Validation failed: Curriculum name is missing or empty.");
          return res.status(400).json({ error: "Curriculum name is required." });
        }
        if (!fileToUpload) {
            console.error("[API POST /curricula] Validation failed: No curriculum file was uploaded or processed correctly.");
            return res.status(400).json({ error: "Curriculum file is required." });
        }
        if (!fileToUpload.originalFilename || !fileToUpload.filepath || !fileToUpload.mimetype) {
            console.error("[API POST /curricula] File object is invalid (missing originalFilename, filepath, or mimetype). File object:", fileToUpload);
            return res.status(400).json({ error: "Uploaded file data is incomplete or corrupted." });
        }

        console.log(`[API POST /curricula] Uploading file: ${fileToUpload.originalFilename} from temp path: ${fileToUpload.filepath} to Vercel Blob...`);
        
        const fileContent = fs.readFileSync(fileToUpload.filepath);
        const blobFileName = `curricula/${Date.now()}-${path.basename(fileToUpload.originalFilename).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        console.log(`[API POST /curricula] Vercel Blob target filename: ${blobFileName}`);

        const blob = await put(
          blobFileName,
          fileContent,
          {
            access: 'public',
            contentType: fileToUpload.mimetype,
          }
        );
        console.log("[API POST /curricula] File uploaded to Vercel Blob:", blob.url);

        const initialAnalysisResultsObject = {}; // Stored as JSONB in PostgreSQL

        const newCurriculum = await prisma.curriculum.create({
          data: {
            name,
            originalFileName: fileToUpload.originalFilename,
            schoolTag: schoolTag || null, // Ensure it's null if empty string or not provided
            filePath: blob.url,
            analysisResults: initialAnalysisResultsObject, // Prisma handles JSON object directly
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
        console.error("[API POST /curricula] Error in try block after form parse:", error.message, error.stack);
        if (!res.headersSent) {
          return res.status(500).json({ error: "Unable to create curriculum or upload file. " + error.message });
        }
      } finally {
        // Clean up temporary file if it exists
        if (tempFilePath) {
            fs.unlink(tempFilePath, (unlinkErr) => {
                if (unlinkErr) console.error("[API POST /curricula] Error deleting temp file:", tempFilePath, unlinkErr);
                else console.log("[API POST /curricula] Temp file deleted:", tempFilePath);
            });
        }
      }
    });
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
