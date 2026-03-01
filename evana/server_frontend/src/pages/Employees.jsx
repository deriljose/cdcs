import React, { useEffect, useState } from 'react';
import { Lock, Unlock, RefreshCw } from 'lucide-react';
import "./Employees.css";
 
const Employees = ({ role }) => {
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(false);

    const fetchEmployees = async () => {
        try {
            const res = await fetch('http://localhost:3000/api/employees');
            const data = await res.json();
            setEmployees(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error("Failed to fetch employees", error);
        }
    };

    useEffect(() => {
        fetchEmployees();
        const interval = setInterval(fetchEmployees, 5000);
        return () => clearInterval(interval);
    }, []);

    const handleAction = async (action, username) => {
        setLoading(true);
        try {
            await fetch(`http://localhost:3000/api/admin/${action}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username })
            });
            await fetchEmployees();
        } catch (error) {
            console.error(`Failed to ${action}`, error);
        } finally {
            setLoading(false);
        }
    };

    const TEN_MIN_MS = 10 * 60 * 1000;

    return (
        <div className="p-10 flex-1">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-4xl font-bold mb-2">Employee Devices</h1>
                <div className="flex gap-2">
                    <button onClick={fetchEmployees} className="p-2 bg-gray-200 rounded hover:bg-gray-300">
                        <RefreshCw size={20} />
                    </button>
                </div>
            </div>

            <div className="bg-white shadow rounded-xl p-6 w-full overflow-x-auto">
                <table className="employees-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Username</th>
                            <th>Status</th>
                            <th>Last Seen</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {employees.map(emp => {
                            const lastSeenTs = emp.timestamp ? new Date(emp.timestamp).getTime() : 0;
                            const inactive10 = lastSeenTs && (Date.now() - lastSeenTs) > TEN_MIN_MS;
                            return (
                                <tr key={emp._id} className={inactive10 ? 'inactive-row' : ''}>
                                    <td>{emp.name || '-'}</td>
                                    <td>{emp.username || '-'}</td>
                                    <td>
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                            emp.status === 'LOCKED' ? 'bg-red-100 text-red-800' :
                                            emp.status === 'RESET_WAIT' ? 'bg-yellow-100 text-yellow-800' :
                                            emp.status === 'INACTIVE' ? 'bg-gray-100 text-gray-800' :
                                            'bg-green-100 text-green-800'
                                        }`}>
                                            {emp.status || 'ACTIVE'}
                                        </span>
                                    </td>
                                    <td>{emp.timestamp ? new Date(emp.timestamp).toLocaleString() : 'Never'}</td>
                                    <td>
                                        <div className="flex gap-2">
                                            {role === 'admin' && (
                                                <>
                                                <button 
                                                    onClick={() => handleAction('lockdown', emp.username)}
                                                    disabled={loading || emp.status === 'LOCKED'}
                                                    className="text-red-600 hover:text-red-900 disabled:opacity-50"
                                                    title="Lock Device"
                                                >
                                                    <Lock size={18} />
                                                </button>
                                                <button 
                                                    onClick={() => handleAction('unlock', emp.username)}
                                                    disabled={loading || emp.status !== 'LOCKED'}
                                                    className="text-blue-600 hover:text-blue-900 disabled:opacity-50"
                                                    title="Unlock Device"
                                                >
                                                    <Unlock size={18} />
                                                </button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default Employees;