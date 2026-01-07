const https = require('https'); 
const util = require('util'); // Loads a built-in tool with helpful functions.
const execFile = util.promisify(require('child_process').execFile); // Loads a tool to run external programs/scripts and makes it easier to use.
const { execSync } = require('child_process'); // Loads another tool to run external programs, but this one waits for the program to finish.
const fs = require('fs');
const fsp = fs.promises; // Creates a version of the file tool that is easier to work with for asynchronous tasks.
const path = require('path');
const { MongoClient } = require('mongodb');
const os = require('os');
const express = require('express');
const cors = require('cors'); // Loads a tool to allow web pages from other domains to make requests to our server.
require('dotenv').config();

// --- Configuration ---
const mongoUri = process.env.MONGO_URI; 
const serverHostname = process.env.SERVER_HOSTNAME || 'localhost'; 
const dbName = 'cdcs'; 
const collectionName = 'packages'; 

// --- MongoDB Client ---
let db; 
const mongoClient = new MongoClient(mongoUri);

// Agent configuration
const AGENT_PORT = parseInt(process.env.CLIENT_AGENT_PORT || '4001', 10); 
const AGENT_API_KEY = process.env.CLIENT_API_KEY;

// Check if client.js is run as root
if (process.getuid && process.getuid() !== 0) { 
    console.error('Error: client.js must be run as root for package installation to work.'); 
    process.exit(1); 
}

if (!mongoUri) { // Checks if we failed to get the database address.
    console.error('Error: MONGO_URI is not defined in the environment.'); 
    process.exit(1); 
}

if (!AGENT_API_KEY) { // Checks if we failed to get the secret API key.
    console.error('Error: AGENT_API_KEY is not defined in the environment.'); 
    process.exit(1); 
}

const getActualUser = () => { // Defines a reusable task (function) to find the real user's name.
    // Since script run as sudo, otherwise returned username will always be "root"
    const result = execSync( 
        "cut -d: -f1,3 /etc/passwd | egrep ':[0-9]{4}$' | cut -d: -f1 | grep -v 'admin'", // The specific command to find the standard user.
        { encoding: 'utf8' } // Tells the command to return the result as text.
    ).trim();

    return result;
};

// Function to return MAC address
const getMacAddress = () => {
    const nets = os.networkInterfaces(); // Gets a list of all network connections on the computer.
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) { // Loops through the details of each connection.
            if (!net.internal && net.mac && net.mac !== '00:00:00:00:00:00') { // Checks if it's a real, physical network card with a valid address.
                return net.mac;
            }
        }
    }
    return 'unknown';
};

// Cache values that don't change during runtime for efficiency
const ACTUAL_USER = getActualUser(); 
const MAC_ADDRESS = getMacAddress();
/**
 * Sends a request to the central server.
 * @param {string} path - The request path (e.g., '/api/check-in').
 * @param {'POST' | 'GET'} method - The HTTP method.
 * @param {object} [data] - The JSON payload to send.
 * @param {object} [extraHeaders] - Additional headers to include.
 * @returns {Promise<{statusCode: number, body: string}>} A promise that resolves with the server's response.
 */
const sendToServer = (path, method, data, extraHeaders = {}) => {
    return new Promise((resolve, reject) => { // Creates a special object (a Promise) that represents a future result.
        const postData = data ? JSON.stringify(data) : '';
        const options = { // Sets up the details for the web request.
            hostname: serverHostname, 
            port: 3000, 
            path,
            method,
            headers: { 
                'Content-Type': 'application/json', 
                'Content-Length': Buffer.byteLength(postData), 
                ...extraHeaders,
            },
 
            rejectUnauthorized: false, // Tells the system to trust the server even if its security certificate isn't perfect (for testing).
        };

        const req = https.request(options, (res) => {
            let responseBody = '';
            res.on('data', (chunk) => { responseBody += chunk; });
            res.on('end', () => resolve({ statusCode: res.statusCode, body: responseBody })); // When the full reply has arrived, complete the task with the status and the reply content.
        });

        req.on('error', reject);
        req.write(postData); 
        req.end();
    });
};

