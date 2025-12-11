import React, { useEffect, useState } from 'react';
import { HardDriveDownload } from 'lucide-react';
import "./download.css";

const DownloadPage = () => {
    const [packages, setPackages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [installing, setInstalling] = useState({});
    const [error, setError] = useState(null);

    // Configure API URL and API KEY via Vite env vars.
    const API_URL = import.meta.env.VITE_API_URL || "";
    const API_KEY = import.meta.env.VITE_API_KEY || "";

    useEffect(() => {
        const fetchPackages = async () => {
            try {
                setLoading(true);
                setError(null);

                const candidates = ["/api/packages"];
                let lastErr = null;
                let lastEndpoint = null;
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
                        const data = await res.json();
                        setPackages(data);
                        return;
                    } catch (fetchErr) {
                        lastErr = fetchErr.message || String(fetchErr);
                        console.warn(`Fetch failed for ${endpoint}:`, fetchErr);
                    }
                }

                throw new Error(`All endpoints failed. Last endpoint tried: ${lastEndpoint}. Last error: ${lastErr}`);
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
        // Prevent re-clicking while an installation is in progress for this package
        if (installing[pkg.name]) {
            return;
        }
        setInstalling(prev => ({ ...prev, [pkg.name]: true }));
        setError(null); // Clear previous errors before a new attempt

        // Determine client agent base URL:
        // If VITE_API_URL points to server (e.g. https://HOST:3000), assume client agent runs on same host but port 4001.
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
                const body = await res.text().catch(() => "");
                throw new Error(`Error ${res.status} from ${installEndpoint}: ${body || res.statusText}`);
            }

            const body = await res.json().catch(() => ({}));
            // Install is executed by the client agent; agent will send a log to the central server after completion.
            alert(body.message || `Installation request for '${pkg.name}' accepted by client agent.`);
        } catch (e) {
            setError(`Failed to send installation request: ${e.message}`);
        } finally {
            setInstalling(prev => ({ ...prev, [pkg.name]: false }));
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
                                <th>Install on Client</th>
                            </tr>
                        </thead>
                        <tbody>
                            {packages.map((pkg) => (
                                <tr key={pkg._id || pkg.id || pkg.file || pkg.name}>
                                    <td>{pkg.name}</td>
                                    <td className="action-cell">
                                        <button className="request-button install-button" onClick={() => installPackage(pkg)} disabled={installing[pkg.name]}>
                                            <HardDriveDownload />
                                            {installing[pkg.name] ? 'Installing...' : 'Install on Client'}
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