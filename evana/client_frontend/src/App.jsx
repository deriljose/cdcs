// src/App.jsx
import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Sidebar from "./components/Sidebar";

// Import the pages
import DownloadPage from "./pages/download";
import RaiseTicket from "./pages/RaiseTicket";
import GitPage from "./pages/GitPage";

// 1. IMPORT THE CSS FILE
import "./pages/App.css"; 

const App = () => {
  return (
    <Router>
      {/* 2. USE THE CORRECT CLASS FOR THE MAIN CONTAINER */}
      <div className="app-container">
        <Sidebar />
        
        {/* 3. WRAP YOUR ROUTES IN THE CONTENT CONTAINER */}
        <div className="main-content">
          <Routes>
            <Route path="/" element={<DownloadPage />} />
            <Route path="/raise-ticket" element={<RaiseTicket />} />
            <Route path="/git" element={<GitPage />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
};

export default App;