// Function to perform background package check
const performPackageCheck = async () => { 
    console.log(`[${new Date().toISOString()}] Running package check...`); 
    try {
        const { stdout } = await execFile(path.join(__dirname, '../juan/default_packages.sh'));
        const scriptPackages = stdout.split('\n').map(x => x.trim()).filter(Boolean); // Takes the script's text output and turns it into a clean list of package names.

        // Read the local whitelist file
        const data = await fsp.readFile(path.join(__dirname, '../juan/default_packages.txt'), 'utf8'); 
        const knownPackages = new Set(data.split('\n').map(x => x.trim()).filter(Boolean)); 

        // Get the remote whitelist from MongoDB
        const collection = db.collection(collectionName); 
        const dbPackagesArr = await collection.find({}, { projection: { _id: 0, name: 1 } }).toArray(); 
        const dbPackages = new Set(dbPackagesArr.map(pkg => pkg.name)); 
        // Determine which packages are unauthorized
        const newPackages = scriptPackages.filter(pkg => !knownPackages.has(pkg) && !dbPackages.has(pkg)); 

        if (newPackages.length > 0) { // Checks if we found any unauthorized packages.
            console.log(`Found ${newPackages.length} unauthorized packages. Sending report...`); 
            const report = { 
                msg_type: 1001, 
                timestamp: new Date().toISOString(), 
                username: ACTUAL_USER, 
                mac_address: MAC_ADDRESS, 
                new_packages: newPackages, 
            };
            const { statusCode } = await sendToServer('/message', 'POST', report); 
            // Only delete packages if the server acknowledged the report successfully.
            if (statusCode >= 200 && statusCode < 300) {
                console.log('Server acknowledged report. Deleting unauthorized packages...'); 
                const deleteScript = path.join(__dirname, '../juan/delete_packages.sh'); 
                const { stdout, stderr } = await execFile(deleteScript, newPackages); 
                if (stderr) console.error('Error deleting packages:', stderr); 
                if (stdout) console.log('Deletion script output:', stdout); 
            } else { 
                console.error(`Server responded with status ${statusCode}. Will not delete packages.`); 
            }
        } else { // If no unauthorized packages were found.
            console.log('No unauthorized packages found.'); 
            const heartbeat = { msg_type: 1001, 
                timestamp: new Date().toISOString(), 
                username: ACTUAL_USER, 
                mac_address: MAC_ADDRESS}; 
            await sendToServer('/api/check-in', 'POST', heartbeat); 
        }
    } catch (e) { 
        console.error('An error occurred during package check:', e); 
    }
};

