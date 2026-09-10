const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
    caseId: { type: String, required: true },
    fileName: { type: String, required: true },
    uploadedBy: { type: String, required: true },
    version: { type: Number, default: 1 },
    sha256Hash: { type: String, required: true },
    status: { type: String, default: 'Active' },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Document', documentSchema);