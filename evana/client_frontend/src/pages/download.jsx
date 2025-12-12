import React, { useEffect, useState } from 'react';
import { HardDriveDownload } from 'lucide-react';
import "./download.css";

const DownloadPage = () => {
    const [packages, setPackages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [installing, setInstalling] = useState({});
    const [currentInstalling, setCurrentInstalling] = useState(null); // <-- new
    const [error, setError] = useState(null);

    // Configure API URL and API KEY via Vite env vars.
    const API_URL = import.meta.env.VITE_API_URL || "";
    const API_KEY = import.meta.env.VITE_API_KEY || "";

    useEffect(() => {
        const fetchPackages = async () => {
            try {
                setLoading(true);
                setError(null);

                // 1) Fetch packages from server as before
                const candidates = ["/api/packages"];
                let lastErr = null;
                let lastEndpoint = null;
                let serverData = null;

                for (const endpoint of candidates) {
                    try {
                        lastEndpoint = endpoint;
                        console.info("Trying packages endpoint:", endpoint);
                        const headers = { Accept: "application/json" };
                        if (API_KEY) {
                            headers.Authorization = `Bearer ${API_KEY}`;
                            headers["X-API-Key"] = API_KEY;
                        }
                        const res = await fetch(endpoint, { headers });

                        if (res.status === 404) {
                            const body = await res.text().catch(() => "");
                            lastErr = `404 from ${endpoint} (${body || res.statusText})`;
                            console.warn(lastErr);
                            continue;
                        }
                        if (!res.ok) {
                            const body = await res.text().catch(() => "");
                            throw new Error(`Error ${res.status} from ${endpoint}: ${body || res.statusText}`);
                        }
                        serverData = await res.json();
                        break;
                    } catch (fetchErr) {
                        lastErr = fetchErr.message || String(fetchErr);
                        console.warn(`Fetch failed for ${endpoint}:`, fetchErr);
                    }
                }

                if (!serverData) {
                    throw new Error(`All endpoints failed. Last endpoint tried: ${lastEndpoint}. Last error: ${lastErr}`);
                }

                // Normalize server packages into array of objects with .name
                let serverPkgs = Array.isArray(serverData) ? serverData : (serverData.packages || []);
                if (serverPkgs.length && typeof serverPkgs[0] === "string") {
                    serverPkgs = serverPkgs.map(n => ({ name: n }));
                }

                // 2) Determine client agent base (same logic used elsewhere)
                let hostname = window.location.hostname;
                let protocol = window.location.protocol;
                if (API_URL) {
                    try {
                        const url = new URL(API_URL);
                        hostname = url.hostname;
                        protocol = url.protocol;
                    } catch (e) {
                        console.warn("Invalid API_URL, using window.location");
                    }
                }
                const clientAgentBase = `${protocol}//${hostname}:4001`;
                const agentEndpoint = `${clientAgentBase}/api/available-packages`;

                // 3) Query agent for approved-but-not-installed package names and filter server list
                try {
                    const agentRes = await fetch(agentEndpoint);
                    if (!agentRes.ok) {
                        const body = await agentRes.text().catch(() => "");
                        console.warn(`Agent responded ${agentRes.status}: ${body || agentRes.statusText}`);
                        // Fallback: show server packages (best-effort) if agent unreachable
                        setPackages(serverPkgs);
                    } else {
                        const agentData = await agentRes.json();
                        const availableNames = new Set((agentData.packages || []).filter(Boolean));
                        const filtered = serverPkgs.filter(p => p && p.name && availableNames.has(p.name));
                        setPackages(filtered);
                    }
                } catch (agentErr) {
                    console.warn('Failed to contact client agent for available packages:', agentErr);
                    // Fallback: show server packages (best-effort) if agent unreachable
                    setPackages(serverPkgs);
                }
            } catch (e) {
                const help = [
                    "Likely causes:",
                    "• server.js is not running or not listening on the expected host/port",
                    "• CORS or proxy prevents access when server is on different origin/port",
                    "• server requires auth and returned 401/403 (inspect network tab).",
                ].join(" ");
                setError(`${e.message}. ${help}`);
            } finally {
                setLoading(false);
            }
        };

        fetchPackages();
    }, [API_URL, API_KEY]);

    // New flow: send install request directly to the client agent
    const installPackage = async (pkg) => {
        // If another package is being installed, inform user and do not change view
        if (currentInstalling && currentInstalling !== pkg.name) {
            // Show a simple alert instead of modifying the React view
            window.alert(`Currently installing ${currentInstalling}`);
            return;
        }

        // If this package is already being installed and user clicks again, inform them
        if (currentInstalling && currentInstalling === pkg.name && installing[pkg.name]) {
            window.alert(`Currently installing ${currentInstalling}`);
            return;
        }

        // Prevent duplicate requests for the same package while it's being installed
        if (installing[pkg.name]) {
            return;
        }

        // Mark as installing and set currentInstalling (no alert on first click)
        setInstalling(prev => ({ ...prev, [pkg.name]: true }));
        setCurrentInstalling(pkg.name);
        setError(null); // Clear previous errors before a new attempt

        // Determine client agent base:
        let clientAgentBase = "";
        let hostname = window.location.hostname;
        let protocol = window.location.protocol;

        if (API_URL) {
            try {
                const url = new URL(API_URL);
                hostname = url.hostname;
                protocol = url.protocol;
            } catch (e) {
                console.warn("Invalid API_URL, using window.location");
            }
        }

        // Force port 4001
        clientAgentBase = `${protocol}//${hostname}:4001`;

        const installEndpoint = `${clientAgentBase}/api/install`;

        try {
            const headers = { "Content-Type": "application/json" };

            const res = await fetch(installEndpoint, {
                method: "POST",
                headers,
                body: JSON.stringify({ packageName: pkg.name }),
            });

            if (!res.ok) {
                // Handle concurrent-install conflict specially: show alert and do not set error view
                if (res.status === 409) {
                    // Server indicates another install is running
                    window.alert(currentInstalling ? `Currently installing ${currentInstalling}` : `Another installation is in progress`);
                    return;
                }
                const body = await res.text().catch(() => "");
                throw new Error(`Error ${res.status} from ${installEndpoint}: ${body || res.statusText}`);
            }

            const body = await res.json().catch(() => ({}));
            // Show explicit completed message with package name, then refresh
            window.alert(`Completed installing ${pkg.name}`);
            window.location.reload();
        } catch (e) {
            setError(`Failed to send installation request: ${e.message}`);
        } finally {
            // Clear installing flags (if page reloads on success this is redundant; kept for failure paths)
            setInstalling(prev => ({ ...prev, [pkg.name]: false }));
            setCurrentInstalling(null);
        }
    };

    return (
        <div className="download-page">
            <h1 className="page-title">Download Software</h1>
            <p className="page-subtitle">Download available software packages from the server</p>

            {loading && <p>Loading packages…</p>}
            {error && <p className="error">Error: {error}</p>}

            {!loading && !error && (
                <div className="table-container">
                    <table className="packages-table">
                        <thead>
                            <tr>
                                <th>Package Name</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {packages.map((pkg) => (
                                <tr key={pkg._id || pkg.id || pkg.file || pkg.name}>
                                    <td>{pkg.name}</td>
                                    <td className="action-cell">
                                        <button className="request-button install-button" onClick={() => installPackage(pkg)} disabled={installing[pkg.name]}>
                                            <HardDriveDownload />
                                            {installing[pkg.name] ? 'Installing...' : 'Install'}
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