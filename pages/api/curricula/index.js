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
    
    const form = formidable({
        uploadDir: "/tmp",
        keepExtensions: true,
        multiples: false, 
    });

    // Debugging: Log all parts formidable is seeing
    form.on('part', (part) => {
        console.log(`[Formidable Event - part] Received part: name="${part.name}", originalFilename="${part.originalFilename}", mime="${part.mime}"`);
        if (part.originalFilename === null || part.originalFilename === undefined) { // It's a field
            part.on('data', (buffer) => {
                console.log(`[Formidable Event - field data] name="${part.name}", value snippet="${buffer.toString().substring(0, 50)}..."`);
            });
        } else { // It's a file
             part.on('data', (buffer) => {
                console.log(`[Formidable Event - file data chunk] name="${part.name}", originalFilename="${part.originalFilename}", chunk size=${buffer.length}`);
            });
        }
    });
    form.on('fileBegin', (name, file) => {
        console.log(`[Formidable Event - fileBegin] name="${name}", originalFilename="${file.originalFilename}", temp path="${file.filepath}"`);
    });
    form.on('file', (name, file) => { // This event fires when a file has been successfully received
        console.log(`[Formidable Event - file] Successfully parsed file: name="${name}", originalFilename="${file.originalFilename}", size=${file.size}, temp path="${file.filepath}", mimetype="${file.mimetype}"`);
    });
    form.on('error', (err) => {
        console.error('[Formidable Event - error] Error during form parsing:', err);
    });
     form.on('aborted', () => {
        console.log('[Formidable Event - aborted] Request aborted by the user');
    });
    form.on('end', () => {
        console.log('[Formidable Event - end] Form parsing finished.');
    });


    let tempFilePath = null;

    try {
        const [fields, files] = await form.parse(req);
        
        console.log("[API POST /curricula] Formidable finished parsing (await).");
        console.log("[API POST /curricula] Parsed Fields (await):", JSON.stringify(fields, null, 2));
        console.log("[API POST /curricula] Parsed Files (await):", JSON.stringify(files, (key, value) => {
            if (value instanceof formidable.File) {
                return { originalFilename: value.originalFilename, newFilename: value.newFilename, filepath: value.filepath, mimetype: value.mimetype, size: value.size };
            }
            return value;
        }, 2));

        const rawName = fields.name;
        const name = rawName ? (Array.isArray(rawName) ? rawName[0]?.trim() : String(rawName).trim()) : null;
        
        const rawSchoolTag = fields.schoolTag;
        const schoolTag = rawSchoolTag ? (Array.isArray(rawSchoolTag) ? rawSchoolTag[0]?.trim() : String(rawSchoolTag).trim()) : null;
        
        // Access the file using the name attribute of your file input (e.g., 'curriculumFile')
        const fileToUpload = files.curriculumFile; // This should be a formidable.File object
        
        tempFilePath = fileToUpload?.filepath;

        console.log("[API POST /curricula] Extracted name:", name);
        console.log("[API POST /curricula] Extracted fileToUpload (from files.curriculumFile):", fileToUpload ? { originalFilename: fileToUpload.originalFilename, filepath: fileToUpload.filepath, mimetype: fileToUpload.mimetype, size: fileToUpload.size } : "No file object found for 'curriculumFile'");

        if (!name) {
          console.error("[API POST /curricula] Validation failed: Curriculum name is missing.");
          return res.status(400).json({ error: "Curriculum name is required." });
        }
        if (!fileToUpload) {
            console.error("[API POST /curricula] Validation failed: No curriculum file was uploaded or processed correctly (fileToUpload is falsy).");
            return res.status(400).json({ error: "Curriculum file is required." });
        }
        if (!fileToUpload.originalFilename || !fileToUpload.filepath || !fileToUpload.mimetype) {
            console.error("[API POST /curricula] File object is invalid. File object:", fileToUpload);
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
