const express = require('express'); 
const https = require('https'); 
const http = require('http'); 
const fs = require('fs'); 
const cors = require('cors'); // A tool to allow web pages from different addresses to talk to this server.
const os = require('os'); 
const { MongoClient, ObjectId } = require('mongodb'); 
require('dotenv').config();

// --- Main Application Setup ---
// Creates the main web server application.
const app = express();
// Tells the server to automatically understand incoming data that is in JSON format.
app.use(express.json());
// Applies the CORS rules, allowing the frontend website to make requests to this server.
app.use(cors());
// Makes the JSON output from the server nicely formatted and easy to read for humans.
app.set('json spaces', 2);

// --- Database Configuration ---
const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
    console.error('Error: MONGO_URI is not defined in the .env file.');
    process.exit(1);
}
const dbName = 'cdcs';

const client = new MongoClient(mongoUri);
let db;

// --- Child Process Setup ---
// Imports a tool to run other programs (like Python scripts) from our server.
const { spawn } = require('child_process');
const path = require('path');


async function connectToDatabase() {
    try {
        await client.connect();
        db = client.db(dbName);
        console.log('Successfully connected to MongoDB Atlas!');
    } catch (e) {
        console.error('Failed to connect to MongoDB', e);
        process.exit(1);
    }
}

// --- Helper Functions ---
// It helps catch any errors that happen in asynchronous functions and passes them to our main error handler, preventing the server from crashing.
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// --- In-Memory Command Queue ---
let commandQueue = [];

// --- Authentication Middleware ---
const apiKeys = process.env.API_KEYS || '';
// Creates a fast-lookup set of the valid API keys.
const VALID_API_KEYS = new Set(apiKeys.split(',').filter(Boolean));
if (VALID_API_KEYS.size === 0) {
    console.warn('Warning: No API_KEYS found in .env file. API endpoints will be inaccessible.');
}
// A security checkpoint (middleware) that checks for a valid API key.
const requireApiKey = (req, res, next) => {
    const apiKey = req.get('X-API-Key');
    console.log(`[API Key Check] Path: "${req.path}", Method: ${req.method}, Key Provided: ${apiKey ? 'Yes' : 'No'}`);
    if (apiKey && VALID_API_KEYS.has(apiKey)) {
        return next();
    }
    console.error(`[API Key Check] Unauthorized access attempt on "${req.path}". This endpoint requires a valid X-API-Key header.`);
    res.status(401).json({ error: 'Unauthorized', detail: 'A valid X-API-Key header is required for this endpoint.' });
};

// --- Route Definitions ---
// An endpoint for queuing a package installation.
app.post('/api/install-package', requireApiKey, asyncHandler(async (req, res) => {
    const { packageName } = req.body;
    if (!packageName) {
        return res.status(400).json({ error: 'packageName is required.' });
    }
    console.log(`Received install request for package: ${packageName}. Queuing command.`);
    commandQueue.push({ msg_type: 2001, packageName: packageName });
    res.status(202).json({ message: 'Install command queued successfully.' });
}));

/**
 * The client agent periodically sends a message here. If there's a command
 * in the queue for it, the server sends it back as a response.
 */
// An endpoint to check-in from the client.
app.post('/api/check-in', asyncHandler(async (req, res) => {
    const { username, mac_address, unauthorized_count = 0 } = req.body;

    // Insert the heartbeat payload into the appropriate collection.
    // Use try/catch so DB errors don't cause endpoint to return 500.
    try {
        const count = Number(unauthorized_count) || 0;
        if (count === 0) {
            await db.collection('logs').insertOne(req.body);
        } else if (count > 0) {
            await db.collection('flagged').insertOne(req.body);
        }
    } catch (e) {
        console.error('Failed to insert heartbeat into logs:', e);
        // continue — do not fail the request because of logging errors
    }

    // Check if there is any pending command to send
    if (commandQueue.length > 0) {
        const command = commandQueue.shift();

        // Log data for command response
        const logDoc = {
            timestamp: new Date().toISOString(),
            package: command.packageName,
            username: username,
            mac_address: mac_address
        };
        await db.collection('installation_logs').insertOne(logDoc).catch(e => console.error('Failed to insert log:', e));
        
        // Send command to client
        res.json(command);
    } else {
        res.json({ reply: 'OK. No pending commands.' });
    }

    // Update user’s timestamp in the database if needed
    const userCollection = db.collection('employees');
    const user = await userCollection.findOne({ username: username });

    if (user) {
        const lastTimestamp = new Date(user.timestamp);
        const now = new Date();

        // 1 hour in ms
        if ((now - lastTimestamp) > 60 * 60 * 1000) {
            await userCollection.updateOne(
                { username: username },
                { $set: { timestamp: now.toISOString() } }
            );
            console.log(`User ${username}'s timestamp updated.`);
        }
    } else {
        console.warn(`User ${username} not found in database.`);
    }
}));

