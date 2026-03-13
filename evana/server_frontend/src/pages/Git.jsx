import React, { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import './styles.css';

export default function Git() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      setError(null);
      const res = await fetch('/api/git');
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setItems([]);
      setError('Server likely not running or CORS issue');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const addItem = async () => {
    const username = window.prompt('Username:');
    if (!username) return;
    const repo = window.prompt('Repo name:');
    if (!repo) return;
    try {
      const res = await fetch('/api/git', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, repo })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to add entry');
      }
      load();
    } catch (e) {
      console.error(e);
      window.alert(e.message || 'Failed to add entry');
    }
  };

  const deleteItem = async (id) => {
    if (!window.confirm('Delete this entry?')) return;
    try {
      const res = await fetch(`/api/git/${id}`, { method: 'DELETE' });
      if (res.status === 204) load();
      else {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete entry');
      }
    } catch (e) {
      console.error(e);
      window.alert(e.message || 'Failed to delete entry');
    }
  };

  return (
    <div className="whitelist-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 className="page-title">Git</h1>
          <p className="page-subtitle">Repositories employees have access to.</p>
        </div>
        <button onClick={addItem} className="request-button">
          <Plus size={16} />
          Add
        </button>
      </div>

      {loading && <p className="loading-message">Loading repositories...</p>}
      {error && <p className="error">Error: {error}</p>}

      <div className="table-container">
        {!loading && !error && (
          <table className="packages-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Repository</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map(it => (
                <tr key={it._id || it.seq}>
                  <td>{it.username}</td>
                  <td>{it.repo}</td>
                  <td className="actions-cell">
                    <button onClick={() => deleteItem(it._id)} className="delete-btn">
                      <Trash2 size={16} />
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
}
