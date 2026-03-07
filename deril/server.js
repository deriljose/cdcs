// Server backend

// Configure variables below
const INACTIVITY_LIMIT_MINUTES = 30;

const express = require('express'); 
const https = require('https'); 
const http = require('http'); 
const fs = require('fs'); 
const cors = require('cors'); // A tool to allow web pages from different addresses to talk to this server
const os = require('os'); 
const { MongoClient, ObjectId } = require('mongodb'); 
require('dotenv').config();

const app = express();
const INACTIVITY_LIMIT_MS = INACTIVITY_LIMIT_MINUTES * 60 * 1000;

// Tells the server to automatically understand incoming data that is in JSON format
app.use(express.json());
// Applies the CORS rules, allowing the frontend website to make requests to this server
app.use(cors());
// Makes the JSON output from the server nicely formatted and easy to read for humans
app.set('json spaces', 2);

const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
    console.error('ERROR: MONGO_URI is not defined in .env');
    process.exit(1);
}
const dbName = 'cdcs';

const client = new MongoClient(mongoUri);
let db;

// Imports a tool to run other programs (like Python scripts) from our server
const { spawn } = require('child_process');
const path = require('path');

async function connectToDatabase() {
    try {
        await client.connect();
        db = client.db(dbName);
        console.log('Successfully connected to MongoDB');
    } catch (e) {
        console.error('Failed to connect to MongoDB:', e);
        process.exit(1);
    }
}

// Helper functions to catch any errors that happen in asynchronous functions and passes them to our main error handler, preventing the server from crashing
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// In-memory command queue
let commandQueue = [];

// Authentication middleware
const apiKeys = process.env.API_KEYS || '';
// Creates a fast-lookup set of the valid API keys
const VALID_API_KEYS = new Set(apiKeys.split(',').filter(Boolean));
if (VALID_API_KEYS.size === 0) {
    console.warn('ALERT: No API_KEYS found in .env, API endpoints will be inaccessible');
}
// A security checkpoint (middleware) that checks for a valid API key
const requireApiKey = (req, res, next) => {
    const apiKey = req.get('X-API-Key');
    console.log(`[API Key Check] Path: "${req.path}", Method: ${req.method}, Key Provided: ${apiKey ? 'Yes' : 'No'}`);
    if (apiKey && VALID_API_KEYS.has(apiKey)) {
        return next();
    }
    console.error(`Unauthorized access attempt on "${req.path}", this endpoint requires a valid X-API-Key header`);
    res.status(401).json({ error: 'Unauthorized', detail: 'A valid X-API-Key header is required for this endpoint' });
};

// Route definitions
// An endpoint for queuing a package installation
app.post('/api/install-package', requireApiKey, asyncHandler(async (req, res) => {
    const { packageName } = req.body;
    if (!packageName) {
        return res.status(400).json({ error: 'packageName is required.' });
    }
    console.log(`Received install request for package: ${packageName}, queuing command...`);
    commandQueue.push({ msg_type: 2001, packageName: packageName });
    res.status(202).json({ message: 'Install command queued successfully' });
}));

// An endpoint to check-in from the client
// Used for heartbeat
app.post('/api/check-in', asyncHandler(async (req, res) => {
    const { username, mac_address, unauthorized_count = 0 } = req.body;

    const userCollection = db.collection('employees');
    const user = await userCollection.findOne({ username: username });
    
    // Check if client reports status as LOCKED
    if (req.body.clientStatus === 'LOCKED') {
        if (user && user.status !== 'LOCKED' && user.status !== 'RESET_WAIT') {
            // update DB with status
            await userCollection.updateOne({ username }, { $set: { status: 'LOCKED' } });
        }
    }

    // Check client status otherwise, and issue corresponding commands
    if (user) {
        if (user.status === 'LOCKED') return res.json({ command: 'LOCKDOWN' });
        if (user.status === 'RESET_WAIT') return res.json({ command: 'RESET_PASSWORD' });
        // If ACTIVE, update timestamp
        await userCollection.updateOne({ username }, { $set: { timestamp: new Date().toISOString(), status: 'ACTIVE' } });
    }

    // Insert the heartbeat payload into the appropriate collection
    try {
        const count = Number(unauthorized_count) || 0;
        if (count === 0) {
            await db.collection('logs').insertOne(req.body);
        } else if (count > 0) {
            await db.collection('flagged').insertOne(req.body);
        }
    } catch (e) {
        console.error('Failed to insert log:', e);
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
        
        res.json(command);
    } else {
        res.json({ reply: 'No pending commands' });
    }
}));

