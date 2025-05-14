// File: pages/api/curricula/index.js
import prisma from '../../../lib/prisma';
import { put } from '@vercel/blob';
import { IncomingForm } from 'formidable';
import fs from 'fs';
import path from 'path';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method === 'GET') {
    // ... (GET handler remains the same)
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
        analysisResults: c.analysisResults || {},
      }));
      return res.status(200).json(serializedCurricula);
    } catch (error) {
      console.error("[API GET /curricula] Failed to fetch curricula:", error.message, error.stack);
      return res.status(500).json({ error: "Unable to fetch curricula." });
    }
  } else if (req.method === 'POST') {
    console.log("[API POST /curricula] Received request to create curriculum.");
    
    const form = new IncomingForm({
        uploadDir: "/tmp",
        keepExtensions: true,
        multiples: false, // Expect a single file for 'curriculumFile'
    });

    form.parse(req, async (err, fields, files) => {
      console.log("[API POST /curricula] Formidable parsing initiated.");
      console.log("[API POST /curricula] Formidable raw error (if any):", err);
      // Log raw fields and files carefully
      console.log("[API POST /curricula] Raw Fields from formidable:", JSON.stringify(fields, null, 2));
      console.log("[API POST /curricula] Raw Files from formidable:", JSON.stringify(files, (key, value) => {
        if (key === 'buffer' && value && value.type === 'Buffer') return `Buffer data (${value.data.length} bytes)`;
        return value;
      }, 2));

      if (err) {
        console.error("[API POST /curricula] Error parsing form data with formidable:", err);
        return res.status(500).json({ error: 'Error parsing form data.' });
      }

      let tempFilePath = null;

      try {
        // Corrected field extraction: formidable might not always wrap single fields in arrays.
        // Check if it's an array first, then access [0]. If not an array, use the value directly.
        const rawName = fields.name;
        const name = rawName ? (Array.isArray(rawName) ? rawName[0]?.trim() : String(rawName).trim()) : null;
        
        const rawSchoolTag = fields.schoolTag;
        const schoolTag = rawSchoolTag ? (Array.isArray(rawSchoolTag) ? rawSchoolTag[0]?.trim() : String(rawSchoolTag).trim()) : null;
        
        // 'curriculumFile' should be the key in the 'files' object from formidable
        const curriculumFileObject = files.curriculumFile; 
        // If formidable is configured with multiples: false (default for single file inputs),
        // it should provide the file object directly, not in an array.
        // If it IS an array, take the first element.
        const fileToUpload = Array.isArray(curriculumFileObject) && curriculumFileObject.length > 0 ? curriculumFileObject[0] : curriculumFileObject;
        
        tempFilePath = fileToUpload?.filepath;

        console.log("[API POST /curricula] Extracted name:", name);
        console.log("[API POST /curricula] Extracted schoolTag:", schoolTag);
        console.log("[API POST /curricula] Extracted fileToUpload (object):", fileToUpload ? { originalFilename: fileToUpload.originalFilename, newFilename: fileToUpload.newFilename, filepath: fileToUpload.filepath, mimetype: fileToUpload.mimetype, size: fileToUpload.size } : "No file object found under 'curriculumFile'");

        if (!name) {
          console.error("[API POST /curricula] Validation failed: Curriculum name is missing or empty after processing.");
          return res.status(400).json({ error: "Curriculum name is required." });
        }
        if (!fileToUpload) {
            console.error("[API POST /curricula] Validation failed: No curriculum file was uploaded or processed correctly.");
            return res.status(400).json({ error: "Curriculum file is required." });
        }
        // Formidable v3 uses 'newFilename' for the path of the uploaded file in uploadDir
        if (!fileToUpload.originalFilename || !fileToUpload.filepath || !fileToUpload.mimetype) {
            console.error("[API POST /curricula] File object is invalid (missing originalFilename, filepath/newFilename, or mimetype). File object:", fileToUpload);
            return res.status(400).json({ error: "Uploaded file data is incomplete or corrupted." });
        }

        console.log(`[API POST /curricula] Uploading file: ${fileToUpload.originalFilename} from temp path: ${fileToUpload.filepath} to Vercel Blob...`);
        
        const fileContent = fs.readFileSync(fileToUpload.filepath);
        const blobFileName = `curricula/${Date.now()}-${path.basename(fileToUpload.originalFilename).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        console.log(`[API POST /curricula] Vercel Blob target filename: ${blobFileName}`);

        const blob = await put(
          blobFileName,
          fileContent,
          { access: 'public', contentType: fileToUpload.mimetype }
        );
        console.log("[API POST /curricula] File uploaded to Vercel Blob:", blob.url);

        const initialAnalysisResultsObject = {};

        const newCurriculum = await prisma.curriculum.create({
          data: {
            name,
            originalFileName: fileToUpload.originalFilename,
            schoolTag: schoolTag || null,
            filePath: blob.url,
            analysisResults: initialAnalysisResultsObject,
          },
        });
        console.log("[API POST /curricula] Curriculum record created in DB:", newCurriculum.id);

        const serializedNewCurriculum = {
          ...newCurriculum,
          uploadedAt: newCurriculum.uploadedAt.toISOString(),
          updatedAt: newCurriculum.updatedAt.toISOString(),
          analysisResults: newCurriculum.analysisResults || {},
        };

        return res.status(201).json(serializedNewCurriculum);

      } catch (error) {
        console.error("[API POST /curricula] Error in try block after form parse:", error.message, error.stack);
        if (!res.headersSent) {
          return res.status(500).json({ error: "Unable to create curriculum or upload file. " + error.message });
        }
      } finally {
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