// An endpoint for clients to report unauthorized packages.
app.post('/message', asyncHandler(async (req, res) => {
    if (req.body.msg_type === 1001) {
        const { msg_type, ...doc } = req.body;
        const flaggedCollectionRef = db.collection('flagged');
        await flaggedCollectionRef.insertOne(doc);
        console.log('Flagged data inserted into MongoDB:', doc);

        // Also store the full incoming JSON into package_logs collection (safe)
        try {
            await db.collection('package_logs').insertOne(req.body);
            console.log('Inserted report into package_logs collection.');
        } catch (e) {
            console.error('Failed to insert into package_logs:', e);
        }

        if (commandQueue.length > 0) {
            const command = commandQueue.shift();
            const clientIdentifier = doc.mac_address || 'unknown';
            console.log(`Sending command to client ${clientIdentifier}:`, command);
            const logDoc = {
                timestamp: new Date().toISOString(),
                package: command.packageName,
                username: doc.username || 'unknown',
                mac_address: clientIdentifier
            };
            await db.collection('installation_logs').insertOne(logDoc);
            res.json(command);
        } else {
            res.json({ reply: 'Message received and logged. No pending commands.' });
        }
    } else {
        res.status(400).json({ error: 'Invalid msg_type provided.' });
    }
}));

// A helper function to create simple, read-only API endpoints.
const createReadOnlyEndpoint = (path, collectionName) => {
    app.get(path, requireApiKey, asyncHandler(async (req, res) => {
        const collection = db.collection(collectionName);
        const data = await collection.find({}).toArray();
        res.json(data);
    }));
};

createReadOnlyEndpoint('/flagged', 'flagged');
createReadOnlyEndpoint('/employees', 'employees');
createReadOnlyEndpoint('/packages', 'packages');

// --- Public, Key-less Endpoints for Frontend Dashboard ---

/**
 * These endpoints do NOT require an API key, so the web dashboard can access them easily.
 * @param {string} path - The API path for the endpoint (e.g., '/api/employees').
 * @param {string} collectionName - The name of the MongoDB collection that *should* be queried.
 * @param {object} [sort={}] - An optional setting to sort the results.
 */
const createPublicReadOnlyEndpoint = (path, collectionName, sort = {}) => {
    app.get(path, asyncHandler(async (req, res) => {
        // BUG: This should be `db.collection(collectionName)` but is hardcoded to 'employees'.
        const collection = db.collection(collectionName);
        const data = await collection.find({}).sort(sort).toArray();
        res.json(data);
    }));
};

createPublicReadOnlyEndpoint('/api/employees', 'employees');
createPublicReadOnlyEndpoint('/api/packages', 'packages');
createPublicReadOnlyEndpoint('/api/tickets', 'tickets', { timestamp: -1 });
createPublicReadOnlyEndpoint('/api/flagged', 'flagged');
createPublicReadOnlyEndpoint('/api/logs', 'logs');


// An endpoint for the frontend dashboard to add a new package to the approved list.
app.post('/api/packages', asyncHandler(async (req, res) => {
    const { name } = req.body;
    if (!name || typeof name !== 'string' || name.trim() === '') {
        return res.status(400).json({ error: 'A non-empty package name is required.' });
    }

    const collection = db.collection('packages');
    const trimmedName = name.trim();

    const existingPackage = await collection.findOne({ name: trimmedName });
    if (existingPackage) {
        return res.status(409).json({ error: 'Package already exists in the whitelist.' });
    }

    const result = await collection.insertOne({ name: trimmedName });
    const newPackage = { _id: result.insertedId, name: trimmedName };

    res.status(201).json(newPackage);
}));


// An endpoint for the frontend dashboard to delete a package from the approved list.
app.delete('/api/packages/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'Invalid package ID format.' });
    }
    const collection = db.collection('packages');
    const result = await collection.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
        return res.status(404).json({ error: 'Package not found.' });
    }
    res.status(204).send();
}));


// An endpoint for the frontend dashboard to delete a support ticket.
app.delete('/api/tickets/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'Invalid ticket ID format.' });
    }
    const collection = db.collection('tickets');
    const result = await collection.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
        return res.status(404).json({ error: 'Ticket not found.' });
    }
    // On successful deletion, send 204 No Content
    res.status(204).send();
}));

