import React, { useState, useEffect } from "react";
import "./Whitelist.css"; // Import the component-specific CSS file

const Whitelist = () => {
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newPackageName, setNewPackageName] = useState("");

  useEffect(() => {
    const fetchPackages = async () => {
      try {
        // Fetch data from the new public /api/packages endpoint
        const response = await fetch("/api/packages");
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMessage =
            errorData.detail ||
            errorData.error ||
            `HTTP error! Status: ${response.status}`;
          throw new Error(errorMessage);
        }
        const data = await response.json();
        setPackages(data);
      } catch (e) {
        setError(e.message);
        console.error("Failed to fetch packages:", e);
      } finally {
        setLoading(false);
      }
    };

    fetchPackages();
  }, []);

  const handleAddPackage = async (e) => {
    e.preventDefault();
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
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to add package");
      }
      const newPackage = await response.json();
      setPackages([newPackage, ...packages]); // Add to top of the list
      setNewPackageName(""); // Clear input
      setError(null); // Clear previous errors
    } catch (err) {
      setError(err.message);
      console.error("Failed to add package:", err);
    }
  };

  const handleDeletePackage = async (packageId) => {
    if (!window.confirm("Are you sure you want to delete this package?")) {
      return;
    }
    try {
      const response = await fetch(`/api/packages/${packageId}`, {
        method: "DELETE",
      });
      if (response.status !== 204) { // 204 No Content on success
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete package");
      }
      setPackages(packages.filter((pkg) => pkg._id !== packageId));
    } catch (err) {
      setError(err.message);
      console.error("Failed to delete package:", err);
    }
  };

  return (
    <div className="whitelist-container">
      <h1>Whitelisted Packages</h1>
      <p className="page-description">
        A list of approved software packages for installation.
      </p>

      <div className="form-card">
        <h3>Add New Package</h3>
        <form onSubmit={handleAddPackage} className="add-package-form">
          <input
            type="text"
            value={newPackageName}
            onChange={(e) => setNewPackageName(e.target.value)}
            placeholder="Enter package name (e.g., vlc.exe)"
            className="package-input"
            required
          />
          <button
            type="submit"
            className="add-package-btn"
            disabled={!newPackageName.trim()}
          >
            Add Package
          </button>
        </form>
      </div>

      <div className="list-card">
        {loading && <p className="loading-message">Loading packages...</p>}
        {error && <p className="error-message">Error: {error}</p>}
        {!loading && !error && (
          <table className="packages-table">
            <thead>
              <tr>
                <th scope="col">Package Name</th>
                <th scope="col" className="actions-header">Actions</th>
              </tr>
            </thead>
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
