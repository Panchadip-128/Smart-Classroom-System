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

  const fetchSystemStatus = async () => {
    try {
      const [envRes, zkRes, fedRes, attRes] = await Promise.all([
        axios.get(`${API_URL}/environment`).catch(() => null),
        axios.get(`${API_URL}/zk/status`).catch(() => null),
        axios.get(`${API_URL}/federated/status`).catch(() => null),
        axios.get(`${API_URL}/attestation`).catch(() => null),
      ]);
      if (envRes) setEnvData(envRes.data);
      if (zkRes) setZkStatus(zkRes.data);
      if (fedRes) setFedStatus(fedRes.data);
      if (attRes) setAttestation(attRes.data);
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
      } catch (e) {
        console.error("WS error", e);
      }
    };

    ws.current.onclose = () => {
      console.log("WS closed. Reconnecting...");
      setTimeout(connectWebSocket, 3000);
    };
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      videoRef.current.srcObject = stream;
    } catch (err) {
      console.log("Camera access denied or unavailable:", err);
    }
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
      const res = await axios.post(`${API_URL}/attendance`, { image });
      setResultImage(`${API_URL}/static/result.jpg?t=` + new Date().getTime());
      if (res.data.environment) {
        setEnvData({ valid: true, readings: res.data.environment });
      }
    } catch (err) {
      console.log("Error processing frame", err);
    }
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

  const tabStyle = (tab) => ({
    padding: "10px 20px",
    fontSize: "13px",
    fontWeight: activeTab === tab ? "bold" : "normal",
    border: "none",
    borderBottom: activeTab === tab ? "2px solid #38bdf8" : "2px solid transparent",
    background: "transparent",
    color: activeTab === tab ? "#38bdf8" : "#94a3b8",
    cursor: "pointer",
    transition: "all 0.2s",
  });

  const cardStyle = {
    background: "#1e293b",
    padding: "20px",
    borderRadius: "12px",
    marginBottom: "20px",
  };

  const statusDot = (ok) => ({
    display: "inline-block",
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    background: ok ? "#10b981" : "#ef4444",
    marginRight: "8px",
  });

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: "#0f172a", minHeight: "100vh", color: "#e2e8f0", padding: "30px" }}>
      <div style={{ maxWidth: "1400px", margin: "0 auto" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "30px" }}>
          <h1 style={{ color: "#38bdf8", marginBottom: "4px", fontSize: "26px", letterSpacing: "-0.5px" }}>
            Continuous Spatial-Temporal Presence Engine
          </h1>
          <p style={{ color: "#64748b", fontSize: "14px" }}>
            10-Module Patent Architecture | YOLOv8 Liveness | Adaptive AAP | ZK Proofs | Blockchain Audit
          </p>
        </div>

        {/* System Status Bar */}
        <div style={{ display: "flex", gap: "15px", justifyContent: "center", flexWrap: "wrap", marginBottom: "25px" }}>
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
              background: "#1e293b", padding: "6px 14px", borderRadius: "20px",
              fontSize: "11px", display: "flex", alignItems: "center",
              border: `1px solid ${mod.ok ? "#1e3a2f" : "#3b1c1c"}`,
            }}>
              <span style={statusDot(mod.ok)}></span>
              {mod.label}
            </div>
          ))}
        </div>

        {/* Tab Navigation */}
        <div style={{ display: "flex", gap: "5px", marginBottom: "25px", borderBottom: "1px solid #1e293b", paddingBottom: "0" }}>
          {["dashboard", "camera", "audit", "environment", "system"].map((tab) => (
            <button key={tab} onClick={() => { setActiveTab(tab); if (tab === "audit") fetchAuditLog(); if (tab === "system") fetchSystemStatus(); }}
              style={tabStyle(tab)}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Dashboard Tab */}
        {activeTab === "dashboard" && (
          <div style={cardStyle}>
            <h3 style={{ color: "#38bdf8", marginTop: 0 }}>Live Teacher Dashboard</h3>
            <p style={{ color: "#64748b", fontSize: "13px" }}>Accumulated Active Presence required: {policy_minutes()}m</p>

            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "15px" }}>
              <thead>
                <tr style={{ background: "#0f172a" }}>
                  <th style={thStyle}>Student</th>
                  <th style={thStyle}>Active Time</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Session</th>
                  <th style={thStyle}>Gap Threshold</th>
                  <th style={thStyle}>Bio Score</th>
                  <th style={thStyle}>Env Valid</th>
                </tr>
              </thead>
              <tbody>
                {dashboardStats.length > 0 ? (
                  dashboardStats.map((stat, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #1e293b" }}>
                      <td style={tdStyle}>{stat.student || stat.student_name}</td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        {Math.floor((stat.accumulated_seconds || 0) / 60)}m {(stat.accumulated_seconds || 0) % 60}s
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <span style={{
                          padding: "3px 10px", borderRadius: "10px", fontSize: "11px", fontWeight: "bold",
                          background: stat.status === "Present" ? "#10b981" : "#f59e0b",
                          color: stat.status === "Present" ? "#fff" : "#0f172a",
                        }}>
                          {stat.status}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center", fontFamily: "monospace", fontSize: "12px", color: "#64748b" }}>
                        {stat.session_id || "---"}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        {stat.adaptive_gap || stat.adaptive_gap_threshold || 10}s
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        {(stat.biometric_score || 0).toFixed(2)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <span style={statusDot(stat.env_valid !== 0 && stat.env_valid !== false && stat.env_validated !== 0)}></span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan="7" style={{ padding: "30px", color: "#64748b", textAlign: "center" }}>No students tracked yet.</td></tr>
                )}
              </tbody>
            </table>

            <div style={{ marginTop: "20px", display: "flex", gap: "10px" }}>
              <a href={`${API_URL}/download`} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                <button style={outlineBtn}>Export Excel Report</button>
              </a>
            </div>
          </div>
        )}

        {/* Camera Tab */}
        {activeTab === "camera" && (
          <div style={{ display: "flex", gap: "25px", flexWrap: "wrap" }}>
            <div style={{ ...cardStyle, flex: "1", minWidth: "400px" }}>
              <h3 style={{ color: "#38bdf8", marginTop: 0 }}>Classroom Camera Feed</h3>
              <video ref={videoRef} autoPlay playsInline muted
                style={{ width: "100%", borderRadius: "10px", border: "1px solid #334155", marginBottom: "15px" }} />

              <button onClick={toggleTracking} style={{
                padding: "12px 24px", fontSize: "14px", border: "none", borderRadius: "8px", width: "100%",
                background: isTracking ? "#ef4444" : "#10b981", color: "white", cursor: "pointer", fontWeight: "bold",
              }}>
                {isTracking ? "Stop Continuous Tracking" : "Start Continuous Tracking (3s Interval)"}
              </button>

              {resultImage && (
                <div style={{ marginTop: "20px" }}>
                  <h4 style={{ color: "#94a3b8" }}>YOLO Vision Output</h4>
                  <img src={resultImage} alt="vision result" style={{ width: "100%", borderRadius: "10px", border: "1px solid #334155" }} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Audit Log Tab */}
        {activeTab === "audit" && (
          <div style={cardStyle}>
            <h3 style={{ color: "#38bdf8", marginTop: 0 }}>Blockchain Audit Trail</h3>
            <p style={{ color: "#64748b", fontSize: "13px" }}>Immutable hash-chain of all attendance events</p>

            <div style={{ maxHeight: "500px", overflowY: "auto", marginTop: "15px" }}>
              {auditLog.length > 0 ? (
                auditLog.slice().reverse().map((event, i) => (
                  <div key={i} style={{
                    background: "#0f172a", padding: "12px 16px", borderRadius: "8px",
                    marginBottom: "8px", borderLeft: "3px solid #38bdf8",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                      <span style={{ color: "#38bdf8", fontSize: "12px", fontWeight: "bold" }}>{event.event_type}</span>
                      <span style={{ color: "#475569", fontSize: "11px" }}>{event.timestamp}</span>
                    </div>
                    <div style={{ fontSize: "13px" }}>
                      <span style={{ color: "#94a3b8" }}>Student:</span> {event.student}
                    </div>
                    <div style={{ fontSize: "11px", color: "#475569", fontFamily: "monospace", marginTop: "4px" }}>
                      Hash: {event.hash?.slice(0, 24)}...
                    </div>
                  </div>
                ))
              ) : (
                <p style={{ color: "#64748b", textAlign: "center", padding: "30px" }}>No audit events recorded yet.</p>
              )}
            </div>
          </div>
        )}

        {/* Environment Tab */}
        {activeTab === "environment" && (
          <div style={{ display: "flex", gap: "25px", flexWrap: "wrap" }}>
            <div style={{ ...cardStyle, flex: "1", minWidth: "300px" }}>
              <h3 style={{ color: "#38bdf8", marginTop: 0 }}>Environmental Sensors</h3>
              {envData?.readings ? (
                <div>
                  <div style={sensorCard}>
                    <span style={{ color: "#94a3b8" }}>Ambient Light</span>
                    <span style={{ fontSize: "28px", fontWeight: "bold", color: "#f59e0b" }}>
                      {envData.readings.light_lux?.toFixed(0) || "---"} lux
                    </span>
                    <span style={{ fontSize: "11px", color: "#475569" }}>
                      Range: {envData.readings.bounds?.light?.[0]} - {envData.readings.bounds?.light?.[1]} lux
                    </span>
                  </div>
                  <div style={sensorCard}>
                    <span style={{ color: "#94a3b8" }}>Temperature</span>
                    <span style={{ fontSize: "28px", fontWeight: "bold", color: "#10b981" }}>
                      {envData.readings.temperature_celsius?.toFixed(1) || "---"} C
                    </span>
                    <span style={{ fontSize: "11px", color: "#475569" }}>
                      Range: {envData.readings.bounds?.temperature?.[0]} - {envData.readings.bounds?.temperature?.[1]} C
                    </span>
                  </div>
                </div>
              ) : (
                <p style={{ color: "#64748b" }}>Loading sensor data...</p>
              )}
            </div>

            <div style={{ ...cardStyle, flex: "1", minWidth: "300px" }}>
              <h3 style={{ color: "#38bdf8", marginTop: 0 }}>System Modules</h3>

              <div style={sensorCard}>
                <span style={{ color: "#94a3b8" }}>ZK Proofs Generated</span>
                <span style={{ fontSize: "28px", fontWeight: "bold", color: "#8b5cf6" }}>
                  {zkStatus?.proof_count || 0}
                </span>
                <span style={{ fontSize: "11px", color: "#475569" }}>Protocol: Pedersen Commitment v1</span>
              </div>

              <div style={sensorCard}>
                <span style={{ color: "#94a3b8" }}>Federated Learning</span>
                <span style={{ fontSize: "28px", fontWeight: "bold", color: "#06b6d4" }}>
                  {fedStatus?.client_samples || 0} samples
                </span>
                <span style={{ fontSize: "11px", color: "#475569" }}>
                  Pending deltas: {fedStatus?.server_status?.pending_deltas || 0}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* System Tab */}
        {activeTab === "system" && (
          <div style={cardStyle}>
            <h3 style={{ color: "#38bdf8", marginTop: 0 }}>Model Attestation Report</h3>
            {attestation?.models ? (
              Object.entries(attestation.models).map(([name, info]) => (
                <div key={name} style={{
                  background: "#0f172a", padding: "12px 16px", borderRadius: "8px",
                  marginBottom: "8px", display: "flex", justifyContent: "space-between", alignItems: "center",
                  borderLeft: `3px solid ${info.status === "OK" ? "#10b981" : "#ef4444"}`,
                }}>
                  <span style={{ fontWeight: "bold" }}>{name}</span>
                  <span style={{
                    padding: "3px 10px", borderRadius: "10px", fontSize: "11px", fontWeight: "bold",
                    background: info.status === "OK" ? "#10b981" : "#ef4444", color: "#fff",
                  }}>
                    {info.status}
                  </span>
                </div>
              ))
            ) : (
              <p style={{ color: "#64748b" }}>Loading attestation data...</p>
            )}
          </div>
        )}

        <canvas ref={canvasRef} style={{ display: "none" }} />
      </div>
    </div>
  );
}

// Helper styles
const thStyle = { padding: "10px 12px", textAlign: "left", color: "#38bdf8", fontSize: "12px", fontWeight: "600", borderBottom: "1px solid #334155" };
const tdStyle = { padding: "10px 12px", fontSize: "13px" };
const outlineBtn = {
  padding: "10px 20px", fontSize: "13px", border: "1px solid #38bdf8", borderRadius: "8px",
  background: "transparent", color: "#38bdf8", cursor: "pointer", fontWeight: "bold",
};
const sensorCard = {
  background: "#0f172a", padding: "16px", borderRadius: "10px",
  marginBottom: "12px", display: "flex", flexDirection: "column", gap: "6px",
};

function policy_minutes() { return 40; }

export default App;