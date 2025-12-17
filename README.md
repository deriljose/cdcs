# Corporate Device Control Suite

## How to run

### Prerequisites

`node.js`, `npm`, `python3` and `pip` need to be installed.

Ensure that `.env`, `server.cert` and `server.key` are present in the folder `deril`. `.env` should contain

- `MONGO_URI`: Connection string to MongoDB Atlas or Compass
- `API_KEYS`: A comma-separated array of valid API keys accessed by the server
- `SERVER_HOSTNAME`: IP address of the server
- `CLIENT_API_KEY`: An API key that is already present in `API_KEYS`

`.env.local` should be present in the folders `evana/server_frontend`. It should contain

- `VITE_API_URL`: IP address of the server
- `VITE_API_KEY`: An API key that is already present in `API_KEYS`

Both server and client need to be on the same network, either by having both devices on the same LAN or via VPN. Route traffic through TCP instead of UDP for reliable communication.

```
sudo ufw deny in proto udp from any to any
sudo ufw deny out proto udp from any to any
sudo ufw enable
```

### Server

#### Backend

```bash
cd suhail
pip install joblib scikit-learn==1.6.1 --break-system-package
cd ..
cd deril
npm install
node server.js
```

#### Frontend

```bash
cd evana/server_frontend/src
npm install
npm run dev
```

### Client

#### Backend

```bash
cd deril
sudo node client.js
```

#### Frontend

```bash
cd evana/client_frontend/src
npm install
npm run dev
```
