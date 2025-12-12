const https = require('https');
const util = require('util');
const execFile = util.promisify(require('child_process').execFile);
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { MongoClient } = require('mongodb');
const os = require('os');
const express = require('express');
const cors = require('cors');
require('dotenv').config(); // Load environment variables from .env file

const mongoUri = process.env.MONGO_URI;
const serverHostname = process.env.SERVER_HOSTNAME || 'localhost';
const dbName = 'cdcs';
const collectionName = 'packages';

// Agent configuration
const AGENT_PORT = parseInt(process.env.CLIENT_AGENT_PORT || '4001', 10);
const AGENT_API_KEY = process.env.CLIENT_API_KEY;

// Check if client.js is run as root
if (process.getuid && process.getuid() !== 0) {
    console.error('Error: client.js must be run as root for package installation to work.');
    process.exit(1);
}

if (!mongoUri) {
    console.error('Error: MONGO_URI is not defined in the environment.');
    process.exit(1);
}

if (!AGENT_API_KEY) {
    console.error('Error: AGENT_API_KEY is not defined in the environment.');
    process.exit(1);
}

// Function to return MAC address
// Sent back to server when reporting unauthorized packages or logging installs
const getMacAddress = () => {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            // Return the first (primary) non-internal MAC address found
            if (!net.internal && net.mac && net.mac !== '00:00:00:00:00:00') {
                return net.mac;
            }
        }
    }
    return 'unknown';
};

// Function to perform background package check
const performPackageCheck = async () => {
    console.log(`[${new Date().toISOString()}] Running package check...`);
    let client;
    try {
        // Run the shell script to get currently installed packages
        const { stdout } = await execFile(path.join(__dirname, '../juan/default_packages.sh'));
        const scriptPackages = stdout.split('\n').map(x => x.trim()).filter(Boolean);

        // Read the local whitelist file
        const data = await fsp.readFile(path.join(__dirname, '../juan/default_packages.txt'), 'utf8');
        const knownPackages = new Set(data.split('\n').map(x => x.trim()).filter(Boolean));

        // Connect to MongoDB to get the remote whitelist
        client = new MongoClient(mongoUri);
        await client.connect();
        const db = client.db(dbName);
        const collection = db.collection(collectionName);
        const dbPackagesArr = await collection.find({}, { projection: { _id: 0, name: 1 } }).toArray();
        const dbPackages = new Set(dbPackagesArr.map(pkg => pkg.name));

        // Determine which packages are unauthorized
        const newPackages = scriptPackages.filter(pkg => !knownPackages.has(pkg) && !dbPackages.has(pkg));

        let postData;
        let requestPath;

        // If any unauthorized packages found, prepare log to send to server
        if (newPackages.length > 0) {
            console.log(`Found ${newPackages.length} unauthorized packages. Sending report...`);
            const timestamp = new Date().toISOString();
            postData = JSON.stringify({ msg_type: 1001, timestamp, username: os.userInfo().username, mac_address: getMacAddress(), new_packages: newPackages });
            requestPath = '/message';
        }
        // Else, just log as heartbeat
        else {
            console.log('No unauthorized packages found.');
            postData = JSON.stringify({ username: os.userInfo().username, mac_address: getMacAddress() });
            requestPath = '/api/check-in';
        }

        // Send the request to the server
        const options = {
            hostname: serverHostname,
            port: 3000,
            path: requestPath,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            },
            rejectUnauthorized: false
        };

        // Receive reply from server
        const req = https.request(options, (res) => {
            let responseData = '';
            res.on('data', (chunk) => {
                responseData += chunk;
            });
            res.on('end', () => {
                // After successful send, if there are flagged packages run delete script
                if (newPackages.length > 0) {
                    const deleteScript = path.join(__dirname, '../juan/delete_packages.sh');
                    require('child_process').execFile(deleteScript, newPackages, (err, stdout, stderr) => {
                        if (err) {
                            console.error('Error deleting packages:', stderr || err);
                            return;
                        }
                        console.log(stdout);
                    });
                }
            });
        });

        req.on('error', (e) => {
            console.error('Error sending request to server:', e);
        });

        req.write(postData);
        req.end();

    } catch (e) {
        console.error('An error occurred during package check:', e);
    } finally {
        if (client) {
            await client.close();
        }
    }
};

