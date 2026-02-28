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

NVM needs to be installed for the latest Node.js version.

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash
source ~/.bashrc
nvm install node
```

Some packages nay not be available in the default repos, so these repos need to be added manually.

**Google Chrome**

```bash
wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/google-chrome.gpg
echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" | sudo tee /etc/apt/sources.list.d/google-chrome.list
```

**MongoDB**

```bash
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
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
---

## Local Git + SSH Setup (Development)

This section describes how a local Git server was configured using SSH so repositories can be cloned via IP address instead of GitHub.

### 1. Install and Enable SSH

```bash
sudo apt update
sudo apt install openssh-server
sudo systemctl start ssh
sudo systemctl enable ssh
sudo systemctl status ssh
```

### 2. Find Server IP Address

```bash
ip a
```

Example:

```
192.168.222.128
```

### 3. Create Git Server User

```bash
sudo adduser git
```

### 4. Create Git Repository (Server Side)

```bash
su - git
mkdir repos
cd repos
git init --bare sample.git
exit
```

### 5. Test SSH Connection

```bash
ssh git@<SERVER_IP>
```

### 6. Clone Repository Using IP Address

```bash
git clone git@<SERVER_IP>:/home/git/repos/sample.git
```

### 7. Repository Access Control (Basic)

Restrict access to owner:

```bash
sudo chmod 700 /home/git/repos/sample.git
```

Allow specific users via group:

```bash
sudo chgrp git /home/git/repos/sample.git
sudo chmod 770 /home/git/repos/sample.git
sudo usermod -aG git <username>
```

