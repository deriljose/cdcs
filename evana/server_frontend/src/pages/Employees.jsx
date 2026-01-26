import React, { useEffect, useState } from 'react';
import { Lock, Unlock, RefreshCw } from 'lucide-react';

const Employees = ({ role }) => {
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(false);

    const fetchEmployees = async () => {
        try {
            const res = await fetch('http://localhost:3000/api/employees');
            const data = await res.json();
            setEmployees(data);
        } catch (error) {
            console.error("Failed to fetch employees", error);
        }
    };

    useEffect(() => {
        fetchEmployees();
        const interval = setInterval(fetchEmployees, 5000); // Poll every 5s for status updates
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

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">Employee Devices</h1>
                <button onClick={fetchEmployees} className="p-2 bg-gray-200 rounded hover:bg-gray-300">
                    <RefreshCw size={20} />
                </button>
            </div>
            <div className="overflow-x-auto bg-white shadow-md rounded-lg">
                <table className="min-w-full leading-normal">
                    <thead>
                        <tr className="bg-gray-100 text-left text-gray-600 uppercase text-sm">
                            <th className="px-5 py-3 border-b-2 border-gray-200">Name</th>
                            <th className="px-5 py-3 border-b-2 border-gray-200">Username</th>
                            <th className="px-5 py-3 border-b-2 border-gray-200">Status</th>
                            <th className="px-5 py-3 border-b-2 border-gray-200">Last Seen</th>
                            <th className="px-5 py-3 border-b-2 border-gray-200">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {employees.map(emp => (
                            <tr key={emp._id} className="hover:bg-gray-50">
                                <td className="px-5 py-5 border-b border-gray-200">{emp.name}</td>
                                <td className="px-5 py-5 border-b border-gray-200">{emp.username}</td>
                                <td className="px-5 py-5 border-b border-gray-200">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                        emp.status === 'LOCKED' ? 'bg-red-100 text-red-800' : 
                                        emp.status === 'RESET_WAIT' ? 'bg-yellow-100 text-yellow-800' : 
                                        emp.status === 'INACTIVE' ? 'bg-gray-100 text-gray-800' : 
                                        'bg-green-100 text-green-800'
                                    }`}>
                                        {emp.status || 'ACTIVE'}
                                    </span>
                                </td>
                                <td className="px-5 py-5 border-b border-gray-200 text-sm">
                                    {emp.timestamp ? new Date(emp.timestamp).toLocaleString() : 'Never'}
                                </td>
                                <td className="px-5 py-5 border-b border-gray-200 text-sm">
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
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default Employees;