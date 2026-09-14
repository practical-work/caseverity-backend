require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');

const app = express();
app.use(cors({
  origin: ['https://caseverity-frontend.vercel.app', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.log('❌ DB Error:', err));

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

const accessRequestSchema = new mongoose.Schema({
  fullName: String, email: String, phone: String, department: String, state: String,
  requestedRole: String, otp: String, otpExpiry: Date,
  isEmailVerified: { type: Boolean, default: false },
  status: { type: String, default: 'PENDING_VERIFICATION' } 
});
const AccessRequest = mongoose.model('AccessRequest', accessRequestSchema);

const userSchema = new mongoose.Schema({
  officerId: { type: String, unique: true },
  fullName: String, email: { type: String, unique: true },
  passwordHash: String, role: String, department: String,
  status: { type: String, default: 'ACTIVE' }, 
  accessExpiry: { type: Date, default: null } 
});
const User = mongoose.model('User', userSchema);

const documentSchema = new mongoose.Schema({
  caseId: String, fileName: String, fileHash: String, 
  uploadedBy: String, department: String, version: { type: Number, default: 1 },
  timestamp: { type: Date, default: Date.now }
});
const Document = mongoose.model('Document', documentSchema);

const auditSchema = new mongoose.Schema({
  user: String, action: String, targetId: String, currentHash: String, previousHash: String, timestamp: { type: Date, default: Date.now }
});
const AuditLog = mongoose.model('AuditLog', auditSchema);

async function createAuditLog(user, action, targetId, currentHash) {
  const lastLog = await AuditLog.findOne().sort({ timestamp: -1 });
  const previousHash = lastLog ? lastLog.currentHash : 'GENESIS_BLOCK';
  const newLog = new AuditLog({ user, action, targetId, currentHash, previousHash });
  await newLog.save();
}

app.post('/api/auth/request-access', async (req, res) => {
  try {
    const { fullName, email, phone, department, state, requestedRole } = req.body;
    if (!email || !phone) return res.status(400).json({ message: 'Email and phone required.' });

    const cleanEmail = email.trim().toLowerCase();

    const existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser && existingUser.status === 'ACTIVE') {
      return res.status(400).json({ message: 'Access Denied: An active official account already exists for this email.' });
    }

    const existingRequest = await AccessRequest.findOne({ email: cleanEmail });
    if (existingRequest && existingRequest.status === 'PENDING_APPROVAL') {
      return res.status(400).json({ message: 'Access Denied: Your request is currently waiting for Administrator approval.' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    await AccessRequest.findOneAndUpdate(
      { email: cleanEmail },
      { fullName, phone, department, state, requestedRole, otp, otpExpiry: Date.now() + 10 * 60000, status: 'PENDING_VERIFICATION' },
      { upsert: true, new: true }
    );

    await transporter.sendMail({
      from: `"CaseVerity Admin" <${process.env.EMAIL_USER}>`,
      to: cleanEmail, subject: 'CaseVerity - Verification OTP',
      html: `<h3>Your Verification Code</h3><p>Your OTP is <b>${otp}</b>. It expires in 10 minutes.</p>`
    });
    
    res.json({ message: 'OTP sent successfully.' });
  } catch (err) { res.status(500).json({ message: 'Failed to send OTP. Please try again.' }); }
});

app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ message: 'Missing email or OTP.' });

    const cleanEmail = email.trim().toLowerCase();
    const request = await AccessRequest.findOne({ email: cleanEmail, otp, otpExpiry: { $gt: Date.now() } });
    
    if (!request) return res.status(400).json({ message: 'Invalid or expired OTP.' });

    request.isEmailVerified = true; request.status = 'PENDING_APPROVAL'; request.otp = undefined;
    await request.save();

    await transporter.sendMail({
      from: `"CaseVerity" <${process.env.EMAIL_USER}>`,
      to: cleanEmail, subject: 'CaseVerity - Request Pending Approval',
      html: `<h3>Request Successfully Submitted</h3><p>Your request is <b>PENDING APPROVAL</b> from the System Administrator.</p>`
    });
    res.json({ message: 'Email verified. Details sent to your email.' });
  } catch (err) { res.status(500).json({ message: 'Verification failed' }); }
});

app.post('/api/auth/admin-login', (req, res) => {
  const email = req.body.email?.trim();
  const password = req.body.password?.trim();
  if (email === 'admin@caseverity.gov.in' && password === 'Admin@2026') {
    res.json({ role: 'Administrator', user: 'System Admin' });
  } else {
    res.status(401).json({ message: 'Invalid Admin Credentials' });
  }
});

app.get('/api/auth/admin/requests', async (req, res) => res.json(await AccessRequest.find({ status: 'PENDING_APPROVAL' })));
app.get('/api/auth/admin/users', async (req, res) => res.json(await User.find()));

