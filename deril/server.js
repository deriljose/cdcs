const express = require('express');
const https = require('https');
const fs = require('fs');
const cors = require('cors');
const os = require('os');
const { MongoClient } = require('mongodb');
const { execFile } = require('child_process');

require('dotenv').config(); // Load environment variables from .env file

const app = express();
app.use(express.json());

// Enable pretty-printing of JSON responses.
// This will indent the JSON with 2 spaces, making it more readable.

// Enable CORS for all routes
app.use(cors());
app.set('json spaces', 2);

// MongoDB Atlas connection details
// The MongoDB URI is now loaded from the .env file for better security.
const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
    console.error('Error: MONGO_URI is not defined in the .env file.');
    process.exit(1);
}
const dbName = 'cdcs';

// --- Refactored MongoDB Connection ---
// Create a single MongoClient instance to be reused across the application.
// This is much more efficient than creating a new connection for every request.
const client = new MongoClient(mongoUri);
let db;

async function connectToDatabase() {
    try {
        await client.connect();
        db = client.db(dbName);
        console.log('Successfully connected to MongoDB Atlas!');
    } catch (e) {
        console.error('Failed to connect to MongoDB', e);
        // If the database connection fails, the application can't function.
        process.exit(1);
    }
}

// --- In-Memory Command Queue ---
// A simple queue to hold the next command for a client.
let commandQueue = [];

// --- Authentication Middleware ---
// In a production environment, store these keys securely (e.g., environment variables, secret manager)
// API Keys are now loaded from the .env file.
const apiKeys = process.env.API_KEYS || '';
const VALID_API_KEYS = new Set(apiKeys.split(',').filter(Boolean));
if (VALID_API_KEYS.size === 0) {
    console.warn('Warning: No API_KEYS found in .env file. API endpoints will be inaccessible.');
}

const requireApiKey = (req, res, next) => {
    const apiKey = req.get('X-API-Key');
    if (apiKey && VALID_API_KEYS.has(apiKey)) {
        // The request has a valid API key, so we can proceed.
        return next();
    }
    // If the key is missing or invalid, we send a 401 Unauthorized response.
    res.status(401).json({ error: 'Unauthorized: A valid X-API-Key header is required.' });
};

// Handle POST requests from clients
app.post('/message', async (req, res) => {
    console.log(req.body);
    if (req.body.msg_type === 1001) {
        // Prepare document without msg_type
        const { msg_type, ...doc } = req.body;
        try {
            // OPTIMIZATION: Use the shared 'db' object from the global connection pool.
            // This is much more efficient than creating a new connection for every request.
            const flaggedCollectionRef = db.collection('flagged');
            await flaggedCollectionRef.insertOne(doc);
            console.log('Flagged data inserted into MongoDB:', doc);
            
            // Check if there is a command waiting in the queue for a client.
            if (commandQueue.length > 0) {
                const command = commandQueue.shift(); // Get and remove the oldest command
                const clientIdentifier = doc.mac_address || 'unknown';
                console.log(`Sending command to client ${clientIdentifier}:`, command);

                // Log the command assignment to the installation_logs collection
                const logDoc = {
                    timestamp: new Date().toISOString(),
                    package: command.packageName,
                    username: doc.username || 'unknown',
                    mac_address: clientIdentifier
                };
                db.collection('installation_logs').insertOne(logDoc);
                console.log('Installation assignment logged to MongoDB:', logDoc);

                res.json(command); // Send command to the client
            } else {
                // Deletion is now handled by the client via its local helper service.
                // The server's only responsibility is to log the flagged packages.
                res.json({ reply: 'Message received and logged. No pending commands.' });
            }
        } catch (e) {
            console.error('MongoDB error in /message:', e);
            res.status(500).json({ error: 'Failed to process message due to a database error.' });
        }
    } else {
        res.status(400).json({ error: 'Invalid msg_type provided.' });
    }
});

// Endpoint for the frontend to request a package installation on a client
app.post('/api/install-package', requireApiKey, async (req, res) => {
    const { packageName } = req.body;
    if (!packageName) {
        return res.status(400).json({ error: 'packageName is required.' });
    }
    // This endpoint now only queues the command. Logging happens when a client picks it up.
    console.log(`Received install request for package: ${packageName}. Queuing command.`);
    commandQueue.push({ msg_type: 2001, packageName: packageName });
    res.status(202).json({ message: 'Install command queued successfully.' });
});

// Endpoint for clients to poll for commands without sending a report.
app.post('/api/check-in', (req, res) => {
    // This is a lightweight endpoint for clients to see if commands are available.
    if (commandQueue.length > 0) {
        const command = commandQueue.shift(); // Get and remove the oldest command
        const clientIdentifier = req.body.mac_address || 'unknown';
        console.log(`Sending command to polling client ${clientIdentifier}:`, command);

        // Log the command assignment to the installation_logs collection
        const logDoc = {
            timestamp: new Date().toISOString(),
            package: command.packageName,
            username: req.body.username || 'unknown',
            mac_address: clientIdentifier
        };
        db.collection('installation_logs').insertOne(logDoc);
        console.log('Installation assignment logged to MongoDB:', logDoc);

        res.json(command); // Send command to the client
    } else {
        // No commands are pending, just send a simple acknowledgement.
        res.json({ reply: 'OK. No pending commands.' });
    }
});


// --- Generic Read-Only Endpoint Factory ---
// This function creates a protected, read-only endpoint for a given collection.
// This avoids code duplication for /flagged, /employees, and /packages.
const createReadOnlyEndpoint = (path, collectionName) => {
    app.get(path, requireApiKey, async (req, res) => {
        try {
            const collection = db.collection(collectionName);
            const data = await collection.find({}).toArray();
            res.json(data);
        } catch (e) {
            console.error(`MongoDB error on ${path}:`, e);
            res.status(500).json({ error: 'Database error' });
        }
    });
};

// Create the protected, read-only API endpoints
createReadOnlyEndpoint('/flagged', 'flagged');
createReadOnlyEndpoint('/employees', 'employees');
createReadOnlyEndpoint('/packages', 'packages');

// --- Server Startup ---
const startServer = async () => {
    // 1. Connect to the database first
    await connectToDatabase();

    // 2. Load SSL certificates
    const options = {
        key: fs.readFileSync('server.key'), // Path to your key
        cert: fs.readFileSync('server.cert') // Path to your certificate
    };

    // 3. Start the HTTPS server
    https.createServer(options, app).listen(3000, '0.0.0.0', () => {
        console.log('HTTPS Express server listening on port 3000');
        // A cleaner way to log network interfaces
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const net of interfaces[name]) {
                // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
                if (net.family === 'IPv4' && !net.internal) {
                    console.log(`Server available on LAN at: https://${net.address}:3000`);
                }
            }
        }
    });
};

startServer();
