import React, { useState } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Sidebar from "./components/Sidebar";

import Tickets from "./pages/Tickets";
import Employees from "./pages/Employees";
import Whitelist from "./pages/Whitelist";
import Git from "./pages/Git";
import Logs from "./pages/Logs";
import Flagged from "./pages/Flagged";

import "./pages/App.css";

const API_BASE = 'http://localhost:3000';

const App = () => {
  const [token, setToken] = useState(sessionStorage.getItem('auth_token'));
  const [role, setRole] = useState(sessionStorage.getItem('user_role'));
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok) {
        setToken(data.token);
        setRole(data.role);
        sessionStorage.setItem('auth_token', data.token);
        sessionStorage.setItem('user_role', data.role);
        setError(null);
      } else {
        setError(data.error || 'Login failed');
      }
    } catch (err) {
      setError('Failed to connect to server');
    }
  };

  if (!token) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '98vh', flexDirection: 'column', fontFamily: 'sans-serif' }}>
        <h1 style={{ fontSize: '2.25rem', color: '#4f46e5' }}>Dashboard Login</h1>
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', width: '300px', gap: '10px' }}>
          <input 
            type="text" 
            placeholder="Username" 
            value={username} 
            onChange={e => setUsername(e.target.value)} 
            style={{ padding: '8px', borderRadius: '0px', border: '1px solid #d1d5db' }}
          />
          <input 
            type="password" 
            placeholder="Password" 
            value={password} 
            onChange={e => setPassword(e.target.value)} 
            style={{ padding: '8px', borderRadius: '0px', border: '1px solid #d1d5db' }}
          />
          <button type="submit" style={{ padding: '10px', cursor: 'pointer', borderRadius: '0px', border: 'none', color: '#ffffff', backgroundColor: '#4f46e5' }}>Login</button>
        </form>
        {error && <p style={{ color: 'red', marginTop: '20px' }}>{error}</p>}
      </div>
    );
  }

  return (
    <Router>
      <div className="app-container">
        <Sidebar role={role} />
        
        <div className="main-content">
          <Routes>
            <Route path="/" element={<Employees role={role} />} />
            {/* serve Git UI at both paths so old links keep working */}
            <Route path="/alerts" element={<Git />} />
            <Route path="/git" element={<Git />} />
            <Route path="/tickets" element={<Tickets />} />
            <Route path="/whitelist" element={<Whitelist role={role} />} />
            <Route path="/flagged" element={<Flagged />} />
            <Route path="/logs" element={<Logs />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
};

export default App;