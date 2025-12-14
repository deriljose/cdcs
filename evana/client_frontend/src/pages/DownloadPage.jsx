import React, { useEffect, useState } from 'react';
// Import download icon for install button
import { HardDriveDownload } from 'lucide-react';
import "./styles.css";

const DownloadPage = () => {
    // List of packages to display
    const [packages, setPackages] = useState([]);
    // Flag to manage loading state
    const [loading, setLoading] = useState(true);
    // Track which package is being installed
    const [installing, setInstalling] = useState(null);
    // Error state to handle issues
    const [error, setError] = useState(null);

    const API_URL = import.meta.env.VITE_API_URL;
    const API_KEY = import.meta.env.VITE_API_KEY;

    useEffect(() => {
        const fetchPackages = async () => {
            try {
                setLoading(true);
                setError(null);

                // Fetch packages from the server endpoint
                const endpoint = "/api/packages";
                let serverData = null;

                const headers = { Accept: "application/json" };
                if (API_KEY) {
                    headers.Authorization = `Bearer ${API_KEY}`;
                    headers["X-API-Key"] = API_KEY;
                }
                const res = await fetch(endpoint, { headers });

                serverData = await res.json();

                // Localhost because client runs on same device as frontend
                const clientAgentBase = `http://localhost:4001`;
                const agentEndpoint = `${clientAgentBase}/api/available-packages`;

                // Fetch list of available packages on the user's device
                try {
                    const agentRes = await fetch(agentEndpoint);
                    const agentData = await agentRes.json();
                    const availableNames = new Set((agentData.packages));
                    // Check if package exists on client
                    const filtered = serverData.filter(p => p && p.name && availableNames.has(p.name));
                    setPackages(filtered);
                } catch (agentErr) {
                    setError("Client likely not running or CORS issue");
                }
            } catch (e) {
                setError("Server likely not running or incorrect API key");
            } finally {
                setLoading(false);
            }
        };

        fetchPackages();
    }, [API_URL, API_KEY]);

    const installPackage = async (pkg) => {
        // Prevent starting installation if another package is being installed
        if (installing) {
            window.alert(`Currently installing ${installing}`);
            return;
        }

        // Mark the package as being installed
        setInstalling(pkg.name);
        setError(null);

        // Localhost because client runs on same device as frontend
        const clientAgentBase = `http://localhost:4001`;
        const installEndpoint = `${clientAgentBase}/api/install`;

        try {
            const headers = { "Content-Type": "application/json" };
            const res = await fetch(installEndpoint, {
                method: "POST",
                headers,
                body: JSON.stringify({ packageName: pkg.name }),
            });

            await res.json().catch(() => ({}));
            window.alert(`Completed installing ${pkg.name}`);
            window.location.reload();
        } catch (e) {
            setError(`Failed to send installation request: ${e.message}`);
        } finally {
            setInstalling(null);
        }
    };

    return (
        <div className="download-page">
            <h1 className="page-title">Downloads</h1>
            <p className="page-subtitle">Packages available for download</p>

            {loading && <p>Loading packages…</p>}
            {error && <p className="error">Error: {error}</p>}

            {!loading && !error && (
                <div className="table-container">
                    <table className="packages-table">
                        <tbody>
                            {packages.map((pkg) => (
                                <tr key={pkg._id || pkg.id || pkg.file || pkg.name}>
                                    <td>{pkg.name}</td>
                                    <td className="action-cell">
                                        <button className="request-button install-button" onClick={() => installPackage(pkg)} disabled={installing === pkg.name}>
                                            <HardDriveDownload />
                                            {installing === pkg.name ? 'Installing...' : 'Install'}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default DownloadPage;
