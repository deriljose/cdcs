import React from "react";
import { NavLink } from "react-router-dom";
import {
  MessageSquare,
  Users,
  CheckSquare,
  AlertTriangle
} from "lucide-react";

import "./Sidebar.css";

const Sidebar = () => {
  // Returns the 'active' class if the link is active, otherwise it returns an empty string.
  const getNavLinkClass = ({ isActive }) => (isActive ? "active" : "");

  return (
    // Use the 'sidebar' class from Sidebar.css
    <aside className="sidebar">
      <div className="sidebar-header">Dashboard</div>

      <nav className="sidebar-nav">
        <NavLink to="/" className={getNavLinkClass} end>
          <Users />
          <span>Employees</span>
        </NavLink>

        <NavLink to="/support-tickets" className={getNavLinkClass}>
          <MessageSquare />
          <span>Support Tickets</span>
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