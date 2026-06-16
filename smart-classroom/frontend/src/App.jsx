import { useEffect, useRef, useState } from "react";
import axios from "axios";

function App() {
  const API_URL = "http://localhost:8000";
  const WS_URL = "ws://localhost:8000/ws/dashboard";

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [dashboardStats, setDashboardStats] = useState([]);
  const [resultImage, setResultImage] = useState("");
  const [isTracking, setIsTracking] = useState(false);
  const [envData, setEnvData] = useState(null);
  const [auditLog, setAuditLog] = useState([]);
  const [zkStatus, setZkStatus] = useState(null);
  const [fedStatus, setFedStatus] = useState(null);
  const [attestation, setAttestation] = useState(null);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [studentSearch, setStudentSearch] = useState("");
  const [studentProfile, setStudentProfile] = useState(null);
  const [classSummary, setClassSummary] = useState(null);
  const [notification, setNotification] = useState(null);

  const ws = useRef(null);
  const trackInterval = useRef(null);

  useEffect(() => {
    startCamera();
    connectWebSocket();
    fetchSystemStatus();
    return () => {
      if (ws.current) ws.current.close();
      if (trackInterval.current) clearInterval(trackInterval.current);
    };
  }, []);

  const showNotification = (msg, type = "success") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const fetchSystemStatus = async () => {
    try {
      const [envRes, zkRes, fedRes, attRes, summRes] = await Promise.all([
        axios.get(`${API_URL}/environment`).catch(() => null),
        axios.get(`${API_URL}/zk/status`).catch(() => null),
        axios.get(`${API_URL}/federated/status`).catch(() => null),
        axios.get(`${API_URL}/attestation`).catch(() => null),
        axios.get(`${API_URL}/teacher/summary`).catch(() => null),
      ]);
      if (envRes) setEnvData(envRes.data);
      if (zkRes) setZkStatus(zkRes.data);
      if (fedRes) setFedStatus(fedRes.data);
      if (attRes) setAttestation(attRes.data);
      if (summRes) setClassSummary(summRes.data);
    } catch (e) {
      console.error("Status fetch error", e);
    }
  };

  const fetchAuditLog = async () => {
    try {
      const res = await axios.get(`${API_URL}/audit`);
      setAuditLog(res.data.events || []);
    } catch (e) {
      console.error("Audit fetch error", e);
    }
  };

  const searchStudent = async () => {
    if (!studentSearch.trim()) return;
    try {
      const res = await axios.get(`${API_URL}/student/${studentSearch.trim()}`);
      setStudentProfile(res.data);
    } catch (e) {
      showNotification("Student not found", "error");
    }
  };

  const finalizeDay = async () => {
    try {
      const res = await axios.post(`${API_URL}/teacher/finalize`);
      showNotification(`Day finalized for ${res.data.finalized_students.length} students`);
      fetchSystemStatus();
    } catch (e) {
      showNotification("Finalization failed", "error");
    }
  };

  const resetSession = async () => {
    try {
      await axios.post(`${API_URL}/reset`);
      setDashboardStats([]);
      showNotification("Session reset. Ready for new class.");
    } catch (e) {
      showNotification("Reset failed", "error");
    }
  };

  const connectWebSocket = () => {
    ws.current = new WebSocket(WS_URL);
    ws.current.onopen = () => console.log("Connected to CSTPE Dashboard WS");
    ws.current.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "init" || message.type === "update") {
          setDashboardStats(message.data);
          if (message.environment) setEnvData({ valid: true, readings: message.environment });
        }
      } catch (e) { console.error("WS error", e); }
    };
    ws.current.onclose = () => setTimeout(connectWebSocket, 3000);
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      videoRef.current.srcObject = stream;
    } catch (err) { console.log("Camera unavailable:", err); }
  };

  const captureFrameAndSend = async () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const ctx = canvas.getContext("2d");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    const image = canvas.toDataURL("image/jpeg", 0.7);
    try {
      await axios.post(`${API_URL}/attendance`, { image });
      setResultImage(`${API_URL}/static/result.jpg?t=` + new Date().getTime());
    } catch (err) { console.log("Error processing frame", err); }
  };

  const toggleTracking = () => {
    if (isTracking) {
      clearInterval(trackInterval.current);
      setIsTracking(false);
    } else {
      trackInterval.current = setInterval(captureFrameAndSend, 3000);
      setIsTracking(true);
    }
  };

  const tabs = ["dashboard", "camera", "students", "audit", "environment", "system"];

  const tabStyle = (tab) => ({
    padding: "10px 18px", fontSize: "13px",
    fontWeight: activeTab === tab ? "600" : "normal",
    border: "none",
    borderBottom: activeTab === tab ? "2px solid #38bdf8" : "2px solid transparent",
    background: "transparent",
    color: activeTab === tab ? "#38bdf8" : "#94a3b8",
    cursor: "pointer", transition: "all 0.2s",
  });

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: "#0f172a", minHeight: "100vh", color: "#e2e8f0", padding: "30px" }}>
      <div style={{ maxWidth: "1400px", margin: "0 auto" }}>

        {/* Notification */}
        {notification && (
          <div style={{
            position: "fixed", top: "20px", right: "20px", zIndex: 1000,
            padding: "12px 24px", borderRadius: "8px",
            background: notification.type === "success" ? "#10b981" : "#ef4444",
            color: "#fff", fontSize: "14px", fontWeight: "600",
            animation: "fadeIn 0.3s ease",
          }}>
            {notification.msg}
          </div>
        )}

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "25px" }}>
          <h1 style={{ color: "#38bdf8", marginBottom: "4px", fontSize: "24px", letterSpacing: "-0.5px" }}>
            Continuous Spatial-Temporal Presence Engine
          </h1>
          <p style={{ color: "#64748b", fontSize: "13px" }}>
            10-Module Patent Architecture | Real-Time Attendance Tracking
          </p>
        </div>

        {/* System Status Bar */}
        <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap", marginBottom: "20px" }}>
          {[
            { label: "YOLO Liveness", ok: true },
            { label: "Biometric Fusion", ok: true },
            { label: "Entropy Adaptive", ok: true },
            { label: "Model Attestation", ok: attestation?.all_passed !== false },
            { label: "ZK Proofs", ok: true },
            { label: "Blockchain Audit", ok: true },
            { label: "Env Gating", ok: envData?.valid !== false },
            { label: "Session Recovery", ok: true },
            { label: "Fed Learning", ok: true },
            { label: "Edge Ready", ok: true },
          ].map((mod, i) => (
            <div key={i} style={{
              background: "#1e293b", padding: "5px 12px", borderRadius: "20px",
              fontSize: "11px", display: "flex", alignItems: "center",
              border: `1px solid ${mod.ok ? "#1e3a2f" : "#3b1c1c"}`,
            }}>
              <span style={{ display: "inline-block", width: "7px", height: "7px", borderRadius: "50%", background: mod.ok ? "#10b981" : "#ef4444", marginRight: "6px" }}></span>
              {mod.label}
            </div>
          ))}
        </div>

        {/* Tab Navigation */}
        <div style={{ display: "flex", gap: "3px", marginBottom: "20px", borderBottom: "1px solid #1e293b" }}>
          {tabs.map((tab) => (
            <button key={tab}
              onClick={() => { setActiveTab(tab); if (tab === "audit") fetchAuditLog(); if (tab === "system" || tab === "environment") fetchSystemStatus(); }}
              style={tabStyle(tab)}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* ===== DASHBOARD TAB ===== */}
        {activeTab === "dashboard" && (
          <div>
            {/* Teacher Controls */}
            <div style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
              <div>
                <span style={{ color: "#94a3b8", fontSize: "13px" }}>Class: General</span>
                {classSummary && (
                  <span style={{ color: "#64748b", fontSize: "12px", marginLeft: "15px" }}>
                    Present: {classSummary.present} | In Progress: {classSummary.in_progress} | Total: {classSummary.total_students}
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <a href={`${API_URL}/download`} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                  <button style={outlineBtn}>Export Full Report</button>
                </a>
                <button onClick={finalizeDay} style={{ ...outlineBtn, borderColor: "#f59e0b", color: "#f59e0b" }}>
                  Finalize Day
                </button>
                <button onClick={resetSession} style={{ ...outlineBtn, borderColor: "#ef4444", color: "#ef4444" }}>
                  Reset Session
                </button>
              </div>
            </div>

            {/* Attendance Table */}
            <div style={card}>
              <h3 style={{ color: "#38bdf8", marginTop: 0, fontSize: "16px" }}>Live Attendance Tracker</h3>
              <p style={{ color: "#64748b", fontSize: "12px" }}>Accumulated Active Presence required: 40 minutes (2400s)</p>

              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "12px" }}>
                <thead>
                  <tr style={{ background: "#0f172a" }}>
                    {["Student", "Active Time", "Progress", "Status", "Session", "Gap", "Bio Score", "Env"].map((h) => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dashboardStats.length > 0 ? dashboardStats.map((stat, i) => {
                    const secs = stat.accumulated_seconds || 0;
                    const pct = Math.min(100, (secs / 2400) * 100).toFixed(0);
                    return (
                      <tr key={i} style={{ borderBottom: "1px solid #1e293b" }}>
                        <td style={tdStyle}>{stat.student || stat.student_name}</td>
                        <td style={{ ...tdStyle, textAlign: "center" }}>{Math.floor(secs / 60)}m {secs % 60}s</td>
                        <td style={{ ...tdStyle, textAlign: "center" }}>
                          <div style={{ background: "#0f172a", borderRadius: "4px", height: "6px", width: "80px", display: "inline-block", position: "relative" }}>
                            <div style={{ background: pct >= 100 ? "#10b981" : "#38bdf8", height: "100%", borderRadius: "4px", width: `${pct}%`, transition: "width 0.5s" }}></div>
                          </div>
                          <span style={{ fontSize: "10px", color: "#64748b", marginLeft: "6px" }}>{pct}%</span>
                        </td>
                        <td style={{ ...tdStyle, textAlign: "center" }}>
                          <span style={{
                            padding: "3px 10px", borderRadius: "10px", fontSize: "11px", fontWeight: "bold",
                            background: stat.status === "Present" ? "#10b981" : stat.status === "Partial" ? "#f59e0b" : "#3b82f6",
                            color: "#fff",
                          }}>{stat.status}</span>
                        </td>
                        <td style={{ ...tdStyle, textAlign: "center", fontFamily: "monospace", fontSize: "11px", color: "#64748b" }}>
                          {stat.session_id || stat.session_id || "---"}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "center", fontSize: "12px" }}>
                          {stat.adaptive_gap || stat.adaptive_gap_threshold || 10}s
                        </td>
                        <td style={{ ...tdStyle, textAlign: "center", fontSize: "12px" }}>
                          {(stat.biometric_score || 0).toFixed(2)}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "center" }}>
                          <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: (stat.env_valid !== 0 && stat.env_valid !== false && stat.env_validated !== 0) ? "#10b981" : "#ef4444" }}></span>
                        </td>
                      </tr>
                    );
                  }) : (
                    <tr><td colSpan="8" style={{ padding: "30px", color: "#64748b", textAlign: "center" }}>No students tracked yet. Start continuous tracking from the Camera tab.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ===== CAMERA TAB ===== */}
        {activeTab === "camera" && (
          <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
            <div style={{ ...card, flex: "1", minWidth: "400px" }}>
              <h3 style={{ color: "#38bdf8", marginTop: 0, fontSize: "16px" }}>Classroom Camera Feed</h3>
              <video ref={videoRef} autoPlay playsInline muted
                style={{ width: "100%", borderRadius: "10px", border: "1px solid #334155", marginBottom: "12px" }} />
              <button onClick={toggleTracking} style={{
                padding: "12px 24px", fontSize: "14px", border: "none", borderRadius: "8px", width: "100%",
                background: isTracking ? "#ef4444" : "#10b981", color: "white", cursor: "pointer", fontWeight: "bold",
              }}>
                {isTracking ? "Stop Continuous Tracking" : "Start Continuous Tracking (3s Interval)"}
              </button>
              {resultImage && (
                <div style={{ marginTop: "16px" }}>
                  <h4 style={{ color: "#94a3b8", fontSize: "14px" }}>YOLO Vision Output</h4>
                  <img src={resultImage} alt="vision result" style={{ width: "100%", borderRadius: "10px", border: "1px solid #334155" }} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== STUDENTS TAB ===== */}
        {activeTab === "students" && (
          <div>
            <div style={card}>
              <h3 style={{ color: "#38bdf8", marginTop: 0, fontSize: "16px" }}>Student Attendance Lookup</h3>
              <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
                <input
                  type="text"
                  placeholder="Enter student name..."
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchStudent()}
                  style={{
                    flex: 1, padding: "10px 14px", borderRadius: "8px",
                    border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0",
                    fontSize: "14px", outline: "none",
                  }}
                />
                <button onClick={searchStudent} style={{ ...outlineBtn, padding: "10px 20px" }}>Search</button>
              </div>

              {studentProfile && (
                <div>
                  {/* Student Summary Cards */}
                  <div style={{ display: "flex", gap: "15px", flexWrap: "wrap", marginBottom: "20px" }}>
                    <div style={metricCard}>
                      <span style={{ color: "#94a3b8", fontSize: "12px" }}>Student</span>
                      <span style={{ fontSize: "22px", fontWeight: "bold", color: "#38bdf8" }}>{studentProfile.student_name}</span>
                    </div>
                    <div style={metricCard}>
                      <span style={{ color: "#94a3b8", fontSize: "12px" }}>Attendance Rate</span>
                      <span style={{ fontSize: "22px", fontWeight: "bold", color: studentProfile.attendance_rate >= 75 ? "#10b981" : "#ef4444" }}>
                        {studentProfile.attendance_rate}%
                      </span>
                    </div>
                    <div style={metricCard}>
                      <span style={{ color: "#94a3b8", fontSize: "12px" }}>Classes Present</span>
                      <span style={{ fontSize: "22px", fontWeight: "bold", color: "#f59e0b" }}>
                        {studentProfile.classes_present}/{studentProfile.total_classes}
                      </span>
                    </div>
                    <div style={metricCard}>
                      <a href={`${API_URL}/student/${studentProfile.student_name}/download`} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                        <button style={{ ...outlineBtn, marginTop: "8px" }}>Download Report</button>
                      </a>
                    </div>
                  </div>

                  {/* Student History Table */}
                  {studentProfile.history && studentProfile.history.length > 0 && (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "#0f172a" }}>
                          {["Date", "Class", "First Seen", "Last Seen", "Active Time", "Status", "Bio Score"].map((h) => (
                            <th key={h} style={thStyle}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {studentProfile.history.map((rec, i) => (
                          <tr key={i} style={{ borderBottom: "1px solid #1e293b" }}>
                            <td style={tdStyle}>{rec.date}</td>
                            <td style={tdStyle}>{rec.class_name}</td>
                            <td style={{ ...tdStyle, fontSize: "12px", color: "#94a3b8" }}>{rec.first_seen}</td>
                            <td style={{ ...tdStyle, fontSize: "12px", color: "#94a3b8" }}>{rec.last_seen}</td>
                            <td style={{ ...tdStyle, textAlign: "center" }}>
                              {Math.floor((rec.accumulated_seconds || 0) / 60)}m
                            </td>
                            <td style={{ ...tdStyle, textAlign: "center" }}>
                              <span style={{
                                padding: "3px 10px", borderRadius: "10px", fontSize: "11px", fontWeight: "bold",
                                background: rec.status === "Present" ? "#10b981" : rec.status === "Partial" ? "#f59e0b" : "#ef4444",
                                color: "#fff",
                              }}>{rec.status}</span>
                            </td>
                            <td style={{ ...tdStyle, textAlign: "center", fontSize: "12px" }}>{(rec.biometric_score || 0).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== AUDIT TAB ===== */}
        {activeTab === "audit" && (
          <div style={card}>
            <h3 style={{ color: "#38bdf8", marginTop: 0, fontSize: "16px" }}>Blockchain Audit Trail</h3>
            <p style={{ color: "#64748b", fontSize: "12px" }}>Immutable hash-chain of all attendance events</p>
            <div style={{ maxHeight: "500px", overflowY: "auto", marginTop: "12px" }}>
              {auditLog.length > 0 ? auditLog.slice().reverse().map((event, i) => (
                <div key={i} style={{
                  background: "#0f172a", padding: "10px 14px", borderRadius: "8px",
                  marginBottom: "6px", borderLeft: "3px solid #38bdf8",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                    <span style={{ color: "#38bdf8", fontSize: "11px", fontWeight: "bold" }}>{event.event_type}</span>
                    <span style={{ color: "#475569", fontSize: "10px" }}>{event.timestamp}</span>
                  </div>
                  <div style={{ fontSize: "12px" }}>
                    <span style={{ color: "#94a3b8" }}>Student:</span> {event.student}
                  </div>
                  <div style={{ fontSize: "10px", color: "#475569", fontFamily: "monospace", marginTop: "2px" }}>
                    Hash: {event.hash?.slice(0, 24)}...
                  </div>
                </div>
              )) : (
                <p style={{ color: "#64748b", textAlign: "center", padding: "30px" }}>No audit events recorded yet.</p>
              )}
            </div>
          </div>
        )}

        {/* ===== ENVIRONMENT TAB ===== */}
        {activeTab === "environment" && (
          <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
            <div style={{ ...card, flex: "1", minWidth: "300px" }}>
              <h3 style={{ color: "#38bdf8", marginTop: 0, fontSize: "16px" }}>Environmental Sensors</h3>
              {envData?.readings ? (
                <div>
                  <div style={sensorCard}>
                    <span style={{ color: "#94a3b8", fontSize: "12px" }}>Ambient Light</span>
                    <span style={{ fontSize: "28px", fontWeight: "bold", color: "#f59e0b" }}>
                      {envData.readings.light_lux?.toFixed(0) || "---"} lux
                    </span>
                    <span style={{ fontSize: "11px", color: "#475569" }}>
                      Range: {envData.readings.bounds?.light?.[0]} - {envData.readings.bounds?.light?.[1]} lux
                    </span>
                  </div>
                  <div style={sensorCard}>
                    <span style={{ color: "#94a3b8", fontSize: "12px" }}>Temperature</span>
                    <span style={{ fontSize: "28px", fontWeight: "bold", color: "#10b981" }}>
                      {envData.readings.temperature_celsius?.toFixed(1) || "---"} C
                    </span>
                    <span style={{ fontSize: "11px", color: "#475569" }}>
                      Range: {envData.readings.bounds?.temperature?.[0]} - {envData.readings.bounds?.temperature?.[1]} C
                    </span>
                  </div>
                </div>
              ) : <p style={{ color: "#64748b" }}>Loading sensor data...</p>}
            </div>
            <div style={{ ...card, flex: "1", minWidth: "300px" }}>
              <h3 style={{ color: "#38bdf8", marginTop: 0, fontSize: "16px" }}>Module Telemetry</h3>
              <div style={sensorCard}>
                <span style={{ color: "#94a3b8", fontSize: "12px" }}>ZK Proofs Generated</span>
                <span style={{ fontSize: "28px", fontWeight: "bold", color: "#8b5cf6" }}>{zkStatus?.proof_count || 0}</span>
                <span style={{ fontSize: "11px", color: "#475569" }}>Protocol: Pedersen Commitment v1</span>
              </div>
              <div style={sensorCard}>
                <span style={{ color: "#94a3b8", fontSize: "12px" }}>Federated Learning</span>
                <span style={{ fontSize: "28px", fontWeight: "bold", color: "#06b6d4" }}>{fedStatus?.client_samples || 0} samples</span>
                <span style={{ fontSize: "11px", color: "#475569" }}>Pending deltas: {fedStatus?.server_status?.pending_deltas || 0}</span>
              </div>
            </div>
          </div>
        )}

        {/* ===== SYSTEM TAB ===== */}
        {activeTab === "system" && (
          <div style={card}>
            <h3 style={{ color: "#38bdf8", marginTop: 0, fontSize: "16px" }}>Model Attestation Report</h3>
            {attestation?.models ? Object.entries(attestation.models).map(([name, info]) => (
              <div key={name} style={{
                background: "#0f172a", padding: "10px 14px", borderRadius: "8px",
                marginBottom: "6px", display: "flex", justifyContent: "space-between", alignItems: "center",
                borderLeft: `3px solid ${info.status === "OK" ? "#10b981" : "#ef4444"}`,
              }}>
                <span style={{ fontWeight: "bold", fontSize: "13px" }}>{name}</span>
                <span style={{
                  padding: "3px 10px", borderRadius: "10px", fontSize: "11px", fontWeight: "bold",
                  background: info.status === "OK" ? "#10b981" : "#ef4444", color: "#fff",
                }}>{info.status}</span>
              </div>
            )) : <p style={{ color: "#64748b" }}>Loading attestation data...</p>}
          </div>
        )}

        <canvas ref={canvasRef} style={{ display: "none" }} />
      </div>
    </div>
  );
}

const card = { background: "#1e293b", padding: "20px", borderRadius: "12px", marginBottom: "16px" };
const thStyle = { padding: "10px 12px", textAlign: "left", color: "#38bdf8", fontSize: "11px", fontWeight: "600", borderBottom: "1px solid #334155" };
const tdStyle = { padding: "10px 12px", fontSize: "13px" };
const outlineBtn = { padding: "8px 16px", fontSize: "12px", border: "1px solid #38bdf8", borderRadius: "8px", background: "transparent", color: "#38bdf8", cursor: "pointer", fontWeight: "bold" };
const sensorCard = { background: "#0f172a", padding: "14px", borderRadius: "10px", marginBottom: "10px", display: "flex", flexDirection: "column", gap: "4px" };
const metricCard = { background: "#0f172a", padding: "16px", borderRadius: "10px", display: "flex", flexDirection: "column", gap: "4px", flex: "1", minWidth: "140px" };

export default App;