app.post('/api/auth/admin/action', async (req, res) => {
  try {
    const { requestId, action, assignedRole, reason } = req.body;
    const request = await AccessRequest.findById(requestId);
    
    if (action === 'REJECT') {
      request.status = 'REJECTED'; await request.save();
      await transporter.sendMail({
        from: `"CaseVerity Admin" <${process.env.EMAIL_USER}>`,
        to: request.email, subject: 'CaseVerity - Access Request Rejected',
        html: `<h3>Request Rejected</h3><p>Your access request has been rejected.</p><p><b>Reason:</b> ${reason}</p>`
      });
      return res.json({ message: 'Request rejected and email sent.' });
    }

    const prefix = assignedRole.includes('Investigating') ? 'IO' : assignedRole.includes('Forensic') ? 'FO' : 'PP';
    const specialId = `${prefix}-${Math.floor(1000 + Math.random() * 9000)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const strongPassword = `Case#${crypto.randomBytes(3).toString('hex')}!`;
    const passwordHash = await bcrypt.hash(strongPassword, 10);

    const newUser = new User({ officerId: specialId, fullName: request.fullName, email: request.email, passwordHash, role: assignedRole, department: request.department });
    await newUser.save();
    request.status = 'APPROVED'; await request.save();

    await transporter.sendMail({
      from: `"CaseVerity Admin" <${process.env.EMAIL_USER}>`,
      to: request.email, subject: 'CaseVerity - Access Approved',
      html: `<h3>Access Approved</h3><p><b>Officer ID:</b> ${specialId}</p><p><b>Secure Password:</b> ${strongPassword}</p>`
    });
    res.json({ message: 'Approved. ID and Password dispatched.' });
  } catch (err) { res.status(500).json({ message: 'Action failed' }); }
});

app.post('/api/auth/admin/manage-user', async (req, res) => {
  try {
    const { userId, action } = req.body;
    const user = await User.findById(userId);
    
    if (action === 'REVOKE') {
      user.status = 'REVOKED'; await user.save();
      await transporter.sendMail({ from: `"CaseVerity Admin" <${process.env.EMAIL_USER}>`, to: user.email, subject: 'CaseVerity - Access Revoked', html: `<p>SECURITY ALERT: Your system access has been officially REVOKED by the Administrator.</p>` });
      return res.json({ message: 'User access revoked successfully.' });
    }
    if (action === 'EXPIRE') {
      user.status = 'EXPIRED'; await user.save();
      await transporter.sendMail({ from: `"CaseVerity Admin" <${process.env.EMAIL_USER}>`, to: user.email, subject: 'CaseVerity - Access Expired', html: `<p>NOTICE: Your system access has EXPIRED.</p>` });
      return res.json({ message: 'User status set to EXPIRED.' });
    }
    if (action === 'REACTIVATE') {
      user.status = 'ACTIVE'; user.accessExpiry = null; await user.save();
      return res.json({ message: 'User access restored.' });
    }
  } catch(err) { res.status(500).json({ message: 'Management action failed' }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    if (!req.body.email || !req.body.password) return res.status(400).json({ message: 'Missing credentials.' });
    const emailOrId = req.body.email.trim();
    const user = await User.findOne({ $or: [{ email: emailOrId.toLowerCase() }, { officerId: emailOrId }] });
    
    if (!user || !(await bcrypt.compare(req.body.password.trim(), user.passwordHash))) return res.status(401).json({ message: 'Invalid credentials' });
    if (user.status === 'REVOKED') return res.status(403).json({ message: 'ACCESS DENIED: Account revoked.' });
    if (user.status === 'EXPIRED') return res.status(403).json({ message: 'ACCESS DENIED: Authorization expired.' });

    res.json({ role: user.role, user: user.fullName, department: user.department });
  } catch (err) { res.status(500).json({ message: 'Login failed' }); }
});

app.post('/api/documents/upload', upload.single('file'), async (req, res) => {
  try {
    const { caseId, user, department } = req.body;
    const hash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    const version = (await Document.find({ caseId, fileName: req.file.originalname })).length + 1;
    const newDoc = new Document({ caseId, fileName: req.file.originalname, fileHash: hash, uploadedBy: user, department, version });
    await newDoc.save();
    await createAuditLog(user, `DOCUMENT_UPLOADED_V${version}`, newDoc._id, hash);
    res.json({ message: 'Document secured', documentId: newDoc._id, fileHash: hash, version });
  } catch (error) { res.status(500).json({ message: 'Upload failed' }); }
});

app.post('/api/documents/verify', async (req, res) => {
  try {
    const { documentId, providedHash, user } = req.body;
    const doc = await Document.findById(documentId?.trim());
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    if (doc.fileHash === providedHash?.trim()) {
      await createAuditLog(user || 'System', 'INTEGRITY_VERIFIED', doc._id, providedHash);
      res.json({ message: 'Integrity Verified: Hashes match.' });
    } else {
      await createAuditLog(user || 'System', 'TAMPERING_DETECTED', doc._id, providedHash);
      res.status(400).json({ message: 'Tampering Detected: Hash mismatch.' });
    }
  } catch (error) { res.status(500).json({ message: 'Verification failed. Check Document ID.' }); }
});

app.get('/api/audit-logs', async (req, res) => res.json(await AuditLog.find().sort({ timestamp: -1 })));
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`CaseVerity Server running on port ${PORT}`));
