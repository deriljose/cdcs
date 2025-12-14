import React, { useState, useEffect } from "react";
import "./Employees.css";

const Employees = () => {
  // States for managing employees, loading status, and errors
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        const response = await fetch("/api/employees");

        const data = await response.json();
        setEmployees(data);
      } catch (e) {
        setError("Server likely not running");
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
        Details of employees
      </p>
      <div className="bg-white shadow rounded-xl p-6 w-full overflow-x-auto">
        {loading && <p className="text-gray-700">Loading employees...</p>}
        {error && <p className="text-red-600">Error: {error}</p>}
        {!loading && !error && (
          <table className="employees-table">
            <thead>
              <tr>
                <th scope="col">ID</th>
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
