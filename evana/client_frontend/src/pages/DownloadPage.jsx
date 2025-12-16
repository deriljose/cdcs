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

    useEffect(() => {
        const fetchPackages = async () => {
            try {
                setLoading(true);
                setError(null);

                // Localhost because client runs on same device as frontend
                const clientAgentBase = `http://localhost:4001`;
                const agentEndpoint = `${clientAgentBase}/api/available-packages`;

                // Fetch list of available packages from the client agent.
                // The agent is responsible for getting the master list and filtering
                // out packages that are already installed.
                const agentRes = await fetch(agentEndpoint);
                if (!agentRes.ok) {
                    const errorText = await agentRes.text();
                    throw new Error(`Client agent responded with status ${agentRes.status}: ${errorText}`);
                }
                const agentData = await agentRes.json();

                // The agent now returns the full package objects that are available for download
                setPackages(agentData.packages || []);
            } catch (err) {
                setError(err.message || "Client likely not running or CORS issue. Please ensure the client service is active.");
            } finally {
                setLoading(false);
            }
        };

        fetchPackages();
    }, []);

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
