import React, { useState, useEffect } from "react";
import "./styles.css";

const Logs = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const response = await fetch("/api/logs");
        const data = await response.json();
        // sort newest first
        const sorted =
          Array.isArray(data) &&
          data.slice().sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
        setLogs(sorted);
      } catch (e) {
        setError("Server likely not running or CORS issue");
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
  }, []);

    return (
      <div className="whitelist-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 className="page-title">Logs</h1>
          <p className="page-subtitle">Logs of client heartbeats and check-ins.</p>
        </div>
      </div>

      {loading && <p className="loading-message">Loading logs...</p>}
      {error && <p className="error">Error: {error}</p>}
      <div className="table-container">
        {!loading && !error && (
          <table className="packages-table">
            <thead>
              <tr>
                <th scope="col">Timestamp</th>
                <th scope="col">Username</th>
                <th scope="col">MAC Address</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log._id}>
                  <td>{log.timestamp ? new Date(log.timestamp).toLocaleString() : "-"}</td>
                  <td>{log.username || "-"}</td>
                  <td>{log.mac_address || log.macAddress || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default Logs;