// An endpoint for clients to report unauthorized packages
app.post('/message', asyncHandler(async (req, res) => {
    if (req.body.msg_type === 1001) {
        const { msg_type, ...doc } = req.body;
        const flaggedCollectionRef = db.collection('flagged');
        await flaggedCollectionRef.insertOne(doc);
        console.log('Flagged data inserted into MongoDB:', doc);

        // Also store the full incoming JSON into package_logs collection
        try {
            await db.collection('package_logs').insertOne(req.body);
            console.log('Inserted report into package_logs');
        } catch (e) {
            console.error('Failed to insert log:', e);
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
            res.json({ reply: 'Message received and logged, no pending commands' });
        }
    } else {
        res.status(400).json({ error: 'Invalid msg_type provided' });
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

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === 'admin') {
        return res.json({ token: 'admin-session-token', role: 'admin' });
    }
    if (username === 'it_user' && password === 'it_user') {
        return res.json({ token: 'it-session-token', role: 'it_employee' });
    }
    res.status(401).json({ error: 'Invalid credentials' });
});

/**
 * These endpoints do NOT require an API key, so the web dashboard can access them easily
 * @param {string} path - The API path for the endpoint (e.g., '/api/employees')
 * @param {string} collectionName - The name of the MongoDB collection that *should* be queried
 * @param {object} [sort={}] - An optional setting to sort the results
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

// Admin security endpoints
app.post('/api/admin/lockdown', asyncHandler(async (req, res) => {
    const { username } = req.body;
    await db.collection('employees').updateOne({ username }, { $set: { status: 'LOCKED' } });
    res.json({ success: true });
}));

app.post('/api/admin/unlock', asyncHandler(async (req, res) => {
    const { username } = req.body;
    await db.collection('employees').updateOne({ username }, { $set: { status: 'RESET_WAIT' } });
    res.json({ success: true });
}));

app.post('/api/reset-applied', asyncHandler(async (req, res) => {
    const { username } = req.body;
    await db.collection('employees').updateOne({ username }, { $set: { status: 'ACTIVE', timestamp: new Date().toISOString() } });
    res.json({ success: true });
}));

// An endpoint for the frontend dashboard to add a new package to the approved list
app.post('/api/packages', asyncHandler(async (req, res) => {
    const { name } = req.body;
    if (!name || typeof name !== 'string' || name.trim() === '') {
        return res.status(400).json({ error: 'A non-empty package name is required' });
    }

    const collection = db.collection('packages');
    const trimmedName = name.trim();

    const existingPackage = await collection.findOne({ name: trimmedName });
    if (existingPackage) {
        return res.status(409).json({ error: 'Package already exists in the whitelist' });
    }

    const result = await collection.insertOne({ name: trimmedName });
    const newPackage = { _id: result.insertedId, name: trimmedName };

    res.status(201).json(newPackage);
}));


// An endpoint for the frontend dashboard to delete a package from the approved list
app.delete('/api/packages/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'Invalid package ID format' });
    }
    const collection = db.collection('packages');
    const result = await collection.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
        return res.status(404).json({ error: 'Package not found' });
    }
    res.status(204).send();
}));


// An endpoint for the frontend dashboard to delete a support ticket
app.delete('/api/tickets/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'Invalid ticket ID format' });
    }
    const collection = db.collection('tickets');
    const result = await collection.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
        return res.status(404).json({ error: 'Ticket not found' });
    }
    res.status(204).send();
}));

app.patch('/api/tickets/:id/resolve', async (req, res) => {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'Invalid ticket ID format' });
    }
    const collection = db.collection('tickets');
    const result = await collection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { resolved: true } } // Set the resolved field to true
    );
    if (result.modifiedCount === 0) {
        return res.status(500).json({ error: 'Failed to update ticket status' });
    }
    const updatedTicket = await collection.findOne({ _id: new ObjectId(id) });
    res.status(200).json(updatedTicket);
});

// An endpoint for client agents to log the result of a package installation
app.post('/api/log-install', requireApiKey, asyncHandler(async (req, res) => {
    const log = req.body || {};
    if (!log.timestamp) {
        log.timestamp = new Date().toISOString();
    }
    await db.collection('installation_logs').insertOne(log);
    console.log('Received installation log from client:', log);
    return res.status(201).json({ message: 'Installation log recorded' });
}));

// Defines the path to the Python script used for predicting ticket properties
const pythonScript = path.join(__dirname, '../suhail/predict_ticket.py');

/**
 * It sends the description to the script and gets back a predicted category and priority
 * @param {string} description The ticket description text
 * @returns {Promise<object>} A promise that resolves with the prediction (e.g., { category: 'Hardware', priority: 'High' })
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

// An endpoint for client agents to create a new support ticket
app.post('/api/tickets', requireApiKey, asyncHandler(async (req, res) => {
    const ticket = req.body || {};
    if (!ticket.subject || !ticket.description) {
        return res.status(400).json({ error: 'Subject and description are required' });
    }

    const prediction = await getTicketPrediction(ticket.description);

    ticket.category = prediction.category || 'Unknown';
    ticket.priority = prediction.priority || 'Unknown';
    ticket.resolved = false;

    await db.collection('tickets').insertOne(ticket);
    console.log('Received ticket with prediction:', ticket);
    return res.status(201).json({ message: 'Ticket recorded with prediction', ticket });
}));

// Git collection endpoints
// GET all git entries
app.get('/api/git', asyncHandler(async (req, res) => {
  const docs = await db.collection('git').find({}).sort({ seq: 1 }).toArray();
  res.json(docs);
}));

// POST add a new git entry { username, repo }
// Also append "username:repos/repo.git" to /home/git/permissions.txt
app.post('/api/git', asyncHandler(async (req, res) => {
  const { username, repo } = req.body || {};
  if (!username || !repo) return res.status(400).json({ error: 'Username and repo required' });

  // Auto-increment sequence in a counters collection
  const counter = await db.collection('counters').findOneAndUpdate(
    { _id: 'git' },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  const seq = (counter && counter.value && counter.value.seq) || 1;

  const doc = { seq, username, repo };
  const result = await db.collection('git').insertOne(doc);
  doc._id = result.insertedId;

  // Update permissions file
  const permsPath = '/home/git/permissions.txt';
  const line = `${username}:repos/${repo}.git`;
  try {
    const fsPromises = require('fs').promises;
    let current = '';
    try {
      current = await fsPromises.readFile(permsPath, 'utf8');
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      current = '';
    }
    const lines = current.split(/\r?\n/).filter(Boolean);
    if (!lines.includes(line)) {
      const toAppend = (current && !current.endsWith('\n')) ? '\n' + line + '\n' : line + '\n';
      await fsPromises.appendFile(permsPath, toAppend, 'utf8');
      console.log(`Appended to permissions file ${line}`);
    } else {
      console.log(`Permissions file already contains ${line}`);
    }
  } catch (fileErr) {
    console.error('Failed to update permissions file:', fileErr);
    // don't fail the request for file write errors
  }

  res.status(201).json(doc);
}));

// DELETE a git entry by ObjectId
// Also remove matching "username:repos/repo.git" line from /home/git/permissions.txt
app.delete('/api/git/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'Invalid ID format' });
  }

  // find document to know username/repo for permissions file removal
  const existing = await db.collection('git').findOne({ _id: new ObjectId(id) });
  if (!existing) {
    return res.status(404).json({ error: 'Git entry not found' });
  }

  const result = await db.collection('git').deleteOne({ _id: new ObjectId(id) });
  if (result.deletedCount === 0) {
    return res.status(404).json({ error: 'Git entry not found' });
  }

  // Update permissions file
  const permsPath = '/home/git/permissions.txt';
  const targetLine = `${existing.username}:repos/${existing.repo}.git`;
  try {
    const fsPromises = require('fs').promises;
    let current = '';
    try {
      current = await fsPromises.readFile(permsPath, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') {
        current = '';
      } else {
        throw err;
      }
    }
    const lines = current.split(/\r?\n/).filter(Boolean);
    const filtered = lines.filter(l => l.trim() !== targetLine);
    const newContent = filtered.length ? filtered.join('\n') + '\n' : '';
    await fsPromises.writeFile(permsPath, newContent, 'utf8');
    console.log(`Removed from permissions file ${targetLine}`);
  } catch (fileErr) {
    console.error('Failed to update permissions file after delete:', fileErr);
  }

  res.status(204).send();
}));

// If any error occurs in an endpoint and isn't handled, it gets caught here.
app.use((err, req, res, next) => {
    console.error(`Unhandled error on ${req.method} ${req.path}:`, err);
    // Avoid sending detailed error messages in production for security
    res.status(500).json({ error: 'Internal server error' });
});

const startServer = async () => {
    await connectToDatabase();
    
    // Server-side inactivity check in background
    setInterval(async () => {
        if (!db) return;
        const cutoff = new Date(Date.now() - INACTIVITY_LIMIT_MS).toISOString();
        try {
            const result = await db.collection('employees').updateMany(
                { status: 'ACTIVE', timestamp: { $lt: cutoff } },
                { $set: { status: 'INACTIVE' } }
            );
            if (result.modifiedCount > 0) {
                console.log(`ALERT: Marked ${result.modifiedCount} devices as INACTIVE due to inactivity`);
            }
        } catch (e) { console.error(e); }
    }, 60 * 1000);

    // Creates and starts the HTTP server on port 3000
    const server = http.createServer(app).listen(3000, '0.0.0.0', () => {
        console.log('HTTP Express server listening on port 3000');
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const net of interfaces[name]) {
                if (net.family === 'IPv4' && !net.internal) {
                    console.log(`Server available on LAN at: http://${net.address}:3000`);
                }
            }
        }
    });


// Gracefull shutdown on Ctrl+C
    const shutdown = (signal) => {
        console.log(`\n${signal} received. Shutting down gracefully...`);
        server.close(async () => {
            console.log('HTTP server closed');
            await client.close();
            console.log('MongoDB connection closed');
            process.exit(0);
        });
    };

    // Sets up listeners to trigger the shutdown function when the user presses Ctrl+C (SIGINT)
    // or when the system requests termination (SIGTERM)
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
};

startServer().catch(e => console.error('Failed to start server:', e));