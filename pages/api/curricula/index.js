// File: pages/api/curricula/index.js
import prisma from '../../../lib/prisma';
import { put } from '@vercel/blob';
import formidable from 'formidable'; // Import formidable itself
import fs from 'fs';
import path from 'path';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method === 'GET') {
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
    
    const form = formidable({
        uploadDir: "/tmp",
        keepExtensions: true,
        multiples: false, // Important for single file uploads
    });

    // Add event listeners for debugging formidable's process
    form.on('error', (err) => {
        console.error('[Formidable] Error event during parsing:', err);
    });
    form.on('field', (name, value) => {
        console.log(`[Formidable] Field received: name=${name}, value=${value.substring(0,100)}...`); // Log snippet of value
    });
    form.on('fileBegin', (name, file) => {
        console.log(`[Formidable] fileBegin: inputName=${name}, originalFilename=${file.originalFilename}, tempFilepath=${file.filepath}`);
    });
    form.on('file', (name, file) => {
        console.log(`[Formidable] File successfully parsed: inputName=${name}, originalFilename=${file.originalFilename}, size=${file.size}, tempFilepath=${file.filepath}, mimetype=${file.mimetype}`);
    });
    form.on('aborted', () => {
        console.log('[Formidable] Request aborted by the user');
    });
    form.on('end', () => {
        console.log('[Formidable] Parsing finished');
    });

    let tempFilePath = null;

    try {
        // Use promise-based parsing with formidable v3+
        const [fields, files] = await form.parse(req);
        
        console.log("[API POST /curricula] Formidable finished parsing.");
        console.log("[API POST /curricula] Parsed Fields:", JSON.stringify(fields, null, 2));
        console.log("[API POST /curricula] Parsed Files:", JSON.stringify(files, (key, value) => {
            if (key === 'buffer' && value && value.type === 'Buffer') return `Buffer data (${value.data.length} bytes)`;
            if (value instanceof formidable.File) { // Log relevant File properties
                return { originalFilename: value.originalFilename, newFilename: value.newFilename, filepath: value.filepath, mimetype: value.mimetype, size: value.size };
            }
            return value;
        }, 2));

        const rawName = fields.name;
        const name = rawName ? (Array.isArray(rawName) ? rawName[0]?.trim() : String(rawName).trim()) : null;
        
        const rawSchoolTag = fields.schoolTag;
        const schoolTag = rawSchoolTag ? (Array.isArray(rawSchoolTag) ? rawSchoolTag[0]?.trim() : String(rawSchoolTag).trim()) : null;
        
        // The key for the file in the 'files' object should match the 'name' attribute of your <input type="file">
        const fileToUpload = files.curriculumFile; // This should be a File object if 'curriculumFile' is the input name
        
        tempFilePath = fileToUpload?.filepath;

        console.log("[API POST /curricula] Extracted name:", name);
        console.log("[API POST /curricula] Extracted schoolTag:", schoolTag);
        console.log("[API POST /curricula] Extracted fileToUpload (object directly from files.curriculumFile):", fileToUpload ? { originalFilename: fileToUpload.originalFilename, newFilename: fileToUpload.newFilename, filepath: fileToUpload.filepath, mimetype: fileToUpload.mimetype, size: fileToUpload.size } : "No file object found under 'curriculumFile'");

        if (!name) {
          console.error("[API POST /curricula] Validation failed: Curriculum name is missing or empty after processing.");
          return res.status(400).json({ error: "Curriculum name is required." });
        }
        if (!fileToUpload) {
            console.error("[API POST /curricula] Validation failed: No curriculum file was uploaded or processed correctly (fileToUpload is falsy).");
            return res.status(400).json({ error: "Curriculum file is required." });
        }
        if (!fileToUpload.originalFilename || !fileToUpload.filepath || !fileToUpload.mimetype) {
            console.error("[API POST /curricula] File object is invalid (missing originalFilename, filepath, or mimetype). File object:", fileToUpload);
            return res.status(400).json({ error: "Uploaded file data is incomplete or corrupted." });
        }

        console.log(`[API POST /curricula] Uploading file: ${fileToUpload.originalFilename} from temp path: ${fileToUpload.filepath} to Vercel Blob...`);
        
        const fileContent = fs.readFileSync(fileToUpload.filepath);
        const blobFileName = `curricula/${Date.now()}-${path.basename(fileToUpload.originalFilename).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        
        const blob = await put(
          blobFileName,
          fileContent,
          { access: 'public', contentType: fileToUpload.mimetype }
        );
        console.log("[API POST /curricula] File uploaded to Vercel Blob:", blob.url);

        const newCurriculum = await prisma.curriculum.create({
          data: {
            name,
            originalFileName: fileToUpload.originalFilename,
            schoolTag: schoolTag || null,
            filePath: blob.url,
            analysisResults: {}, // Store as JSON object
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
        console.error("[API POST /curricula] Error after formidable parse or during DB/Blob operation:", error.message, error.stack);
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
    // formidable v3 with await form.parse(req) doesn't use a callback like form.parse(req, (err, fields, files) => {...})
    // The try/catch around await form.parse(req) will handle parsing errors.
    // However, the event listeners are still useful for debugging what formidable is seeing.
    // For the promise-based API, the main logic moves into the try block after `await form.parse(req)`.
    } else {
        res.setHeader('Allow', ['GET', 'POST']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }
}
