import React, { useEffect, useState } from 'react';

export default function Git() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/git');
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setItems([]);
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
      await fetch('/api/git', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, repo })
      });
      load();
    } catch (e) {
      console.error(e);
    }
  };

  const deleteItem = async (id) => {
    if (!window.confirm('Delete this entry?')) return;
    try {
      const res = await fetch(`/api/git/${id}`, { method: 'DELETE' });
      if (res.status === 204) load();
      else console.error('Failed to delete', await res.json().catch(() => ({})));
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Git entries</h2>
        <button onClick={addItem}>Add</button>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr><th>Username</th><th>Repo</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {items.map(it => (
              <tr key={it._id || it.seq}>
                <td>{it.username}</td>
                <td>{it.repo}</td>
                <td>
                  <button onClick={() => deleteItem(it._id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
