import React, { useEffect, useState } from 'react';
import { Lock, Unlock } from 'lucide-react';
import "./styles.css";

const Employees = ({ role }) => {
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetchEmployees = async () => {
        setLoading(true);
        try {
            setError(null);
            const res = await fetch('http://localhost:3000/api/employees');
            const data = await res.json();
            setEmployees(Array.isArray(data) ? data : []);
        } catch (error) {
            setError('Server likely not running or CORS issue');
            console.error("Failed to fetch employees", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchEmployees();
    }, []);

    const handleAction = async (action, username) => {
        setLoading(true);
        try {
            setError(null);
            await fetch(`http://localhost:3000/api/admin/${action}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username })
            });
            await fetchEmployees();
        } catch (error) {
            setError('Failed to perform action');
            console.error(`Failed to ${action}`, error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="whitelist-container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                    <h1 className="page-title">Employees</h1>
                    <p className="page-subtitle">Details of all employees.</p>
                </div>
            </div>

            {loading && <p className="loading-message">Loading employees...</p>}
            {error && <p className="error">Error: {error}</p>}
            <div className="table-container">
                {!loading && !error && (
                    <table className="packages-table">
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
                                return (
                                    <tr key={emp._id}>
                                        <td>{emp.name || '-'}</td>
                                        <td>{emp.username || '-'}</td>
                                        <td>
                                            <span className={`status-pill ${
                                                emp.status === 'LOCKED' ? 'locked' :
                                                emp.status === 'RESET_WAIT' ? 'reset_wait' :
                                                emp.status === 'INACTIVE' ? 'inactive' :
                                                'active'
                                            }`}>
                                                {emp.status || 'ACTIVE'}
                                            </span>
                                        </td>
                                        <td>{emp.timestamp ? new Date(emp.timestamp).toLocaleString() : 'Never'}</td>
                                        <td>
                                            <div>
                                                {role === 'admin' && (
                                                    <>
                                                    <button 
                                                        onClick={() => handleAction('lockdown', emp.username)}
                                                        disabled={loading || emp.status === 'LOCKED'}
                                                        className="action-btn lock"
                                                        title="Lock Device"
                                                    >
                                                        <Lock size={18} />
                                                    </button>
                                                    <button 
                                                        onClick={() => handleAction('unlock', emp.username)}
                                                        disabled={loading || emp.status !== 'LOCKED'}
                                                        className="action-btn unlock"
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
                )}
            </div>
        </div>
    );
};

export default Employees;