// Function to receive install requests from frontend
const startAgent = () => {
    const app = express();
    let isInstalling = false; // Lock to prevent concurrent installations

    // Configure CORS to allow requests from the frontend
    const corsOptions = {
        origin: true, // Allow requests from the frontend's origin
        methods: ['GET', 'POST'], // Allow only GET and POST methods
        allowedHeaders: ['Content-Type', 'X-API-Key'], // Allow specific headers
        credentials: true, // Allow credentials (if needed)
    };
    app.use(cors(corsOptions));
    app.use(express.json());

    // Returns approved packages from mongodb that are not installed on client
    app.get('/api/available-packages', async (req, res) => {
        try {
            // Get currently installed packages as before
            const { stdout } = await execFile(path.join(__dirname, '../juan/default_packages.sh'));
            const installed = new Set(stdout.split('\n').map(s => s.trim()).filter(Boolean));

            // Fetch approved packages from mongodb
            const client = new MongoClient(mongoUri);
            await client.connect();
            const db = client.db(dbName);
            const dbPackagesArr = await db.collection(collectionName).find({}, { projection: { _id: 0, name: 1 } }).toArray();
            await client.close();

            const approved = dbPackagesArr.map(p => p && p.name).filter(Boolean);

            // Filter out already installed packages
            const notInstalled = approved.filter(pkg => !installed.has(pkg));

            return res.json({ packages: notInstalled });
        } catch (err) {
            console.error('Error in /api/available-packages:', err);
            return res.status(500).json({ error: 'Internal error' });
        }
    });

    // Perform installation requested by frontend after approval
    app.post('/api/install', async (req, res) => {
        if (isInstalling) {
            return res.status(409).json({ error: 'An installation is already in progress.' });
        }

        isInstalling = true;
        console.log('Agent installation lock acquired.');

        try {
            console.log(`Agent received install request from origin: ${req.get('origin')}`);

            const { packageName } = req.body;

            // Connect to MongoDB and check whitelist
            // Prevents hijacking from frontend
            const client = new MongoClient(mongoUri);
            await client.connect();
            const db = client.db(dbName);
            const pkgDoc = await db.collection(collectionName).findOne({ name: packageName });

            if (!pkgDoc) {
                await client.close();
                return res.status(403).json({ error: 'Package not approved for installation' });
            }

            // Execute installation script
            const installScript = path.join(__dirname, '../juan/install_package.sh');
            console.log(`Installing approved package '${packageName}'...`);
            try {
                const { stdout, stderr } = await execFile(installScript, [packageName]);
                if (stderr) console.error('Error:', stderr);

                // Prepare installation log to send to server
                const logDoc = {
                    timestamp: new Date().toISOString(),
                    package: packageName,
                    username: os.userInfo().username || 'unknown',
                    mac_address: getMacAddress(),
                    client_host: os.hostname(),
                    result: 'success'
                };

                // Send log to server's /api/log-install endpoint
                const postData = JSON.stringify(logDoc);
                const options = {
                    hostname: serverHostname,
                    port: 3000,
                    path: '/api/log-install',
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(postData),
                        'X-API-Key': AGENT_API_KEY
                    },
                    rejectUnauthorized: false
                };

                const reqToServer = https.request(options, (srvRes) => {
                    let data = '';
                    srvRes.on('data', (chunk) => (data += chunk));
                    srvRes.on('end', () => {
                        console.log('Agent: log sent to server, response:', srvRes.statusCode, data);
                    });
                });

                reqToServer.on('error', (err) => {
                    console.error('Agent: Error sending log to server:', err);
                });

                reqToServer.write(postData);
                reqToServer.end();

                await client.close();

                // Return explicit success message including package name
                return res.json({ message: `Completed installing '${packageName}' on agent.`, package: packageName });
            } catch (installErr) {
                console.error('Agent: installation failed:', installErr);
                await client.close();

                // Send failed log to server (best-effort)
                const failLog = {
                    timestamp: new Date().toISOString(),
                    package: packageName,
                    username: os.userInfo().username || 'unknown',
                    mac_address: getMacAddress(),
                    client_host: os.hostname(),
                    result: 'failure',
                    error: (installErr && installErr.message) || String(installErr)
                };
                const postData = JSON.stringify(failLog);
                const options = {
                    hostname: serverHostname,
                    port: 3000,
                    path: '/api/log-install',
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(postData),
                        'X-API-Key': AGENT_API_KEY
                    },
                    rejectUnauthorized: false
                };
                const reqToServer = https.request(options, (srvRes) => {
                    srvRes.on('data', () => { });
                    srvRes.on('end', () => { });
                });
                reqToServer.on('error', () => { });
                reqToServer.write(postData);
                reqToServer.end();

                return res.status(500).json({ error: 'Installation failed on agent.', package: packageName });
            }
        } catch (err) {
            console.error('Agent /api/install error:', err);
            return res.status(500).json({ error: 'Internal agent error' });
        } finally {
            isInstalling = false;
            console.log('Agent installation lock released.');
        }
    });

    // Try to start as HTTPS using server cert/key; fallback to HTTP if not available.
    const keyPath = path.join(__dirname, 'server.key');
    const certPath = path.join(__dirname, 'server.cert');

    app.listen(AGENT_PORT, '0.0.0.0', () => {
    console.log(`Agent listening on HTTP port ${AGENT_PORT}`);
});

};

// Periodic package check service
const main = async () => {
    const CHECK_INTERVAL_MINUTES = 1;
    const CHECK_INTERVAL_MS = CHECK_INTERVAL_MINUTES * 60 * 1000;

    startAgent();

    console.log(`Client service started. Package check will run every ${CHECK_INTERVAL_MINUTES} minutes.`);

    // Run the check immediately on startup, and wait for it to complete.
    await performPackageCheck();

    // Schedule the check to run periodically
    setInterval(performPackageCheck, CHECK_INTERVAL_MS);
};

main().catch(e => {
    console.error("A fatal error occurred in the client service:", e);
    process.exit(1);
});
// ...existing code...