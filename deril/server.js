const express = require('express');
const https = require('https');
const fs = require('fs');
const cors = require('cors');
const os = require('os');
const { MongoClient } = require('mongodb');
require('dotenv').config(); // Load environment variables from .env file

const app = express();
app.use(express.json());
app.use(cors());
app.set('json spaces', 2);

const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
    console.error('Error: MONGO_URI is not defined in the .env file.');
    process.exit(1);
}
const dbName = 'cdcs';

const client = new MongoClient(mongoUri);
let db;

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

// --- In-Memory Command Queue (kept for compatibility; server is NOT used to approve installs in this flow) ---
let commandQueue = [];

// --- Authentication Middleware ---
const apiKeys = process.env.API_KEYS || '';
const VALID_API_KEYS = new Set(apiKeys.split(',').filter(Boolean));
if (VALID_API_KEYS.size === 0) {
    console.warn('Warning: No API_KEYS found in .env file. API endpoints will be inaccessible.');
}
const requireApiKey = (req, res, next) => {
    const apiKey = req.get('X-API-Key');
    if (apiKey && VALID_API_KEYS.has(apiKey)) {
        return next();
    }
    res.status(401).json({ error: 'Unauthorized: A valid X-API-Key header is required.' });
};

// Example: endpoint that historically queued installs (kept for compatibility)
app.post('/api/install-package', requireApiKey, async (req, res) => {
    const { packageName } = req.body;
    if (!packageName) {
        return res.status(400).json({ error: 'packageName is required.' });
    }
    console.log(`Received install request for package: ${packageName}. Queuing command.`);
    commandQueue.push({ msg_type: 2001, packageName: packageName });
    res.status(202).json({ message: 'Install command queued successfully.' });
});

// Lightweight check-in endpoint (clients poll)
app.post('/api/check-in', (req, res) => {
    if (commandQueue.length > 0) {
        const command = commandQueue.shift();
        const clientIdentifier = req.body.mac_address || 'unknown';
        console.log(`Sending command to polling client ${clientIdentifier}:`, command);
        const logDoc = {
            timestamp: new Date().toISOString(),
            package: command.packageName,
            username: req.body.username || 'unknown',
            mac_address: clientIdentifier
        };
        db.collection('installation_logs').insertOne(logDoc).catch(e => console.error('Failed to insert log:', e));
        res.json(command);
    } else {
        res.json({ reply: 'OK. No pending commands.' });
    }
});

// Existing message endpoint used by clients to report flagged packages
app.post('/message', async (req, res) => {
    try {
        if (req.body.msg_type === 1001) {
            const { msg_type, ...doc } = req.body;
            const flaggedCollectionRef = db.collection('flagged');
            await flaggedCollectionRef.insertOne(doc);
            console.log('Flagged data inserted into MongoDB:', doc);

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
    } catch (e) {
        console.error('MongoDB error in /message:', e);
        res.status(500).json({ error: 'Failed to process message due to a database error.' });
    }
});

// Read-only endpoints (packages, flagged, employees)
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
createReadOnlyEndpoint('/flagged', 'flagged');
createReadOnlyEndpoint('/employees', 'employees');
createReadOnlyEndpoint('/packages', 'packages');

// NEW: Endpoint to receive installation logs from clients.
// Server's only responsibility in this flow is to record the installation event.
app.post('/api/log-install', requireApiKey, async (req, res) => {
    try {
        const log = req.body || {};
        if (!log.timestamp) {
            log.timestamp = new Date().toISOString();
        }
        await db.collection('installation_logs').insertOne(log);
        console.log('Received installation log from client:', log);
        return res.status(201).json({ message: 'Installation log recorded.' });
    } catch (e) {
        console.error('Failed to insert installation log:', e);
        return res.status(500).json({ error: 'Failed to record installation log.' });
    }
});

// --- Server Startup ---
const startServer = async () => {
    await connectToDatabase();

    const options = {
        key: fs.readFileSync('server.key'),
        cert: fs.readFileSync('server.cert')
    };

    https.createServer(options, app).listen(3000, '0.0.0.0', () => {
        console.log('HTTPS Express server listening on port 3000');
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const net of interfaces[name]) {
                if (net.family === 'IPv4' && !net.internal) {
                    console.log(`Server available on LAN at: https://${net.address}:3000`);
                }
            }
        }
    });
};

startServer().catch(e => {
    console.error('Failed to start server:', e);
    process.exit(1);
});