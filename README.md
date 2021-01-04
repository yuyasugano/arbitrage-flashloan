# arbitrage with flashloan

A sample  application invokes a flashloan in dYdX and a monitoring tool in Node.js.
 
## software version

Ensure your `node` and `truffle` version is higher than mine:
```sh
$ node -v
v13.7.0
$ truffle version
Truffle v5.0.36 (core: 5.0.36)
Solidity v0.5.8 (solc-js)
Node v13.7.0
Web3.js v1.2.1
```
   
## environment variables
 
```
TRADE_AMOUNT=100
WALLET_ADDRESS=0x<your wallet address>
PRIVATE_KEY=<private key>
INFURA_MAIN_URL=wss://mainnet.infura.io/ws/v3/<mainnet infura account>
INFURA_HTTP_URL=https://mainnet.infura.io/v3/<mainnet infura account>
```
 
## setup steps
  
1. Rename `.env.template` to `.env` and fill out required information. 
2. Configure `truffle-config.js` with appropriate parameters such as gas and gasPrice. 
3. Install packages and compile Solidity code.
```sh
npm install
truffle compile
```
4. Migrate the contract to the network
```sh
truffle migrate --network mainnet
```
  
## License

This library is licensed under the MIT License.
