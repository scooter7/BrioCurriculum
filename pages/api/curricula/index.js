// File: pages/api/curricula/index.js
import prisma from '../../../lib/prisma';
import { put } from '@vercel/blob';
import formidable from 'formidable';
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
        multiples: false,
    });

    // Event listeners for debugging
    form.on('error', (err) => console.error('[Formidable Event - error]', err));
    form.on('field', (name, value) => console.log(`[Formidable Event - field] name="${name}", value snippet="${String(value).substring(0, 50)}..."`));
    form.on('fileBegin', (name, file) => console.log(`[Formidable Event - fileBegin] inputName=${name}, originalFilename=${file?.originalFilename}, tempFilepath=${file?.filepath}`));
    form.on('file', (name, file) => console.log(`[Formidable Event - file] inputName=${name}, originalFilename="${file?.originalFilename}", size=${file?.size}, temp path="${file?.filepath}", mimetype="${file?.mimetype}"`));
    form.on('aborted', () => console.log('[Formidable Event - aborted]'));
    form.on('end', () => console.log('[Formidable Event - end] Parsing finished.'));

    let tempFilePath = null;

    try {
        const [fields, files] = await form.parse(req);
        
        console.log("[API POST /curricula] Formidable finished parsing (await).");
        console.log("[API POST /curricula] Parsed Fields (await):", JSON.stringify(fields, null, 2));

        // Safer logging for the 'files' object
        const filesLoggable = {};
        for (const key in files) {
            if (Object.hasOwnProperty.call(files, key)) {
                const fileOrArray = files[key];
                if (Array.isArray(fileOrArray)) {
                    filesLoggable[key] = fileOrArray.map(f => f && typeof f === 'object' ? { originalFilename: f.originalFilename, filepath: f.filepath, mimetype: f.mimetype, size: f.size, newFilename: f.newFilename } : f);
                } else if (fileOrArray && typeof fileOrArray === 'object') {
                    filesLoggable[key] = { originalFilename: fileOrArray.originalFilename, filepath: fileOrArray.filepath, mimetype: fileOrArray.mimetype, size: fileOrArray.size, newFilename: fileOrArray.newFilename };
                } else {
                    filesLoggable[key] = fileOrArray;
                }
            }
        }
        console.log("[API POST /curricula] Parsed Files (await, loggable):", JSON.stringify(filesLoggable, null, 2));

        const rawName = fields.name;
        const name = rawName ? (Array.isArray(rawName) ? rawName[0]?.trim() : String(rawName).trim()) : null;
        
        const rawSchoolTag = fields.schoolTag;
        const schoolTag = rawSchoolTag ? (Array.isArray(rawSchoolTag) ? rawSchoolTag[0]?.trim() : String(rawSchoolTag).trim()) : null;
        
        // Extract file correctly, knowing 'files.curriculumFile' is an array
        const curriculumFileArray = files.curriculumFile;
        let fileToUpload = null;

        if (curriculumFileArray && Array.isArray(curriculumFileArray) && curriculumFileArray.length > 0) {
            fileToUpload = curriculumFileArray[0];
            console.log("[API POST /curricula] Extracted file from array. File object:", fileToUpload ? {originalFilename: fileToUpload.originalFilename, filepath: fileToUpload.filepath} : "undefined");
        } else if (curriculumFileArray && typeof curriculumFileArray === 'object' && curriculumFileArray.filepath) {
            // Fallback if it's not an array but a single file object (less likely with formidable v3 default for multiples:false for a named input)
            fileToUpload = curriculumFileArray;
             console.log("[API POST /curricula] Extracted file directly as object (fallback). File object:", fileToUpload ? {originalFilename: fileToUpload.originalFilename, filepath: fileToUpload.filepath} : "undefined");
        }
        
        tempFilePath = fileToUpload?.filepath;

        console.log("[API POST /curricula] Extracted name:", name);
        console.log("[API POST /curricula] Final fileToUpload for validation:", fileToUpload ? { originalFilename: fileToUpload.originalFilename, filepath: fileToUpload.filepath, mimetype: fileToUpload.mimetype, size: fileToUpload.size } : "No valid file object extracted for 'curriculumFile'");

        if (!name) {
          console.error("[API POST /curricula] Validation failed: Curriculum name is missing.");
          return res.status(400).json({ error: "Curriculum name is required." });
        }
        if (!fileToUpload) {
            console.error("[API POST /curricula] Validation failed: No curriculum file was uploaded or processed correctly (fileToUpload is null/undefined).");
            return res.status(400).json({ error: "Curriculum file is required." });
        }
        if (!fileToUpload.originalFilename || !fileToUpload.filepath || !fileToUpload.mimetype) {
            console.error("[API POST /curricula] File object is invalid (missing originalFilename, filepath, or mimetype). Actual fileToUpload:", fileToUpload);
            return res.status(400).json({ error: "Uploaded file data is incomplete." });
        }

        const fileContent = fs.readFileSync(fileToUpload.filepath);
        const blobFileName = `curricula/${Date.now()}-${path.basename(fileToUpload.originalFilename).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        
        const blob = await put(
          blobFileName,
          fileContent,
          { access: 'public', contentType: fileToUpload.mimetype }
        );
        
        const newCurriculum = await prisma.curriculum.create({
          data: {
            name,
            originalFileName: fileToUpload.originalFilename,
            schoolTag: schoolTag || null,
            filePath: blob.url,
            analysisResults: {}, // Store as JSON object
          },
        });

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
    } else {
        res.setHeader('Allow', ['GET', 'POST']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }
}
