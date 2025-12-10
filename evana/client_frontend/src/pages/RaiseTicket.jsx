import React from "react";

const RaiseTicket = () => {
  return (
    <div className="p-10 flex-1">
      <h1 className="text-4xl font-bold mb-2">Raise Ticket</h1>
      <p className="text-gray-500 mb-6">
        Submit a ticket for any technical issue or software request.
      </p>

      <div className="bg-white shadow rounded-xl p-6 w-full max-w-lg">
        <form className="space-y-4">
          <div>
            <label className="block text-gray-700 font-medium mb-1">
              Subject
            </label>
            <input
              type="text"
              className="w-full border rounded-md p-2 focus:ring focus:ring-blue-200"
              placeholder="Enter subject"
            />
          </div>
          <div>
            <label className="block text-gray-700 font-medium mb-1">
              Description
            </label>
            <textarea
              rows="4"
              className="w-full border rounded-md p-2 focus:ring focus:ring-blue-200"
              placeholder="Describe your issue..."
            ></textarea>
          </div>
          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
          >
            Submit Ticket
          </button>
        </form>
      </div>
    </div>
  );
};

export default RaiseTicket;
