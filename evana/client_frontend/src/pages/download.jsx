import React, { useEffect, useState } from 'react';
import { HardDriveDownload } from 'lucide-react';
import "./download.css";

const DownloadPage = () => {
    const [packages, setPackages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [installing, setInstalling] = useState({});
    const [currentInstalling, setCurrentInstalling] = useState(null);
    const [error, setError] = useState(null);

    // Configure API URL and API KEY via Vite env vars.
    const API_URL = import.meta.env.VITE_API_URL || "";
    const API_KEY = import.meta.env.VITE_API_KEY || "";

    useEffect(() => {
        const fetchPackages = async () => {
            try {
                setLoading(true);
                setError(null);

                // Fetch packages from server
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

                // Client agent base (running on same device as frontend)
                const clientAgentBase = `http://localhost:4001`;
                const agentEndpoint = `${clientAgentBase}/api/available-packages`;

                try {
                    const agentRes = await fetch(agentEndpoint);
                    if (!agentRes.ok) {
                        const body = await agentRes.text().catch(() => "");
                        console.warn(`Agent responded ${agentRes.status}: ${body || agentRes.statusText}`);
                        setPackages(serverPkgs); // fallback
                    } else {
                        const agentData = await agentRes.json();
                        const availableNames = new Set((agentData.packages || []).filter(Boolean));
                        const filtered = serverPkgs.filter(p => p && p.name && availableNames.has(p.name));
                        setPackages(filtered);
                    }
                } catch (agentErr) {
                    console.warn('Failed to contact client agent for available packages:', agentErr);
                    setPackages(serverPkgs); // fallback
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

    const installPackage = async (pkg) => {
        if (currentInstalling && currentInstalling !== pkg.name) {
            window.alert(`Currently installing ${currentInstalling}`);
            return;
        }

        if (currentInstalling && currentInstalling === pkg.name && installing[pkg.name]) {
            window.alert(`Currently installing ${currentInstalling}`);
            return;
        }

        if (installing[pkg.name]) return;

        setInstalling(prev => ({ ...prev, [pkg.name]: true }));
        setCurrentInstalling(pkg.name);
        setError(null);

        const clientAgentBase = `http://localhost:4001`;
        const installEndpoint = `${clientAgentBase}/api/install`;

        try {
            const headers = { "Content-Type": "application/json" };
            const res = await fetch(installEndpoint, {
                method: "POST",
                headers,
                body: JSON.stringify({ packageName: pkg.name }),
            });

            if (!res.ok) {
                if (res.status === 409) {
                    window.alert(currentInstalling ? `Currently installing ${currentInstalling}` : `Another installation is in progress`);
                    return;
                }
                const body = await res.text().catch(() => "");
                throw new Error(`Error ${res.status} from ${installEndpoint}: ${body || res.statusText}`);
            }

            await res.json().catch(() => ({}));
            window.alert(`Completed installing ${pkg.name}`);
            window.location.reload();
        } catch (e) {
            setError(`Failed to send installation request: ${e.message}`);
        } finally {
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
