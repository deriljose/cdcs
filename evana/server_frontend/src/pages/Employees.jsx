import React, { useState, useEffect } from "react";
import "./Employees.css"; // Import the component-specific CSS file

const Employees = () => {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        const response = await fetch("/api/employees"); // Use relative path to leverage the Vite proxy
        if (!response.ok) {
          // Try to get more details from the response body for better debugging
          const errorData = await response.json().catch(() => ({})); // Gracefully handle non-JSON responses
          const errorMessage = errorData.detail || errorData.error || `HTTP error! Status: ${response.status}`;
          throw new Error(errorMessage);
        }
        const data = await response.json();
        setEmployees(data);
      } catch (e) {
        setError(e.message);
        console.error("Failed to fetch employees:", e);
      } finally {
        setLoading(false);
      }
    };

    fetchEmployees();
  }, []);

  return (
    <div className="p-10 flex-1">
      <h1 className="text-4xl font-bold mb-2">Employees</h1>
      <p className="text-gray-500 mb-6">
        Manage your organization's employees.
      </p>
      <div className="bg-white shadow rounded-xl p-6 w-full overflow-x-auto">
        {loading && <p className="text-gray-700">Loading employees...</p>}
        {error && <p className="text-red-600">Error: {error}</p>}
        {!loading && !error && (
          <table className="employees-table">
            <thead>
              <tr>
                <th scope="col">Employee ID</th>
                <th scope="col">Name</th>
                <th scope="col">Username</th>
                <th scope="col">MAC Address</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => (
                <tr key={employee._id}>
                  <td className="employee-id-cell">{employee.employeeID}</td>
                  <td>{employee.name}</td>
                  <td>{employee.username}</td>
                  <td>{employee.macAddress}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default Employees;
