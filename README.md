# Corporate Device Control Suite

## How to run

### Prerequisites

`node.js` and `npm` need to be installed.

Ensure that `.env`, `server.cert` and `server.key` are present in the folder `deril`. Within the `env` file, set the `SERVER_HOSTNAME` variable. Both server and client need to be on the same network.

### Running

```bash
git clone https://github.com/svhl/cdcs
cd cdcs/deril
npm install
node server.js
sudo node client.js
```
