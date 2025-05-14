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

    form.on('error', (err) => console.error('[Formidable Event - error]', err));
    form.on('field', (name, value) => console.log(`[Formidable Event - field] name="${name}", value snippet="${String(value).substring(0, 50)}..."`));
    form.on('fileBegin', (name, file) => console.log(`[Formidable Event - fileBegin] inputName=${name}, originalFilename=${file.originalFilename}, tempFilepath=${file.filepath}`));
    form.on('file', (name, file) => console.log(`[Formidable Event - file] inputName=${name}, originalFilename="${file.originalFilename}", size=${file.size}, temp path="${file.filepath}", mimetype="${file.mimetype}"`));
    form.on('aborted', () => console.log('[Formidable Event - aborted]'));
    form.on('end', () => console.log('[Formidable Event - end] Parsing finished.'));

    let tempFilePath = null;

    try {
        const [fields, files] = await form.parse(req);
        
        console.log("[API POST /curricula] Formidable finished parsing (await).");
        console.log("[API POST /curricula] Parsed Fields (await):", JSON.stringify(fields, null, 2));
        console.log("[API POST /curricula] Parsed Files (await):", JSON.stringify(files, (key, value) => {
            if (value && typeof value === 'object' && value.filepath && value.originalFilename) {
                return { originalFilename: value.originalFilename, newFilename: value.newFilename, filepath: value.filepath, mimetype: value.mimetype, size: value.size };
            }
            if (key === 'buffer' && value && value.type === 'Buffer' && value.data) return `Buffer data (${value.data.length} bytes)`;
            return value;
        }, 2));

        const rawName = fields.name;
        const name = rawName ? (Array.isArray(rawName) ? rawName[0]?.trim() : String(rawName).trim()) : null;
        
        const rawSchoolTag = fields.schoolTag;
        const schoolTag = rawSchoolTag ? (Array.isArray(rawSchoolTag) ? rawSchoolTag[0]?.trim() : String(rawSchoolTag).trim()) : null;
        
        // Robustly extract the file object
        const curriculumFileFieldData = files.curriculumFile; // 'curriculumFile' is the key from form input name
        let fileToUpload = null;

        if (curriculumFileFieldData) {
            if (Array.isArray(curriculumFileFieldData) && curriculumFileFieldData.length > 0) {
                fileToUpload = curriculumFileFieldData[0]; // Take the first file if it's an array
                console.log("[API POST /curricula] Extracted file from array.");
            } else if (curriculumFileFieldData.filepath && curriculumFileFieldData.originalFilename) { 
                // If it's not an array but looks like a formidable File object directly
                fileToUpload = curriculumFileFieldData;
                console.log("[API POST /curricula] Extracted file directly as object.");
            }
        }
        
        tempFilePath = fileToUpload?.filepath;

        console.log("[API POST /curricula] Extracted name:", name);
        console.log("[API POST /curricula] Final fileToUpload object for validation:", fileToUpload ? { originalFilename: fileToUpload.originalFilename, filepath: fileToUpload.filepath, mimetype: fileToUpload.mimetype, size: fileToUpload.size } : "No valid file object extracted for 'curriculumFile'");

        if (!name) {
          console.error("[API POST /curricula] Validation failed: Curriculum name is missing.");
          return res.status(400).json({ error: "Curriculum name is required." });
        }
        if (!fileToUpload) { // Check if fileToUpload is null/undefined after extraction logic
            console.error("[API POST /curricula] Validation failed: No curriculum file was uploaded or processed correctly (fileToUpload is null/undefined).");
            return res.status(400).json({ error: "Curriculum file is required." });
        }
        // Now validate properties of the extracted fileToUpload object
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
            analysisResults: {},
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
