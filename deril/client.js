// ...existing code...
const https = require('https');
const http = require('http');
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

// --- Configuration ---
const mongoUri = process.env.MONGO_URI;
const serverHostname = process.env.SERVER_HOSTNAME || 'localhost';
const dbName = 'cdcs';
const collectionName = 'packages';

// Agent configuration
const AGENT_PORT = parseInt(process.env.CLIENT_AGENT_PORT || '4001', 10);
const AGENT_API_KEY = process.env.CLIENT_API_KEY || process.env.API_KEY || process.env.VITE_API_KEY || '';

// --- Safety checks ---
if (process.getuid && process.getuid() !== 0) {
    console.error('Error: client.js must be run as root for package installation to work.');
    process.exit(1);
}
if (!mongoUri) {
    console.error('Error: MONGO_URI is not defined in the environment.');
    process.exit(1);
}

// --- Helper: get MAC address (existing function) ---
const getMacAddress = () => {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (!net.internal && net.mac && net.mac !== '00:00:00:00:00:00') {
                return net.mac;
            }
        }
    }
    return 'unknown';
};

// --- Existing background package check (unchanged logic) ---
const performPackageCheck = async () => {
    console.log(`[${new Date().toISOString()}] Running package check...`);
    let client;
    try {
        // 1. Run the shell script to get currently installed packages
        const { stdout } = await execFile(path.join(__dirname, '../juan/default_packages.sh'));
        const scriptPackages = stdout.split('\n').map(x => x.trim()).filter(Boolean);

        // 2. Read the local whitelist file
        const data = await fsp.readFile(path.join(__dirname, '../juan/default_packages.txt'), 'utf8');
        const knownPackages = new Set(data.split('\n').map(x => x.trim()).filter(Boolean));

        // 3. Connect to MongoDB to get the remote whitelist
        client = new MongoClient(mongoUri);
        await client.connect();
        const db = client.db(dbName);
        const collection = db.collection(collectionName);
        const dbPackagesArr = await collection.find({}, { projection: { _id: 0, name: 1 } }).toArray();
        const dbPackages = new Set(dbPackagesArr.map(pkg => pkg.name));

        // 4. Determine which packages are unauthorized
        const newPackages = scriptPackages.filter(pkg => !knownPackages.has(pkg) && !dbPackages.has(pkg));

        let postData;
        let requestPath;

        if (newPackages.length > 0) {
            console.log(`Found ${newPackages.length} unauthorized packages. Sending report.`);
            const timestamp = new Date().toISOString();
            postData = JSON.stringify({ msg_type: 1001, timestamp, username: os.userInfo().username, mac_address: getMacAddress(), new_packages: newPackages });
            requestPath = '/message';
        } else {
            console.log('No unauthorized packages found. Polling for commands.');
            postData = JSON.stringify({ username: os.userInfo().username, mac_address: getMacAddress() });
            requestPath = '/api/check-in';
        }

        // 5. Send the request to the server
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

        const req = https.request(options, (res) => {
            let responseData = '';
            res.on('data', (chunk) => {
                responseData += chunk;
            });
            res.on('end', async () => {
                // eslint-disable-next-line no-console
                console.log('Received from server:', responseData);

                try {
                    const serverResponse = JSON.parse(responseData);
                    // Handle package installation request from server
                    if (serverResponse.msg_type === 2001 && serverResponse.packageName) {
                        console.log(`Received install command for package: ${serverResponse.packageName}`);

                        // Security Check: Verify the package is in the approved list in DB
                        const isWhitelisted = dbPackages.has(serverResponse.packageName);

                        if (isWhitelisted) {
                            console.log(`Package '${serverResponse.packageName}' is whitelisted. Proceeding with installation.`);
                            const installScript = path.join(__dirname, '../juan/install_package.sh');
                            require('child_process').execFile(installScript, [serverResponse.packageName], (err, stdout, stderr) => {
                                if (err) {
                                    console.error(`Error running install_package.sh for ${serverResponse.packageName}:`, stderr || err);
                                    return;
                                }
                                console.log(`install_package.sh output for ${serverResponse.packageName}:`, stdout);
                            });
                        } else {
                            console.error(`Security Alert: Received install command for non-whitelisted package '${serverResponse.packageName}'. Installation blocked.`);
                        }
                    }
                } catch (parseError) { /* Not a JSON command, likely a simple ack. Ignore. */ }

                // After successful send, if there are flagged packages run delete script as before
                if (newPackages.length > 0) {
                    const deleteScript = path.join(__dirname, '../juan/delete_packages.sh');
                    require('child_process').execFile(deleteScript, newPackages, (err, stdout, stderr) => {
                        if (err) {
                            console.error('Error running delete_packages.sh:', stderr || err);
                            return;
                        }
                        console.log('delete_packages.sh output:', stdout);
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

// --- Agent HTTP(S) API: receives install requests from frontend ---
const startAgent = () => {
    const app = express();

    // Configure CORS to allow requests from the frontend
    const corsOptions = {
        origin: 'https://25.1.228.166:3000', // Allow requests from the frontend's origin
        methods: ['GET', 'POST'], // Allow only GET and POST methods
        allowedHeaders: ['Content-Type', 'X-API-Key'], // Allow specific headers
        credentials: true, // Allow credentials (if needed)
    };
    app.use(cors(corsOptions));
    app.use(express.json());

    // POST /api/install
    app.post('/api/install', async (req, res) => {
        try {
            // API key validation
            const providedKey = req.get('X-API-Key') || '';
            if (!AGENT_API_KEY || providedKey !== AGENT_API_KEY) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const { packageName } = req.body || {};
            if (!packageName) {
                return res.status(400).json({ error: 'packageName is required' });
            }

            // Connect to MongoDB and check whitelist
            const client = new MongoClient(mongoUri);
            await client.connect();
            const db = client.db(dbName);
            const pkgDoc = await db.collection(collectionName).findOne({ name: packageName });

            if (!pkgDoc) {
                await client.close();
                return res.status(403).json({ error: 'Package not approved for installation' });
            }

            // Execute installation script (runs as root)
            const installScript = path.join(__dirname, '../juan/install_package.sh');
            console.log(`Agent: Installing approved package '${packageName}' via ${installScript}...`);
            try {
                const { stdout, stderr } = await execFile(installScript, [packageName]);
                console.log('install stdout:', stdout);
                if (stderr) console.error('install stderr:', stderr);

                // Prepare installation log to send to central server
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

                return res.json({ message: `Installation of '${packageName}' completed successfully on agent.` });
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

                return res.status(500).json({ error: 'Installation failed on agent.' });
            }
        } catch (err) {
            console.error('Agent /api/install error:', err);
            return res.status(500).json({ error: 'Internal agent error' });
        }
    });

    // Try to start as HTTPS using server cert/key; fallback to HTTP if not available.
    const keyPath = path.join(__dirname, 'server.key');
    const certPath = path.join(__dirname, 'server.cert');

    try {
        const key = fs.readFileSync(keyPath);
        const cert = fs.readFileSync(certPath);
        const options = { key, cert };

        https.createServer(options, app).listen(AGENT_PORT, '0.0.0.0', () => {
            console.log(`Client agent listening over HTTPS for install requests on port ${AGENT_PORT}`);
        });
    } catch (e) {
        console.warn('Could not start HTTPS agent (missing/invalid cert or key). Falling back to HTTP. Error:', e.message);
        app.listen(AGENT_PORT, '0.0.0.0', () => {
            console.log(`Client agent listening over HTTP for install requests on port ${AGENT_PORT}`);
        });
    }
};

// --- Service Execution ---
const main = async () => {
    const CHECK_INTERVAL_MINUTES = 1;
    const CHECK_INTERVAL_MS = CHECK_INTERVAL_MINUTES * 60 * 1000;

    // Start HTTP(S) agent
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