// src/pages/download.jsx
import React, { useEffect, useState } from 'react';
import { HardDriveDownload } from 'lucide-react';
import "./download.css";

const DownloadPage = () => {
	const [packages, setPackages] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);

	// Configure API URL and API KEY via Vite env vars.
	// default to relative endpoint so no .env changes are required:
	const API_URL = import.meta.env.VITE_API_URL || "";
	const API_KEY = import.meta.env.VITE_API_KEY || "";

	useEffect(() => {
		const fetchPackages = async () => {
			try {
				setLoading(true);
				setError(null); // Clear previous errors

				// With the Vite proxy configured, we can just use a relative path.
				// Vite's dev server will forward requests starting with `/api` to the backend.
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

						// record 404 body for debugging and try next candidate
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
						// continue to next endpoint
					}
				}

				// If we reach here, all endpoints failed.
				throw new Error(`All endpoints failed. Last endpoint tried: ${lastEndpoint}. Last error: ${lastErr}`);
			} catch (e) {
				// Provide helpful message in UI with exact endpoint and likely causes.
				const help = [
					"Likely causes:",
					"• server.js is not running or not listening on the expected host/port",
					"• server.js exposes a different route (check for /packages vs /api/packages)",
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
		const base = API_URL ? API_URL.replace(/\/+$/, "") : "";
		const installEndpoint = `${base}/api/install-package`;

		try {
			const headers = { "Content-Type": "application/json" };
			if (API_KEY) {
				headers.Authorization = `Bearer ${API_KEY}`;
				headers["X-API-Key"] = API_KEY;
			}

			const res = await fetch(installEndpoint, {
				method: "POST",
				headers,
				body: JSON.stringify({ packageName: pkg.name }),
			});

			if (!res.ok) {
				const body = await res.text().catch(() => "");
				throw new Error(`Error ${res.status} from ${installEndpoint}: ${body || res.statusText}`);
			}

			alert(`Installation request for '${pkg.name}' sent successfully! The next client to check in will attempt to install it.`);
		} catch (e) {
			setError(`Failed to send installation request: ${e.message}`);
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
										<button className="request-button install-button" onClick={() => installPackage(pkg)}>
											<HardDriveDownload />
											Install on Client
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