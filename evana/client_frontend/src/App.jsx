import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Sidebar from "./components/Sidebar";

import DownloadPage from "./pages/DownloadPage";
import Tickets from "./pages/Tickets";
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
            <Route path="/tickets" element={<Tickets />} />
            <Route path="/git" element={<GitPage />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
};

export default App;