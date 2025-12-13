// ...existing code...
import React, { useState } from "react";

const RaiseTicket = () => {
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!subject.trim() || !description.trim()) {
      setError("Subject and description are required.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("http://localhost:4001/api/ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: subject.trim(), description: description.trim() }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Agent responded ${res.status}: ${body || res.statusText}`);
      }
      alert("Ticket submitted.");
      setSubject("");
      setDescription("");
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-10 flex-1">
      <h1 className="text-4xl font-bold mb-2">Raise Ticket</h1>
      <p className="text-gray-500 mb-6">Submit a ticket for any technical issue or software request.</p>

      <div className="bg-white shadow rounded-xl p-6 w-full max-w-lg">
        <form className="space-y-4" onSubmit={submit}>
          <div>
            <label className="block text-gray-700 font-medium mb-1">Subject</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              type="text"
              className="w-full border rounded-md p-2 focus:ring focus:ring-blue-200"
              placeholder="Enter subject"
            />
          </div>
          <div>
            <label className="block text-gray-700 font-medium mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows="4"
              className="w-full border rounded-md p-2 focus:ring focus:ring-blue-200"
              placeholder="Describe your issue..."
            />
          </div>
          {error && <p className="text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={sending}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
          >
            {sending ? "Sending…" : "Submit Ticket"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default RaiseTicket;
// ...existing code...