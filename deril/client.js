const https = require('https');
const util = require('util');
const execFile = util.promisify(require('child_process').execFile);
const fs = require('fs').promises;
const path = require('path');
const { MongoClient } = require('mongodb');
const os = require('os');
require('dotenv').config(); // Load environment variables from .env file

// MongoDB Atlas connection URI and database/collection names
const mongoUri = process.env.MONGO_URI;
const serverHostname = process.env.SERVER_HOSTNAME;

// --- Security Check ---
// Ensure this script is running as root to delete packages.
if (process.getuid() !== 0) {
    console.error('Error: This script must be run as root to delete packages.');
    process.exit(1);
}
if (!mongoUri || !serverHostname) {
    console.error('Error: MONGO_URI and/or SERVER_HOSTNAME are not defined in the .env file.');
    process.exit(1);
}
const dbName = 'cdcs'; // <-- Replace with your DB name
const collectionName = 'packages';

const performPackageCheck = async () => {
    console.log(`[${new Date().toISOString()}] Running package check...`);
    let client;
    try {
        // 1. Run the shell script to get currently installed packages
        const { stdout } = await execFile(path.join(__dirname, '../juan/default_packages.sh'));
        const scriptPackages = stdout.split('\n').map(x => x.trim()).filter(Boolean);

        // 2. Read the local whitelist file
        const data = await fs.readFile(path.join(__dirname, '../juan/default_packages.txt'), 'utf8');
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
            // If unauthorized packages are found, prepare a full report for the /message endpoint.
            console.log(`Found ${newPackages.length} unauthorized packages. Sending report.`);
            const timestamp = new Date().toISOString();
            postData = JSON.stringify({ msg_type: 1001, timestamp, username: os.userInfo().username, mac_address: getMacAddress(), new_packages: newPackages });
            requestPath = '/message';
        } else {
            // If the system is clean, prepare a lightweight check-in for the /api/check-in endpoint.
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
                            // We don't await this, as installation can take time. It runs in the background.
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

                // After successful send, run delete_packages.sh with any flagged packages
                if (newPackages.length > 0) {
                    const deleteScript = path.join(__dirname, '../juan/delete_packages.sh');
                    // This also runs in the background.
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

const getMacAddress = () => {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
            if (!net.internal && net.mac && net.mac !== '00:00:00:00:00:00') {
                return net.mac;
            }
        }
    }
    return 'unknown';
};

// --- Service Execution ---
const main = async () => {
    const CHECK_INTERVAL_MINUTES = 1;
    const CHECK_INTERVAL_MS = CHECK_INTERVAL_MINUTES * 60 * 1000;

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
