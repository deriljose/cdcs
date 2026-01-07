import React, { useState, useEffect } from "react";
import "./Employees.css";

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
        setError("Server likely not running");
      } finally {
        setLoading(false);
      }
    };

    fetchFlagged();
  }, []);

  return (
    <div className="p-10 flex-1">
      <h1 className="text-4xl font-bold mb-2">Flagged Packages</h1>
      <p className="text-gray-500 mb-6">Reports of unauthorized packages from clients</p>

      <div className="bg-white shadow rounded-xl p-6 w-full overflow-x-auto">
        {loading && <p className="text-gray-700">Loading flagged reports...</p>}
        {error && <p className="text-red-600">Error: {error}</p>}
        {!loading && !error && (
          <table className="employees-table">
            <thead>
              <tr>
                <th scope="col">Timestamp</th>
                <th scope="col">Username</th>
                <th scope="col">MAC Address</th>
                <th scope="col">New Packages</th>
                <th scope="col">ID</th>
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
                  <td>{String(it._id)}</td>
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
