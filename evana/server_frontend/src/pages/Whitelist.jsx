import React, { useState, useEffect } from "react";
import "./Whitelist.css";

const Whitelist = () => {
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newPackageName, setNewPackageName] = useState("");

  useEffect(() => {
    const fetchPackages = async () => {
      try {
        const response = await fetch("/api/packages");
        const data = await response.json();
        setPackages(data);
      } catch (e) {
        setError("Server likely not running");
      } finally {
        setLoading(false);
      }
    };

    fetchPackages();
  }, []);

  const handleAddPackage = async (e) => {
    e.preventDefault();

    // Trim whitespace
    const trimmedName = newPackageName.trim();

    if (!trimmedName) {
      setError("Package name cannot be empty.");
      return;
    }

    try {
      const response = await fetch("/api/packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName }),
      });

      const newPackage = await response.json();
      setPackages([newPackage, ...packages]); // Add to top of the list
      setNewPackageName(""); // Clear input
      setError(null); // Clear previous errors
    } catch (err) {
      setError("Failed to add package");
    }
  };

  const handleDeletePackage = async (packageId) => {
    if (!window.confirm("Are you sure you want to delete this package?")) {
      return;
    }
    
    const response = await fetch(`/api/packages/${packageId}`, {
      method: "DELETE",
    });

    if (response.status !== 204) { // 204 No Content on success
      setError("Failed to delete package");
    }

    setPackages(packages.filter((pkg) => pkg._id !== packageId));
  };

  return (
    <div className="whitelist-container">
      <h1>Whitelist</h1>
      <p className="page-description">
        Packages allowed for download
      </p>

      <div className="form-card">
        <h3>Add a new package</h3>
        <form onSubmit={handleAddPackage} className="add-package-form">
          <input
            type="text"
            value={newPackageName}
            onChange={(e) => setNewPackageName(e.target.value)}
            placeholder="Enter package name"
            className="package-input"
            required
          />
          <button
            type="submit"
            className="add-package-btn"
            disabled={!newPackageName.trim()}
          >
            Add
          </button>
        </form>
      </div>

      <div className="list-card">
        {loading && <p className="loading-message">Loading packages...</p>}
        {error && <p className="error-message">Error: {error}</p>}
        {!loading && !error && (
          <table className="packages-table">
            <tbody>
              {packages.map((pkg) => (
                <tr key={pkg._id}>
                  <td className="package-name-cell">{pkg.name}</td>
                  <td className="actions-cell">
                    <button onClick={() => handleDeletePackage(pkg._id)} className="delete-btn">
                      Delete
                    </button>
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

export default Whitelist;