// Function to receive install requests from frontend
const startAgent = () => { 
    const app = express(); 
    let isInstalling = false;

    // Configure CORS to allow requests from the frontend
    const corsOptions = { 
        origin: true, // Allows requests from the website that the user is on.
        methods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type', 'X-API-Key'],
        credentials: true, // Allows the browser to send cookies or other credentials.
    };
    app.use(cors(corsOptions));
    app.use(express.json());

    // Returns approved packages from mongodb that are not installed on client
    app.get('/api/available-packages', async (req, res) => { 
        try {
            // Get currently installed packages as before
            const { stdout } = await execFile(path.join(__dirname, '../juan/default_packages.sh')); 
            const installed = new Set(stdout.split('\n').map(s => s.trim()).filter(Boolean)); 
            // Fetch approved packages from MongoDB
            const approvedPackages = await db.collection(collectionName).find({}).toArray();

            // Filter out already installed packages
            const notInstalled = approvedPackages.filter(pkg => pkg && pkg.name && !installed.has(pkg.name));

            return res.json({ packages: notInstalled });
        } catch (err) {
            console.error('Error in /api/available-packages:', err); 
            return res.status(500).json({ error: 'Internal error' });
        }
    });

    const logInstallation = async (packageName, result, installErr = null) => { // Defines a reusable task to log the result of an installation.
        const logDoc = {
            timestamp: new Date().toISOString(), 
            package: packageName, 
            username: ACTUAL_USER, 
            mac_address: MAC_ADDRESS, 
            client_host: os.hostname(), 
            result,
        };
        if (installErr) { 
            logDoc.error = (installErr && installErr.message) || String(installErr);
        }

        try { 
            const { statusCode, body } = await sendToServer( // Sends the log to the main server.
                '/api/log-install', 
                'POST', 
                logDoc,
                { 'X-API-Key': AGENT_API_KEY } 
            );
            console.log(`Agent: log sent to server for package '${packageName}', response:`, statusCode, body); 
        } catch (err) { 
            console.error('Agent: Error sending log to server:', err);
        }
    };

    // Perform installation requested by frontend after approval
    app.post('/api/install', async (req, res) => {
        if (isInstalling) {
            return res.status(409).json({ error: 'An installation is already in progress.' });
        }

        const { packageName } = req.body;
        if (!packageName) {
            return res.status(400).json({ error: 'packageName is required.' });
        }

        isInstalling = true; 
        console.log('Agent installation lock acquired.');

        try { 
            console.log(`Agent received install request for '${packageName}' from origin: ${req.get('origin')}`); 

            const pkgDoc = await db.collection(collectionName).findOne({ name: packageName }); 

            if (!pkgDoc) {
                return res.status(403).json({ error: 'Package not approved for installation' });
            }

            // Execute installation script
            const installScript = path.join(__dirname, '../juan/install_package.sh'); 
            console.log(`Installing approved package '${packageName}'...`); 
            await execFile(installScript, [packageName]); 

            console.log(`Successfully installed '${packageName}'.`); 
            logInstallation(packageName, 'success'); 

            return res.json({ message: `Completed installing '${packageName}' on agent.`, package: packageName }); 
        } catch (err) {
            console.error(`Agent: error during installation process for '${packageName}':`, err); 
            logInstallation(packageName, 'failure', err); 

            return res.status(500).json({ error: 'Installation failed on agent.', package: packageName, details: err.message }); 
        } finally { 
            isInstalling = false; 
            console.log('Agent installation lock released.');
        }
    });

    // Forwards a support ticket request to the server
    app.post('/api/ticket', async (req, res) => {
        try {
            const { subject, description } = req.body || {}; // Gets the ticket's subject and description from the request.
            if (!subject || !description) { 
                return res.status(400).json({ error: 'subject and description are required' }); 
            }

            // Build ticket payload for server
            const ticket = { 
                subject, 
                description, 
                timestamp: new Date().toISOString(), 
                username: ACTUAL_USER, 
                mac_address: MAC_ADDRESS, 
                client_host: os.hostname(),
            };

            const { statusCode, body } = await sendToServer( // Sends the ticket to the main server.
                '/api/tickets', 
                'POST', 
                ticket, 
                { 'X-API-Key': AGENT_API_KEY }
            );

            if (statusCode >= 200 && statusCode < 300) { // Checks if the server replied with a success code.
                return res.status(201).json({ message: 'Ticket forwarded to server' }); 
            } else { 
                console.error('Agent: server ticket forward failed:', statusCode, body); 
                return res.status(502).json({ error: 'Failed to forward ticket to server', serverStatus: statusCode, serverBody: body }); 
            }
        } catch (err) { 
            console.error('Agent: Error forwarding ticket to server:', err); 
            return res.status(502).json({ error: 'Error forwarding ticket to server', detail: err.message || String(err) }); 
        }
    });

    // Try to start as HTTPS using server cert/key; fallback to HTTP if not available.
    const keyPath = path.join(__dirname, 'server.key'); 
    const certPath = path.join(__dirname, 'server.cert'); 

    app.listen(AGENT_PORT, '0.0.0.0', () => { 
    console.log(`Agent listening on HTTP port ${AGENT_PORT}`);
});

};

async function connectToDb() { // Defines a task to connect to the database.
    try { 
        await mongoClient.connect(); 
        db = mongoClient.db(dbName); 
        console.log('Successfully connected to MongoDB.'); 
    } catch (err) { 
        console.error('Failed to connect to MongoDB. Exiting.', err); 
        process.exit(1); 
    }
}

// Periodic package check service
const main = async () => { 
    const CHECK_INTERVAL_MINUTES = 1; 
    const CHECK_INTERVAL_MS = CHECK_INTERVAL_MINUTES * 60 * 1000;

    await connectToDb(); 

    // Start the agent API server
    startAgent();

    console.log(`Client service started. Package check will run every ${CHECK_INTERVAL_MINUTES} minutes.`);

    await performPackageCheck();

    setInterval(performPackageCheck, CHECK_INTERVAL_MS);

    const shutdown = async (signal) => { // Defines a task for shutting down the script cleanly.
        console.log(`\n${signal} received. Shutting down client service...`); 
        await mongoClient.close(); 
        process.exit(0); 
    };
    process.on('SIGINT', () => shutdown('SIGINT')); 
    process.on('SIGTERM', () => shutdown('SIGTERM')); 
};

main().catch(e => { 
    console.error("A fatal error occurred in the client service:", e); 
    process.exit(1); 
});