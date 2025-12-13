// src/components/Sidebar.jsx
import React from "react";
import { NavLink } from "react-router-dom";
import {
  MessageSquare,
  Users,
  CheckSquare,
  AlertTriangle,
} from "lucide-react";

// Import the component-specific CSS file
import "./Sidebar.css";

const Sidebar = () => {
  // This function is passed to NavLink's `className` prop.
  // It returns the 'active' class if the link is active, otherwise it returns an empty string.
  const getNavLinkClass = ({ isActive }) => (isActive ? "active" : "");

  return (
    // Use the 'sidebar' class from Sidebar.css
    <aside className="sidebar">
      {/* Use the 'sidebar-header' class */}
      <div className="sidebar-header">Dashboard</div>

      {/* Use the 'sidebar-nav' class */}
      <nav className="sidebar-nav">
        <NavLink to="/" className={getNavLinkClass} end>
          <Users />
          <span>Employees</span>
        </NavLink>

        <NavLink to="/raise-ticket" className={getNavLinkClass}>
          <MessageSquare />
          <span>Support Ticket</span>
        </NavLink>

        <NavLink to="/whitelist" className={getNavLinkClass}>
          <CheckSquare />
          <span>Whitelist</span>
        </NavLink>
        
        <NavLink to="/alerts" className={getNavLinkClass}>
          <AlertTriangle />
          <span>Alerts</span>
        </NavLink>
      </nav>
    </aside>
  );
};

export default Sidebar;