import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Sidebar from "./components/Sidebar";

import SupportTickets from "./pages/SupportTickets";
import Employees from "./pages/Employees";
import Whitelist from "./pages/Whitelist";
import Alerts from "./pages/Alerts";
import Logs from "./pages/Logs";
import Flagged from "./pages/Flagged";

import "./pages/App.css"; 

const App = () => {
  return (
    <Router>
      <div className="app-container">
        <Sidebar />
        
        <div className="main-content">
          <Routes>
            <Route path="/" element={<Employees />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/support-tickets" element={<SupportTickets />} />
            <Route path="/whitelist" element={<Whitelist />} />
            <Route path="/flagged" element={<Flagged />} />
            <Route path="/logs" element={<Logs />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
};

export default App;