app.patch('/api/tickets/:id/resolve', async (req, res) => {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'Invalid ticket ID format.' });
    }
    const collection = db.collection('tickets');
    const result = await collection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { resolved: true } } // Set the resolved field to true
    );
    if (result.modifiedCount === 0) {
        return res.status(500).json({ error: 'Failed to update ticket status.' });
    }
    const updatedTicket = await collection.findOne({ _id: new ObjectId(id) });
    // On successful deletion, send 200 OK
    res.status(200).json(updatedTicket);
});

// An endpoint for client agents to log the result of a package installation.
app.post('/api/log-install', requireApiKey, asyncHandler(async (req, res) => {
    const log = req.body || {};
    if (!log.timestamp) {
        log.timestamp = new Date().toISOString();
    }
    await db.collection('installation_logs').insertOne(log);
    console.log('Received installation log from client:', log);
    return res.status(201).json({ message: 'Installation log recorded.' });
}));

// Defines the path to the Python script used for predicting ticket properties.
const pythonScript = path.join(__dirname, '../suhail/predict_ticket.py');

/**
 * It sends the description to the script and gets back a predicted category and priority.
 * @param {string} description The ticket description text.
 * @returns {Promise<object>} A promise that resolves with the prediction (e.g., { category: 'Hardware', priority: 'High' }).
 */
function getTicketPrediction(description) {
    return new Promise((resolve, reject) => {
        const pyProcess = spawn('python3', [pythonScript]);
        let pyOutput = '';
        let pyError = '';

        pyProcess.stdout.on('data', (data) => { pyOutput += data.toString(); });
        pyProcess.stderr.on('data', (data) => { pyError += data.toString(); });

        pyProcess.on('close', (code) => {
            if (code !== 0 || pyError) {
                const errorMsg = pyError || `Python script exited with code ${code}`;
                console.error('Python prediction error:', errorMsg);
                return reject(new Error('Failed to predict ticket category/priority'));
            }

            try {
                const result = JSON.parse(pyOutput);
                resolve(result);
            } catch (parseErr) {
                console.error('Failed to parse Python output:', parseErr, pyOutput);
                reject(new Error('Failed to parse Python prediction output'));
            }
        });

        pyProcess.on('error', (spawnError) => {
            console.error('Failed to spawn Python process:', spawnError);
            reject(spawnError);
        });

        pyProcess.stdin.write(description + '\n');
        pyProcess.stdin.end();
    });
}

// An endpoint for client agents to create a new support ticket.
app.post('/api/tickets', requireApiKey, asyncHandler(async (req, res) => {
    const ticket = req.body || {};
    if (!ticket.subject || !ticket.description) {
        return res.status(400).json({ error: 'subject and description are required' });
    }

    const prediction = await getTicketPrediction(ticket.description);

    ticket.category = prediction.category || 'Unknown';
    ticket.priority = prediction.priority || 'Unknown';
    ticket.resolved = false;

    await db.collection('tickets').insertOne(ticket);
    console.log('Received ticket with prediction:', ticket);
    return res.status(201).json({ message: 'Ticket recorded with prediction.', ticket });
}));



// If any error occurs in an endpoint and isn't handled, it gets caught here. 
app.use((err, req, res, next) => {
    console.error(`Unhandled error on ${req.method} ${req.path}:`, err);
    // Avoid sending detailed error messages in production for security
    res.status(500).json({ error: 'Internal Server Error' });
});

// --- Server Startup ---

const startServer = async () => {
    await connectToDatabase();

    // Defines the security certificate and key needed to run an HTTPS server.
    const options = {
        key: fs.readFileSync('server.key'),
        cert: fs.readFileSync('server.cert')
    };

    // Creates and starts the HTTPS server on port 3000.
    const server = https.createServer(options, app).listen(3000, '0.0.0.0', () => {
        console.log('HTTPS Express server listening on port 3000');
        // Logs the server's local network addresses for easy access during development.
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const net of interfaces[name]) {
                if (net.family === 'IPv4' && !net.internal) {
                    console.log(`Server available on LAN at: https://${net.address}:3000`);
                }
            }
        }
    });


// A function to gracefully shut down the server.
    const shutdown = (signal) => {
        console.log(`\n${signal} received. Shutting down gracefully...`);
        server.close(async () => {
            console.log('HTTP server closed.');
            await client.close();
            console.log('MongoDB connection closed.');
            process.exit(0);
        });
    };

    // Sets up listeners to trigger the shutdown function when the user presses Ctrl+C (SIGINT)
    // or when the system requests termination (SIGTERM).
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
};

startServer().catch(e => console.error('Failed to start server:', e));