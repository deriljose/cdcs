import React, { useState, useEffect } from "react";
import "./Employees.css";

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
        setError("Server likely not running");
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
  }, []);

  return (
    <div className="p-10 flex-1">
      <h1 className="text-4xl font-bold mb-2">Client Logs</h1>
      <p className="text-gray-500 mb-6">Heartbeats and client check-ins</p>

      <div className="bg-white shadow rounded-xl p-6 w-full overflow-x-auto">
        {loading && <p className="text-gray-700">Loading logs...</p>}
        {error && <p className="text-red-600">Error: {error}</p>}
        {!loading && !error && (
          <table className="employees-table">
            <thead>
              <tr>
                <th scope="col">Timestamp</th>
                <th scope="col">Username</th>
                <th scope="col">MAC Address</th>
                <th scope="col">ID</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log._id}>
                  <td>{log.timestamp ? new Date(log.timestamp).toLocaleString() : "-"}</td>
                  <td>{log.username || "-"}</td>
                  <td>{log.mac_address || log.macAddress || "-"}</td>
                  <td>{String(log._id)}</td>
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
