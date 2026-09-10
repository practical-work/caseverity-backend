const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const Document = require('../models/Document');
const AuditLog = require('../models/AuditLog');

const router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// 1. UPLOAD API WITH SHA-256
router.post('/upload', upload.single('file'), async (req, res) => {
    try {
        const { caseId, user } = req.body;
        const fileBuffer = req.file.buffer;

        // Calculate SHA-256 Hash
        const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

        // Save Document
        const newDoc = new Document({
            caseId: caseId,
            fileName: req.file.originalname,
            uploadedBy: user,
            sha256Hash: fileHash,
            version: 1
        });
        await newDoc.save();

        // Hash-Linked Audit Trail Logic
        const lastAudit = await AuditLog.findOne().sort({ timestamp: -1 });
        const previousHash = lastAudit ? lastAudit.currentHash : 'GENESIS_HASH';

        const auditDataString = `UPLOAD_DOCUMENT-${user}-${newDoc._id}-${previousHash}`;
        const eventHash = crypto.createHash('sha256').update(auditDataString).digest('hex');

        const newAudit = new AuditLog({
            action: 'UPLOAD_DOCUMENT',
            user: user,
            documentId: newDoc._id,
            previousHash: previousHash,
            currentHash: eventHash
        });
        await newAudit.save();

        res.status(201).json({ 
            message: "File Secured & Uploaded!", 
            documentId: newDoc._id,
            fileHash: fileHash 
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2. VERIFY INTEGRITY API
router.post('/verify', async (req, res) => {
    try {
        const { documentId, providedHash } = req.body;
        
        const doc = await Document.findById(documentId);
        if (!doc) return res.status(404).json({ message: "Document not found" });

        if (doc.sha256Hash === providedHash) {
            res.status(200).json({ status: "VERIFIED", message: "Integrity Intact. File has not been modified." });
        } else {
            res.status(400).json({ status: "TAMPERED", message: "ALERT: Hash mismatch! File may be compromised." });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 3. GET AUDIT LOGS API
router.get('/audit-logs', async (req, res) => {
    try {
        const logs = await AuditLog.find().sort({ timestamp: -1 }).limit(10);
        res.status(200).json(logs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;