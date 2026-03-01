import React, { useEffect, useState } from "react";
import "./styles.css";

export default function GitPage() {
  const [repos, setRepos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await fetch("http://localhost:4001/api/git");
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const items = await res.json();
        const repoNames = Array.isArray(items) ? items.map(it => it.repo).filter(Boolean) : [];
        if (mounted) {
          setRepos(repoNames);
          setError(null);
        }
      } catch (e) {
        if (mounted) setError(e.message || "Failed to load repos");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, []);

  return (
    <div className="p-10 flex-1">
      <h1 className="text-4xl font-bold mb-2">Git Repositories</h1>
      <p className="text-gray-500 mb-6">Repositories from the central server</p>

      <div className="bg-white shadow rounded-xl p-4">
        {loading && <p className="text-gray-700">Loading...</p>}
        {error && <p className="text-red-600">Error: {error}</p>}
        {!loading && !error && (
          repos.length ? (
            <ul>
              {repos.map((r, i) => <li key={i} className="py-2 border-b">{r}</li>)}
            </ul>
          ) : (
            <p className="text-gray-500">No repositories found.</p>
          )
        )}
      </div>
    </div>
  );
}
