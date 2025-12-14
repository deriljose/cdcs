import React from "react";
import "./styles.css";

const GitPage = () => {
  return (
    <div className="p-10 flex-1">
      <h1 className="text-4xl font-bold mb-2 flex items-center">
        Git Repositories
      </h1>
      <p className="text-gray-500 mb-6">
        Repositories you have access to
      </p>

      <ul className="bg-white shadow rounded-xl divide-y">
        <li className="p-4 hover:bg-gray-50">
          <span className="font-medium">frontend-dashboard</span>
          <p className="text-sm text-gray-500">Last updated: 2 days ago</p>
        </li>
        <li className="p-4 hover:bg-gray-50">
          <span className="font-medium">backend-api-service</span>
          <p className="text-sm text-gray-500">Last updated: 5 days ago</p>
        </li>
        <li className="p-4 hover:bg-gray-50">
          <span className="font-medium">security-tools</span>
          <p className="text-sm text-gray-500">Last updated: 1 week ago</p>
        </li>
      </ul>
    </div>
  );
};

export default GitPage;
