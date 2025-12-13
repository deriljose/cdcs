// src/App.jsx
import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Sidebar from "./components/Sidebar";

// Import the pages
import SupportTicket from "./pages/SupportTicket";
import Employees from "./pages/Employees";
import Whitelist from "./pages/Whitelist";
import Alerts from "./pages/Alerts";


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
            <Route path="/" element={<Employees />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/raise-ticket" element={<SupportTicket />} />
            <Route path="/whitelist" element={<Whitelist />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
};

export default App;