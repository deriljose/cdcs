import React, { useState, useEffect } from "react";
import "./styles.css";

const Flagged = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchFlagged = async () => {
      try {
        const response = await fetch("/api/flagged");
        const data = await response.json();
        // sort newest first
        const sorted = Array.isArray(data)
          ? data.slice().sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
          : data;
        setItems(sorted);
      } catch (e) {
        setError("Server likely not running or CORS issue");
      } finally {
        setLoading(false);
      }
    };

    fetchFlagged();
  }, []);

    return (
        <div className="whitelist-container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h1 className="page-title">Flagged</h1>
            <p className="page-subtitle">Reports of unauthorized packages from clients.</p>
          </div>
      </div>

      {loading && <p className="loading-message">Loading flagged reports...</p>}
      {error && <p className="error">Error: {error}</p>}
      
      <div className="table-container">
        {!loading && !error && (
          <table className="packages-table">
            <thead>
              <tr>
                <th scope="col">Timestamp</th>
                <th scope="col">Username</th>
                <th scope="col">MAC Address</th>
                <th scope="col">Package Names</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it._id}>
                  <td>{it.timestamp ? new Date(it.timestamp).toLocaleString() : "-"}</td>
                  <td>{it.username || "-"}</td>
                  <td>{it.mac_address || it.macAddress || "-"}</td>
                  <td>
                    {Array.isArray(it.new_packages)
                      ? it.new_packages.join(", ")
                      : (it.new_packages || "-")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default Flagged;
