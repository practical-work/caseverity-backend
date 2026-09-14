import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [currentView, setCurrentView] = useState('LANDING'); 
  const [user, setUser] = useState('');
  const [role, setRole] = useState('');
  
  // Strict UI state for locking buttons and showing spinners
  const [isProcessing, setIsProcessing] = useState(false);
  const [showDemoGuide, setShowDemoGuide] = useState(true); 
  
  const [regForm, setRegForm] = useState({ fullName: '', email: '', phone: '', department: 'Cyber Crime', state: 'Haryana', requestedRole: 'Investigating Officer' });
  const [otpCode, setOtpCode] = useState('');
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  
  const [pendingRequests, setPendingRequests] = useState([]);
  const [activeUsers, setActiveUsers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [file, setFile] = useState(null);
  const [caseId, setCaseId] = useState('CASE-2026-001');
  const [uploadData, setUploadData] = useState(null);
  const [verifyDocId, setVerifyDocId] = useState('');
  const [verifyHash, setVerifyHash] = useState('');
  const [verifyResult, setVerifyResult] = useState(null);

  // Dynamic API URL depending on deployment environment
  const API_URL = window.location.hostname === 'localhost' ? 'http://localhost:5000/api' : 'https://caseverity-backend.onrender.com/api';

  useEffect(() => {
    if (currentView === 'ADMIN_DASH') { fetchPendingRequests(); fetchActiveUsers(); }
    if (currentView === 'OFFICER_DASH' || currentView === 'ADMIN_DASH') fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentView]);

  const handleRequestAccess = async (e) => {
    e.preventDefault();
    setIsProcessing(true); // Lock the UI immediately
    try { 
      await axios.post(`${API_URL}/auth/request-access`, regForm); 
      setCurrentView('OTP_VERIFY'); 
    } catch (err) { 
      // Safely catch errors even if the network connection drops entirely
      const errorMessage = err.response?.data?.message || err.message || "Network Error: Could not connect to the server. Please try again.";
      alert(errorMessage); 
    } finally {
      setIsProcessing(false); // Unlock the UI
    }
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    setIsProcessing(true);
    try {
      const res = await axios.post(`${API_URL}/auth/verify-otp`, { email: regForm.email, otp: otpCode });
      alert(res.data.message); 
      setCurrentView('LANDING');
    } catch (err) { 
      const errorMessage = err.response?.data?.message || "Invalid or expired OTP";
      alert(errorMessage); 
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLogin = async (e, isAdmin = false) => {
    e.preventDefault();
    setIsProcessing(true);
    try {
      const sanitizedPayload = { email: loginForm.email.trim(), password: loginForm.password.trim() };
      const res = await axios.post(`${API_URL}${isAdmin ? '/auth/admin-login' : '/auth/login'}`, sanitizedPayload);
      setUser(res.data.user); setRole(res.data.role);
      setCurrentView(isAdmin ? 'ADMIN_DASH' : 'OFFICER_DASH'); 
      setShowDemoGuide(false);
    } catch (err) { 
      const errorMessage = err.response?.data?.message || "Login failed due to a network error.";
      alert(errorMessage); 
    } finally {
      setIsProcessing(false);
    }
  };

  const fetchPendingRequests = async () => setPendingRequests((await axios.get(`${API_URL}/auth/admin/requests`)).data);
  const fetchActiveUsers = async () => setActiveUsers((await axios.get(`${API_URL}/auth/admin/users`)).data);
  const fetchLogs = async () => setAuditLogs((await axios.get(`${API_URL}/audit-logs`)).data);

  const handleAdminAction = async (requestId, assignedRole, action) => {
    let reason = '';
    if (action === 'REJECT') {
      reason = window.prompt("Enter reason for rejection:");
      if (!reason) return;
    }
    try {
      await axios.post(`${API_URL}/auth/admin/action`, { requestId, action, assignedRole, reason });
      fetchPendingRequests(); 
      alert(action === 'APPROVE' ? `Access Approved for ${assignedRole}. Credentials dispatched.` : `Request Rejected. Email sent.`);
    } catch (err) {
      alert(err.response?.data?.message || "Action failed.");
    }
  };

  const handleManageUser = async (userId, action) => {
    if (!window.confirm(`Are you sure you want to ${action} this user?`)) return;
    try {
      await axios.post(`${API_URL}/auth/admin/manage-user`, { userId, action });
      fetchActiveUsers();
      alert(`Action ${action} completed. Email dispatched to user.`);
    } catch (err) {
      alert(err.response?.data?.message || "Management action failed.");
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append('file', file); formData.append('caseId', caseId); formData.append('user', user);
    try {
      const res = await axios.post(`${API_URL}/documents/upload`, formData);
      setUploadData(res.data); setVerifyDocId(res.data.documentId); setVerifyHash(res.data.fileHash); fetchLogs();
    } catch (err) {
      alert(err.response?.data?.message || "Upload failed.");
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(`${API_URL}/documents/verify`, { documentId: verifyDocId.trim(), providedHash: verifyHash.trim(), user });
      setVerifyResult({ type: 'success', message: res.data.message });
    } catch (err) { 
      const errorText = err.response?.data?.message || err.response?.data?.error || "Verification failed. Please check the Document ID and Hash.";
      setVerifyResult({ type: 'danger', message: errorText }); 
    }
    fetchLogs();
  };

  const DemoGuide = () => {
    if (!showDemoGuide) return null;
    return (
      <div className="premium-popup">
        <button className="close-popup-btn" onClick={() => setShowDemoGuide(false)}>✖</button>
        <h3>💡 SIH 2026 Demo Guide</h3>
        <p><strong>Admin:</strong> admin@caseverity.gov.in / Admin@2026</p>
        <p style={{ marginTop: '10px' }}><strong>Step-by-Step Flow:</strong></p>
        <ul className="guide-list">
          <li>1. Click <b>"Request Access"</b>.</li>
          <li>2. Get OTP. "Pending Details" email is sent.</li>
          <li>3. Click <b>"Administrator Portal"</b> & Login.</li>
          <li>4. Use <b>Approve/Reject/Revoke</b> controls.</li>
          <li>5. Login using <b>Officer ID</b> sent via email!</li>
        </ul>
      </div>
    );
  };

  if (currentView === 'LANDING') {
    return (
      <div className="landing-container">
        <DemoGuide />
        <div className="landing-overlay">
          <div className="landing-content">
            <h1 className="main-heading">CASEVERITY</h1>
            <h3 className="sub-heading">Secure Digital Document Management System</h3>
            <div className="landing-actions">
              <button className="btn btn-primary" onClick={() => setCurrentView('LOGIN')}>Official Login</button>
              <button className="btn btn-secondary" onClick={() => setCurrentView('REQUEST_ACCESS')}>Request Access</button>
            </div>
            <div className="admin-link" onClick={() => setCurrentView('ADMIN_LOGIN')}>System Administrator Portal</div>
          </div>
        </div>
      </div>
    );
  }

  if (currentView === 'REQUEST_ACCESS') {
    return (
      <div className="login-wrapper">
        <DemoGuide />
        <div className="card login-card request-card">
          <h2 className="section-title">Access Request</h2><span className="section-subtitle">Identity & Affiliation Verification</span>
          <form onSubmit={handleRequestAccess}>
            <div className="form-group"><label>Full Name</label><input type="text" className="form-control" value={regForm.fullName} onChange={e => setRegForm({...regForm, fullName: e.target.value})} required disabled={isProcessing}/></div>
            <div className="form-group"><label>Official Email (For OTP)</label><input type="email" className="form-control" value={regForm.email} onChange={e => setRegForm({...regForm, email: e.target.value})} required disabled={isProcessing}/></div>
            <div className="responsive-flex">
              <div className="form-group"><label>Mobile</label><input type="text" className="form-control" value={regForm.phone} onChange={e => setRegForm({...regForm, phone: e.target.value})} required disabled={isProcessing}/></div>
              <div className="form-group"><label>Requested Role</label>
                <select className="form-control" value={regForm.requestedRole} onChange={e => setRegForm({...regForm, requestedRole: e.target.value})} disabled={isProcessing}>
                  <option value="Investigating Officer">Investigating Officer</option><option value="Forensic Officer">Forensic Officer</option><option value="Public Prosecutor">Public Prosecutor</option>
                </select>
              </div>
            </div>
            <div className="form-group"><label>Affiliation Proof (PDF/JPG)</label><input type="file" className="form-control" required disabled={isProcessing}/></div>
            <button type="submit" className="btn btn-primary btn-spacing" disabled={isProcessing}>
              {isProcessing ? <><span className="spinner"></span> Processing OTP...</> : 'Generate Email OTP'}
            </button>
            <button type="button" className="btn btn-secondary btn-spacing" onClick={() => setCurrentView('LANDING')} disabled={isProcessing}>Cancel</button>
          </form>
        </div>
      </div>
    );
  }

  if (currentView === 'OTP_VERIFY') {
    return (
      <div className="login-wrapper">
        <div className="card login-card">
          <h2 className="section-title">Verify Email</h2><span className="section-subtitle">Enter code sent to {regForm.email}</span>
          <form onSubmit={handleVerifyOTP}>
            <div className="form-group"><input type="text" className="form-control otp-input" placeholder="000000" onChange={e => setOtpCode(e.target.value)} required disabled={isProcessing}/></div>
            <button type="submit" className="btn btn-primary" disabled={isProcessing}>
              {isProcessing ? <><span className="spinner"></span> Verifying...</> : 'Verify & Submit Request'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (currentView === 'LOGIN' || currentView === 'ADMIN_LOGIN') {
    const isAdmin = currentView === 'ADMIN_LOGIN';
    return (
      <div className="login-wrapper">
        <DemoGuide />
        <div className="card login-card">
          <h2 className="section-title">{isAdmin ? 'Administrator Portal' : 'Official Portal'}</h2>
          <form onSubmit={(e) => handleLogin(e, isAdmin)}>
            <div className="form-group"><label>{isAdmin ? 'Admin ID' : 'Officer ID / Official Email'}</label><input type="text" className="form-control" value={loginForm.email} onChange={e => setLoginForm({...loginForm, email: e.target.value})} required disabled={isProcessing}/></div>
            <div className="form-group"><label>Password</label><input type="password" className="form-control" value={loginForm.password} onChange={e => setLoginForm({...loginForm, password: e.target.value})} required disabled={isProcessing}/></div>
            <button type="submit" className="btn btn-primary btn-spacing" disabled={isProcessing}>
              {isProcessing ? <><span className="spinner"></span> Authenticating...</> : 'Authenticate'}
            </button>
            <button type="button" className="btn btn-secondary btn-spacing" onClick={() => setCurrentView('LANDING')} disabled={isProcessing}>Back</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <nav className="top-nav"><div className="nav-brand"><h1>CaseVerity</h1></div><div className="nav-user">{user} | {role} <button className="btn-logout" onClick={() => setCurrentView('LANDING')}>Logout</button></div></nav>
      <main className="main-container">
        {role === 'Administrator' && (
          <>
            <div className="card full-width bottom-spacing">
              <h2 className="section-title">Pending Access Requests</h2>
              <div className="table-wrapper">
                <table className="data-table">
                  <thead><tr><th>Applicant</th><th>Role & Dept</th><th>Action</th></tr></thead>
                  <tbody>
                    {pendingRequests.map(req => (
                      <tr key={req._id}>
                        <td><strong>{req.fullName}</strong><br/>{req.email}</td><td><span className="action-badge">{req.requestedRole}</span><br/><small>{req.department}</small></td>
                        <td className="action-td">
                          <button className="btn btn-primary action-btn" onClick={() => handleAdminAction(req._id, req.requestedRole, 'APPROVE')}>Approve</button>
                          <button className="btn btn-secondary action-btn" style={{borderColor: '#ff6b6b', color: '#ff6b6b'}} onClick={() => handleAdminAction(req._id, req.requestedRole, 'REJECT')}>Reject</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="card full-width bottom-spacing">
              <h2 className="section-title">Active Personnel & Access Control</h2>
              <div className="table-wrapper">
                <table className="data-table">
                  <thead><tr><th>Officer Details</th><th>System Status</th><th>Security Action</th></tr></thead>
                  <tbody>
                    {activeUsers.map(u => (
                      <tr key={u._id}>
                        <td><strong>{u.officerId}</strong><br/>{u.fullName}<br/><span className="action-badge">{u.role}</span></td>
                        <td><span style={{ color: u.status === 'ACTIVE' ? '#0f5132' : '#bf2600', fontWeight: 'bold' }}>{u.status}</span></td>
                        <td className="action-td">
                          {u.status === 'ACTIVE' ? (
                            <><button className="btn btn-secondary action-btn" style={{borderColor: '#ff6b6b', color: '#ff6b6b'}} onClick={() => handleManageUser(u._id, 'REVOKE')}>Revoke</button>
                            <button className="btn btn-secondary action-btn" style={{borderColor: '#f59e0b', color: '#f59e0b'}} onClick={() => handleManageUser(u._id, 'EXPIRE')}>Expire Now</button></>
                          ) : (<button className="btn btn-primary action-btn" style={{background: '#10b981', borderColor: 'transparent'}} onClick={() => handleManageUser(u._id, 'REACTIVATE')}>Reactivate</button>)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
        {role !== 'Administrator' && (
          <div className="dashboard-grid">
            <div className="card">
              <h2 className="section-title">Evidence Intake</h2>
              <form onSubmit={handleUpload}>
                <div className="form-group"><label>Case ID</label><input type="text" className="form-control" value={caseId} onChange={e => setCaseId(e.target.value)} /></div>
                <div className="form-group"><label>Document</label><input type="file" className="form-control" onChange={e => setFile(e.target.files[0])} required /></div>
                <button type="submit" className="btn btn-primary">Generate Hash & Store</button>
              </form>
              {uploadData && <div className="alert-box alert-success"><strong>ID:</strong> {uploadData.documentId} <br/><strong>V{uploadData.version} Hash:</strong> <br/><span className="hash-badge responsive-hash">{uploadData.fileHash}</span></div>}
            </div>
            <div className="card">
              <h2 className="section-title">Integrity Verification</h2>
              <form onSubmit={handleVerify}>
                <div className="form-group"><label>Document ID</label><input type="text" className="form-control" value={verifyDocId} onChange={e => setVerifyDocId(e.target.value)} required /></div>
                <div className="form-group"><label>SHA-256 Hash</label><input type="text" className="form-control" value={verifyHash} onChange={e => setVerifyHash(e.target.value)} required /></div>
                <button type="submit" className="btn btn-secondary">Compare Hash</button>
              </form>
              {verifyResult && <div className={`alert-box ${verifyResult.type === 'success' ? 'alert-success' : 'alert-danger'}`}>{verifyResult.message}</div>}
            </div>
          </div>
        )}
        <div className="card full-width top-spacing">
          <div className="table-header-flex"><h2 className="section-title">Cryptographic Audit Ledger</h2><input type="text" className="form-control search-bar" placeholder="🔍 Search logs..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} /></div>
          <div className="table-wrapper">
            <table className="data-table">
              <thead><tr><th>Timestamp</th><th>User/Actor</th><th>Action</th><th>Chain Hash</th></tr></thead>
              <tbody>
                {auditLogs.filter(log => log.action.includes(searchQuery) || log.user.includes(searchQuery)).map(log => (
                  <tr key={log._id}>
                    <td>{new Date(log.timestamp).toLocaleDateString()} {new Date(log.timestamp).toLocaleTimeString()}</td><td><strong>{log.user}</strong></td><td><span className="action-badge">{log.action}</span></td><td><span className="hash-badge" title={log.currentHash}>{log.currentHash.substring(0, 16)}...</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
      <footer className="dev-footer">Developed by <strong>CaseArmor</strong> | SIH 2026</footer>
    </div>
  );
}
export default App;
    
