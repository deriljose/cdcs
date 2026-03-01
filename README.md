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

## Local Git + SSH Setup

This section describes how a local Git server was configured using SSH so repositories can be cloned via IP address instead of GitHub.

### Enable SSH and initialize Git

On the server,

```bash
sudo apt update
sudo apt install openssh-server -u
sudo systemctl start ssh
sudo systemctl enable ssh
```

Find server IP Address.

```bash
ip a
```

Initialize Git.

```
sudo adduser --disabled-password --gecos "" git
sudo su - git
mkdir .ssh
chmod 700 .ssh
touch .ssh/authorized_keys
chmod 600 .ssh/authorized_keys
mkdir repos
```

### Generate SSH key

On the client,

```bash
ssh-keygen -t ed25519 -f ~/.ssh/git_key -N ""
cat ~/.ssh/git_key.pub
```

Remember this key.

### Gatekeeper script

On the server, create `/home/git/check-access.sh` and `/home/git/permissions.txt`. Give execution permission with

```bash
sudo chmod +x /home/git/check-access.sh
```

In the file `/home/git/.ssh/authorized_keys`, add

```
command="/home/git/check-access.sh client_a",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty [PUBLIC_KEY]
```

where `[PUBLIC_KEY]` is the key from above.

### Repo operations

On the client, clone a repo with

```bash
GIT_SSH_COMMAND="ssh -i ~/.ssh/git_key" git clone git@[SERVER_IP]:repos/repo.git
```
