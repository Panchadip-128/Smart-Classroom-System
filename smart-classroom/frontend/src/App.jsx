import { useEffect, useRef, useState } from "react";
import axios from "axios";

function App() {
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
  const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8000/ws/dashboard";

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
  const [isDark, setIsDark] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

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

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  const showNotification = (msg, type = "success") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const downloadExcelReport = async (url, filename) => {
    try {
      setIsDownloading(true);
      showNotification("Generating secure Excel report...", "success");
      const res = await axios.get(url, { responseType: 'blob' });
      const blobURL = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = blobURL;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      showNotification("Report downloaded successfully!", "success");
    } catch (e) {
      console.error(e);
      showNotification("Failed to download report", "error");
    } finally {
      setIsDownloading(false);
    }
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

  const tabs = [
    { id: "dashboard", name: "Dashboard" },
    { id: "camera", name: "Live Camera" },
    { id: "students", name: "Student Lookup" },
    { id: "audit", name: "Audit Trail" },
    { id: "environment", name: "Telemetry" },
    { id: "system", name: "Attestation" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 font-sans text-slate-900 dark:text-slate-100 transition-colors duration-300">
      
      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-4 right-4 z-50 animate-fade-in-down">
          <div className={`rounded-md p-4 shadow-lg ${notification.type === "success" ? "bg-emerald-50 dark:bg-emerald-900/90" : "bg-red-50 dark:bg-red-900/90"}`}>
            <div className="flex">
              <div className="flex-shrink-0">
                {notification.type === "success" ? (
                  <svg className="h-5 w-5 text-emerald-400 dark:text-emerald-300" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5 text-red-400 dark:text-red-300" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
              <div className="ml-3">
                <p className={`text-sm font-medium ${notification.type === "success" ? "text-emerald-800 dark:text-emerald-100" : "text-red-800 dark:text-red-100"}`}>
                  {notification.msg}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top Navigation Bar */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 justify-between items-center">
            <div className="flex">
              <div className="flex flex-shrink-0 items-center">
                <svg className="h-8 w-8 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 9.75L16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
                </svg>
                <div className="ml-3">
                  <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white leading-tight">CSTPE</h1>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium tracking-wide uppercase">University Management System</p>
                </div>
              </div>
              <div className="hidden sm:ml-10 sm:flex sm:space-x-8 overflow-x-auto">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id);
                      if (tab.id === "audit") fetchAuditLog();
                      if (tab.id === "system" || tab.id === "environment") fetchSystemStatus();
                    }}
                    className={`inline-flex items-center border-b-2 px-1 pt-1 text-sm font-medium transition-colors whitespace-nowrap ${
                      activeTab === tab.id
                        ? "border-indigo-600 text-slate-900 dark:text-white dark:border-indigo-400"
                        : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:border-slate-600"
                    }`}
                  >
                    {tab.name}
                  </button>
                ))}
              </div>
            </div>
            
            {/* System Status Indicators in Nav */}
            <div className="flex items-center space-x-4">
              <button 
                onClick={() => setIsDark(!isDark)}
                className="p-2 rounded-full text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Toggle Dark Mode"
              >
                {isDark ? (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </button>

              <div className="hidden lg:flex items-center space-x-4">
                <div className="flex items-center space-x-1">
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Engine Active</span>
                </div>
                <div className="text-xs font-medium px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-md border border-slate-200 dark:border-slate-700">
                  v2.0 Edge
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* ===== DASHBOARD TAB ===== */}
        {activeTab === "dashboard" && (
          <div className="space-y-6">
            
            {/* Header Controls */}
            <div className="md:flex md:items-center md:justify-between bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm transition-colors">
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold leading-7 text-slate-900 dark:text-white sm:truncate sm:tracking-tight">
                  Classroom: General
                </h2>
                {classSummary && (
                  <div className="mt-1 flex flex-col sm:mt-0 sm:flex-row sm:flex-wrap sm:space-x-6">
                    <div className="mt-2 flex items-center text-sm text-slate-500 dark:text-slate-400">
                      Present: <span className="ml-1 font-semibold text-slate-900 dark:text-white">{classSummary.present}</span>
                    </div>
                    <div className="mt-2 flex items-center text-sm text-slate-500 dark:text-slate-400">
                      In Progress: <span className="ml-1 font-semibold text-slate-900 dark:text-white">{classSummary.in_progress}</span>
                    </div>
                    <div className="mt-2 flex items-center text-sm text-slate-500 dark:text-slate-400">
                      Total Enrolled: <span className="ml-1 font-semibold text-slate-900 dark:text-white">{classSummary.total_students}</span>
                    </div>
                  </div>
                )}
              </div>
              <div className="mt-4 flex md:ml-4 md:mt-0 space-x-3">
                <button
                  type="button"
                  onClick={resetSession}
                  className="inline-flex items-center rounded-md bg-white dark:bg-slate-800 px-3 py-2 text-sm font-semibold text-red-600 dark:text-red-400 shadow-sm ring-1 ring-inset ring-red-300 dark:ring-red-900/50 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                >
                  Reset Session
                </button>
                <button
                  type="button"
                  onClick={() => downloadExcelReport(`${API_URL}/download`, 'attendance_report.xlsx')}
                  disabled={isDownloading}
                  className="inline-flex items-center rounded-md bg-white dark:bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-900 dark:text-slate-200 shadow-sm ring-1 ring-inset ring-slate-300 dark:ring-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDownloading ? (
                    <svg className="animate-spin -ml-0.5 mr-1.5 h-5 w-5 text-indigo-500" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <svg className="-ml-0.5 mr-1.5 h-5 w-5 text-slate-400 dark:text-slate-500" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.25 2A2.25 2.25 0 002 4.25v11.5A2.25 2.25 0 004.25 18h11.5A2.25 2.25 0 0018 15.75V4.25A2.25 2.25 0 0015.75 2H4.25zM10 7a.75.75 0 01.75.75v2.5h2.5a.75.75 0 010 1.5h-2.5v2.5a.75.75 0 01-1.5 0v-2.5h-2.5a.75.75 0 010-1.5h2.5v-2.5A.75.75 0 0110 7z" clipRule="evenodd" />
                    </svg>
                  )}
                  {isDownloading ? "Generating..." : "Export Report"}
                </button>
                <button
                  type="button"
                  onClick={finalizeDay}
                  className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition-all"
                >
                  Finalize Day
                </button>
              </div>
            </div>

            {/* Attendance Table */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden transition-colors">
              <div className="px-4 py-5 border-b border-slate-200 dark:border-slate-700 sm:px-6">
                <h3 className="text-base font-semibold leading-6 text-slate-900 dark:text-white">Live Active Presence Tracker</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Threshold requirement: 40 minutes (2400 seconds)</p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                  <thead className="bg-slate-50 dark:bg-slate-800/50">
                    <tr>
                      {["Student", "Active Time", "Progress", "Status", "Session UUID", "Dyn Gap", "Bio Score", "Env"].map((h) => (
                        <th key={h} scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-800">
                    {dashboardStats.length > 0 ? dashboardStats.map((stat, i) => {
                      const secs = stat.accumulated_seconds || 0;
                      const pct = Math.min(100, (secs / 2400) * 100).toFixed(0);
                      
                      // Status Badge Logic
                      let badgeClass = "bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-900/30 dark:text-blue-400 dark:ring-blue-500/20";
                      if (stat.status === "Present") badgeClass = "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-900/30 dark:text-emerald-400 dark:ring-emerald-500/20";
                      else if (stat.status === "Partial") badgeClass = "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-900/30 dark:text-amber-400 dark:ring-amber-500/20";
                      else if (stat.status === "Absent") badgeClass = "bg-red-50 text-red-700 ring-red-600/10 dark:bg-red-900/30 dark:text-red-400 dark:ring-red-500/20";

                      return (
                        <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                          <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-slate-900 dark:text-slate-100">
                            {stat.student || stat.student_name}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                            {Math.floor(secs / 60)}m {secs % 60}s
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                            <div className="flex items-center">
                              <div className="w-24 bg-slate-200 dark:bg-slate-700 rounded-full h-2 mr-2 overflow-hidden">
                                <div 
                                  className={`h-2 rounded-full ${pct >= 100 ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-indigo-500 dark:bg-indigo-400'} transition-all duration-500 ease-out`} 
                                  style={{ width: `${pct}%` }}
                                ></div>
                              </div>
                              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{pct}%</span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm">
                            <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${badgeClass}`}>
                              {stat.status}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-xs font-mono text-slate-400 dark:text-slate-500">
                            {stat.session_id || stat.session_id || "---"}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                            {stat.adaptive_gap || stat.adaptive_gap_threshold || 10}s
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500 dark:text-slate-400 font-mono">
                            {(stat.biometric_score || 0).toFixed(2)}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                            <span className={`inline-flex rounded-full h-2 w-2 ${(stat.env_valid !== 0 && stat.env_valid !== false && stat.env_validated !== 0) ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-red-500 dark:bg-red-400'}`}></span>
                          </td>
                        </tr>
                      );
                    }) : (
                      <tr>
                        <td colSpan="8" className="px-6 py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                          <svg className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          <p className="font-semibold text-slate-900 dark:text-white">No active tracking sessions</p>
                          <p className="mt-1">Start continuous camera tracking from the Live Camera tab to begin monitoring.</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ===== CAMERA TAB ===== */}
        {activeTab === "camera" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col transition-colors">
              <div className="px-4 py-5 border-b border-slate-200 dark:border-slate-700 sm:px-6">
                <h3 className="text-base font-semibold leading-6 text-slate-900 dark:text-white">Classroom Camera Feed</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Raw capture stream for edge inference</p>
              </div>
              <div className="p-4 flex-1">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-auto rounded-lg bg-slate-900 border border-slate-200 dark:border-slate-700 object-cover aspect-video" />
              </div>
              <div className="px-4 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700">
                <button
                  onClick={toggleTracking}
                  className={`w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all ${
                    isTracking 
                      ? "bg-red-600 hover:bg-red-700 focus:ring-red-500" 
                      : "bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500"
                  }`}
                >
                  {isTracking ? (
                    <>
                      <svg className="w-5 h-5 mr-2 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 002 0V8a1 1 0 00-1-1zm4 0a1 1 0 00-1 1v4a1 1 0 002 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      Stop Tracking Engine
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Initialize Continuous Tracking (3s)
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col transition-colors">
              <div className="px-4 py-5 border-b border-slate-200 dark:border-slate-700 sm:px-6">
                <h3 className="text-base font-semibold leading-6 text-slate-900 dark:text-white">ONNX Vision Output</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Live bounding box and facial encoding visualization</p>
              </div>
              <div className="p-4 flex-1 flex items-center justify-center bg-slate-50 dark:bg-slate-900/50">
                {resultImage ? (
                  <img src={resultImage} alt="vision result" className="w-full h-auto rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm aspect-video object-contain bg-white dark:bg-slate-900" />
                ) : (
                  <div className="text-center text-slate-400 dark:text-slate-500 flex flex-col items-center">
                    <svg className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <p>Awaiting inference frame...</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ===== STUDENTS TAB ===== */}
        {activeTab === "students" && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden transition-colors">
              <div className="px-4 py-5 border-b border-slate-200 dark:border-slate-700 sm:px-6">
                <h3 className="text-base font-semibold leading-6 text-slate-900 dark:text-white">Student Profiles & Analytics</h3>
              </div>
              <div className="p-6 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                <div className="max-w-xl flex rounded-md shadow-sm">
                  <div className="relative flex flex-grow items-stretch focus-within:z-10">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                      <svg className="h-5 w-5 text-slate-400 dark:text-slate-500" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <input
                      type="text"
                      className="block w-full rounded-none rounded-l-md border-0 py-2.5 pl-10 text-slate-900 dark:text-white ring-1 ring-inset ring-slate-300 dark:ring-slate-700 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-inset focus:ring-indigo-600 dark:focus:ring-indigo-500 sm:text-sm sm:leading-6 bg-white dark:bg-slate-900"
                      placeholder="Search student globally by name (e.g. Alice)..."
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && searchStudent()}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={searchStudent}
                    className="relative -ml-px inline-flex items-center gap-x-1.5 rounded-r-md px-4 py-2 text-sm font-semibold text-slate-900 dark:text-slate-200 ring-1 ring-inset ring-slate-300 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 bg-white dark:bg-slate-900 transition-colors"
                  >
                    Lookup Record
                  </button>
                </div>
              </div>

              {studentProfile && (
                <div className="p-6">
                  {/* Student Summary Cards */}
                  <dl className="mt-2 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
                    <div className="overflow-hidden rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm px-4 py-5 sm:p-6 transition-colors">
                      <dt className="truncate text-sm font-medium text-slate-500 dark:text-slate-400">Student Identity</dt>
                      <dd className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">{studentProfile.student_name}</dd>
                    </div>
                    <div className="overflow-hidden rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm px-4 py-5 sm:p-6 transition-colors">
                      <dt className="truncate text-sm font-medium text-slate-500 dark:text-slate-400">Attendance Rate</dt>
                      <dd className={`mt-2 text-3xl font-semibold tracking-tight ${studentProfile.attendance_rate >= 75 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                        {studentProfile.attendance_rate}%
                      </dd>
                    </div>
                    <div className="overflow-hidden rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm px-4 py-5 sm:p-6 transition-colors">
                      <dt className="truncate text-sm font-medium text-slate-500 dark:text-slate-400">Classes Present</dt>
                      <dd className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
                        {studentProfile.classes_present} <span className="text-xl text-slate-400 dark:text-slate-500 font-normal">/ {studentProfile.total_classes}</span>
                      </dd>
                    </div>
                    <div className="overflow-hidden rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm px-4 py-5 sm:p-6 flex flex-col justify-center transition-colors">
                      <button 
                        onClick={() => downloadExcelReport(`${API_URL}/student/${studentProfile.student_name}/download`, `attendance_${studentProfile.student_name}.xlsx`)}
                        disabled={isDownloading}
                        className="w-full inline-flex justify-center items-center rounded-md bg-white dark:bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-900 dark:text-slate-200 shadow-sm ring-1 ring-inset ring-slate-300 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isDownloading ? (
                          <svg className="animate-spin -ml-0.5 mr-1.5 h-5 w-5 text-indigo-500" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        ) : (
                          <svg className="-ml-0.5 mr-1.5 h-5 w-5 text-slate-400 dark:text-slate-500" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4.25 2A2.25 2.25 0 002 4.25v11.5A2.25 2.25 0 004.25 18h11.5A2.25 2.25 0 0018 15.75V4.25A2.25 2.25 0 0015.75 2H4.25zM10 7a.75.75 0 01.75.75v2.5h2.5a.75.75 0 010 1.5h-2.5v2.5a.75.75 0 01-1.5 0v-2.5h-2.5a.75.75 0 010-1.5h2.5v-2.5A.75.75 0 0110 7z" clipRule="evenodd" />
                          </svg>
                        )}
                        {isDownloading ? "Generating..." : "Download Excel"}
                      </button>
                    </div>
                  </dl>

                  {/* Student History Table */}
                  {studentProfile.history && studentProfile.history.length > 0 && (
                    <div className="ring-1 ring-slate-200 dark:ring-slate-700 rounded-lg overflow-hidden transition-colors">
                      <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                        <thead className="bg-slate-50 dark:bg-slate-800/50">
                          <tr>
                            {["Date", "Class", "First Seen", "Last Seen", "Active Time", "Status", "Bio Score"].map((h) => (
                              <th key={h} className="px-6 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-800">
                          {studentProfile.history.map((rec, i) => {
                            let badgeClass = "bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-900/30 dark:text-blue-400 dark:ring-blue-500/20";
                            if (rec.status === "Present") badgeClass = "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-900/30 dark:text-emerald-400 dark:ring-emerald-500/20";
                            else if (rec.status === "Partial") badgeClass = "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-900/30 dark:text-amber-400 dark:ring-amber-500/20";
                            else if (rec.status === "Absent") badgeClass = "bg-red-50 text-red-700 ring-red-600/10 dark:bg-red-900/30 dark:text-red-400 dark:ring-red-500/20";

                            return (
                              <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                                <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-slate-900 dark:text-slate-100">{rec.date}</td>
                                <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500 dark:text-slate-400">{rec.class_name}</td>
                                <td className="whitespace-nowrap px-6 py-4 text-xs font-mono text-slate-400 dark:text-slate-500">{rec.first_seen}</td>
                                <td className="whitespace-nowrap px-6 py-4 text-xs font-mono text-slate-400 dark:text-slate-500">{rec.last_seen}</td>
                                <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500 dark:text-slate-400">{Math.floor((rec.accumulated_seconds || 0) / 60)}m</td>
                                <td className="whitespace-nowrap px-6 py-4 text-sm">
                                  <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${badgeClass}`}>
                                    {rec.status}
                                  </span>
                                </td>
                                <td className="whitespace-nowrap px-6 py-4 text-sm font-mono text-slate-500 dark:text-slate-400">{(rec.biometric_score || 0).toFixed(2)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== AUDIT TAB ===== */}
        {activeTab === "audit" && (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden transition-colors">
            <div className="px-4 py-5 border-b border-slate-200 dark:border-slate-700 sm:px-6 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
              <div>
                <h3 className="text-base font-semibold leading-6 text-slate-900 dark:text-white">Blockchain Audit Trail</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Immutable cryptographic ledger of system state changes</p>
              </div>
              <span className="inline-flex items-center rounded-md bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 ring-1 ring-inset ring-emerald-600/20 dark:ring-emerald-500/20">
                Chain Verified
              </span>
            </div>
            <div className="p-6 bg-white dark:bg-slate-800 overflow-y-auto transition-colors" style={{ maxHeight: "600px" }}>
              <div className="flow-root">
                <ul className="-mb-8">
                  {auditLog.length > 0 ? auditLog.slice().reverse().map((event, eventIdx) => (
                    <li key={eventIdx}>
                      <div className="relative pb-8">
                        {eventIdx !== auditLog.length - 1 ? (
                          <span className="absolute left-4 top-4 -ml-px h-full w-0.5 bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
                        ) : null}
                        <div className="relative flex space-x-3">
                          <div>
                            <span className="h-8 w-8 rounded-full bg-indigo-50 dark:bg-indigo-900/50 flex items-center justify-center ring-8 ring-white dark:ring-slate-800 border border-indigo-200 dark:border-indigo-800 transition-all">
                              <svg className="h-4 w-4 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                              </svg>
                            </span>
                          </div>
                          <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                            <div>
                              <p className="text-sm text-slate-900 dark:text-slate-100 font-medium">
                                {event.event_type} <span className="font-normal text-slate-500 dark:text-slate-400">for</span> {event.student}
                              </p>
                              <p className="mt-1 flex text-xs text-slate-400 dark:text-slate-500 font-mono">
                                Hash: {event.hash?.slice(0, 32)}...
                              </p>
                            </div>
                            <div className="whitespace-nowrap text-right text-sm text-slate-500 dark:text-slate-400">
                              <time dateTime={event.timestamp}>{event.timestamp}</time>
                            </div>
                          </div>
                        </div>
                      </div>
                    </li>
                  )) : (
                    <p className="text-center text-slate-500 dark:text-slate-400 py-10">No cryptographic events logged yet.</p>
                  )}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* ===== ENVIRONMENT & SYSTEM TABS ===== */}
        {(activeTab === "environment" || activeTab === "system") && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Environmental Sensors */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden transition-colors">
              <div className="px-4 py-5 border-b border-slate-200 dark:border-slate-700 sm:px-6 bg-slate-50 dark:bg-slate-800/50">
                <h3 className="text-base font-semibold leading-6 text-slate-900 dark:text-white">IoT Environmental Gating</h3>
              </div>
              <div className="p-6">
                <dl className="grid grid-cols-1 gap-5">
                  <div className="overflow-hidden rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-4 py-5 shadow-sm sm:p-6 transition-colors">
                    <dt className="truncate text-sm font-medium text-slate-500 dark:text-slate-400">Ambient Light Level</dt>
                    <dd className="mt-2 text-3xl font-semibold tracking-tight text-amber-500 dark:text-amber-400">{envData?.readings?.light_lux?.toFixed(0) || "---"} lux</dd>
                    <dd className="mt-1 flex items-baseline text-xs text-slate-500 dark:text-slate-400">
                      Valid Range: {envData?.readings?.bounds?.light?.[0]} - {envData?.readings?.bounds?.light?.[1]} lux
                    </dd>
                  </div>
                  <div className="overflow-hidden rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-4 py-5 shadow-sm sm:p-6 transition-colors">
                    <dt className="truncate text-sm font-medium text-slate-500 dark:text-slate-400">Room Temperature</dt>
                    <dd className="mt-2 text-3xl font-semibold tracking-tight text-indigo-600 dark:text-indigo-400">{envData?.readings?.temperature_celsius?.toFixed(1) || "---"} °C</dd>
                    <dd className="mt-1 flex items-baseline text-xs text-slate-500 dark:text-slate-400">
                      Valid Range: {envData?.readings?.bounds?.temperature?.[0]} - {envData?.readings?.bounds?.temperature?.[1]} °C
                    </dd>
                  </div>
                </dl>
              </div>
            </div>

            {/* Telemetry / Attestation */}
            <div className="space-y-6">
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden transition-colors">
                <div className="px-4 py-5 border-b border-slate-200 dark:border-slate-700 sm:px-6 bg-slate-50 dark:bg-slate-800/50">
                  <h3 className="text-base font-semibold leading-6 text-slate-900 dark:text-white">Zero-Knowledge Telemetry</h3>
                </div>
                <div className="p-6 border-b border-slate-200 dark:border-slate-700">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Proofs Generated</p>
                      <p className="mt-1 text-3xl font-semibold text-purple-600 dark:text-purple-400">{zkStatus?.proof_count || 0}</p>
                    </div>
                    <span className="inline-flex items-center rounded-md bg-purple-50 dark:bg-purple-900/30 px-2 py-1 text-xs font-medium text-purple-700 dark:text-purple-400 ring-1 ring-inset ring-purple-600/20 dark:ring-purple-500/20">
                      Pedersen Commitment v1
                    </span>
                  </div>
                </div>
                <div className="p-6">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Federated Samples Validated</p>
                      <p className="mt-1 text-3xl font-semibold text-cyan-600 dark:text-cyan-400">{fedStatus?.client_samples || 0}</p>
                    </div>
                    <span className="inline-flex items-center rounded-md bg-cyan-50 dark:bg-cyan-900/30 px-2 py-1 text-xs font-medium text-cyan-700 dark:text-cyan-400 ring-1 ring-inset ring-cyan-600/20 dark:ring-cyan-500/20">
                      FedAvg Ready
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden transition-colors">
                <div className="px-4 py-5 border-b border-slate-200 dark:border-slate-700 sm:px-6 bg-slate-50 dark:bg-slate-800/50">
                  <h3 className="text-base font-semibold leading-6 text-slate-900 dark:text-white">Model Attestation</h3>
                </div>
                <div className="p-4">
                  <ul className="divide-y divide-slate-100 dark:divide-slate-700/50">
                    {attestation?.models ? Object.entries(attestation.models).map(([name, info]) => (
                      <li key={name} className="flex items-center justify-between py-3">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{name}</span>
                          <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">SHA256 verified</span>
                        </div>
                        <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                          info.status === "OK" ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-900/30 dark:text-emerald-400 dark:ring-emerald-500/20" : "bg-red-50 text-red-700 ring-red-600/10 dark:bg-red-900/30 dark:text-red-400 dark:ring-red-500/20"
                        }`}>
                          {info.status}
                        </span>
                      </li>
                    )) : (
                      <p className="text-sm text-slate-500 dark:text-slate-400 py-2">Loading attestation signatures...</p>
                    )}
                  </ul>
                </div>
              </div>
            </div>

          </div>
        )}

      </main>
      
      {/* Hidden Canvas for Edge Inference Capture */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

export default App;