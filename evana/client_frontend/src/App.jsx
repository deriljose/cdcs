import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Sidebar from "./components/Sidebar";

import DownloadPage from "./pages/DownloadPage";
import RaiseTicket from "./pages/RaiseTicket";
import GitPage from "./pages/GitPage";

import "./pages/App.css"; 

const App = () => {
  return (
    <Router>
      <div className="app-container">
        <Sidebar />
        
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