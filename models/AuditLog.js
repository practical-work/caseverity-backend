const mongoose = require('mongoose');

const auditSchema = new mongoose.Schema({
    action: { type: String, required: true }, 
    user: { type: String, required: true },
    documentId: { type: String },
    timestamp: { type: Date, default: Date.now },
    previousHash: { type: String, default: 'GENESIS_HASH' },
    currentHash: { type: String, required: true }
});

module.exports = mongoose.model('AuditLog', auditSchema);