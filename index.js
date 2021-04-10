require('dotenv').config();
const Web3 = require('web3');
const web3 = new Web3(
    new Web3.providers.WebsocketProvider(process.env.INFURA_MAIN_DEV)
);

const { mainnet: addresses } = require('./addresses');
const { address: admin } = web3.eth.accounts.wallet.add(process.env.PRIVATE_KEY);
const BigNumber = require('bignumber.js');
const Flashloan = require('./build/contracts/Flashloan.json');

const oneSplitABI = require('./abis/onesplit.json');
const oneSplitAddress = "0xC586BeF4a0992C495Cf22e1aeEE4E446CECDee0E";
// const { getLegosFor, networks } = require("@studydefi/money-legos");
// const legos = getLegosFor(networks.mainnet);
// @studydefi/money-legos did not work properly

const oneSplitContract = new web3.eth.Contract(
    oneSplitABI,
    oneSplitAddress
);

const fromTokens = ['WETH', 'DAI'];
const fromToken = [
    '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // WETH
    '0x6B175474E89094C44Da98b954EedeAC495271d0F'  // DAI
];
const fromTokenDecimals = [18, 18];

const targetTokens = ['WBTC', 'USDT'];
const toToken = [
    '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', // WBTC
    '0xdac17f958d2ee523a2206206994597c13d831ec7'  // USDT
]; 
const toTokenDecimals = [8, 6];
const amount = process.env.TRADE_AMOUNT;

const splitExchanges = [
    "Uniswap",
    "Kyber",
    "Bancor",
    "Oasis",
    "Curve Compound",
    "Curve USDT",
    "Curve Y",
    "Curve Binance",
    "Curve Synthetix",
    "Uniswap Compound",
    "Uniswap CHAI",
    "Uniswap Aave",
    "Mooniswap",
    "Uniswap V2",
    "Uniswap V2 ETH",
    "Uniswap V2 DAI",
    "Uniswap V2 USDC",
    "Curve Pax",
    "Curve renBTC",
    "Curve tBTC",
    "Dforce XSwap",
    "Shell",
    "mStable mUSD",
    "Curve sBTC",
    "Balancer 1",
    "Balancer 2",
    "Balancer 3",
    "Kyber 1",
    "Kyber 2",
    "Kyber 3",
    "Kyber 4"
]

const init = async () => {
    const networkId = await web3.eth.net.getId();
    const flashloan = new web3.eth.Contract(
        Flashloan.abi,
        Flashloan.networks[networkId].address
    );

    let wethPrice;
    const updateEthPrice = async() => {
        const results = await oneSplitContract
            .methods
            .getExpectedReturn(
                '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
                '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
                web3.utils.toBN(web3.utils.toWei('1')).toString(),
                100,
                0
            )
            .call();
        ethPrice = new BigNumber(results.returnAmount).shiftedBy(-6).toString();
        console.log(`ethPrice: ${ethPrice}`);
    }
    await updateEthPrice();
    setInterval(updateEthPrice, 15000);

    let subscription = web3.eth.subscribe('newBlockHeaders', (error, result) => {
        if (!error) {
            // console.log(result);
            return;
        }
        console.error(error);
    })
    .on("connected", subscriptionId => {
        console.log(subscriptionId);
    })
    .on('data', async block => {
        console.log('-------------------------------------------------------------');
        console.log(`New block received. Block # ${block.number}`);
        console.log(`GasLimit: ${block.gasLimit} and Timestamp: ${block.timestamp}`);

        for (let i = 0; i < fromTokens.length; i++) {
            for (let j = 0; j < targetTokens.length; j++) {
                // start seeking opportunities
                console.log(`Trading ${targetTokens[j]}/${fromTokens[i]} ...`);

                let unit = new BigNumber('1').shiftedBy(toTokenDecimals[j]).toString();
                const results = await oneSplitContract
                    .methods
                    .getExpectedReturn(
                        toToken[j],
                        fromToken[i],
                        unit, // per unit, i.e. how much DAI per WBTC
                        100,
                        0
                    )
                    .call();

                // current rate per fromToken
                let unitRate = await new BigNumber(results.returnAmount).shiftedBy(-fromTokenDecimals[i]).toString();
                console.log(`${targetTokens[j]}/${fromTokens[i]}: ${unitRate}`);

                const amountFrom = await new BigNumber(amount).shiftedBy(fromTokenDecimals[i]).toString();

                const oneSplitResult1 = await 
                    // Forward Swap
                    oneSplitContract
                        .methods
                        .getExpectedReturn(
                            fromToken[i],
                            toToken[j],
                            amountFrom, 100, 0
                        )
                    .call()

                // console.log('Forward Swap'); // Forward Swap distribution
                for (let index = 0; index < oneSplitResult1.distribution.length; index++) {
                    if (oneSplitResult1.distribution[index] > 0) {
                        // console.log(splitExchanges[index] + ": " + oneSplitResult1.distribution[index] + "%");
                    }
                }

                const amountTo = await new BigNumber(oneSplitResult1.returnAmount).toString();

                const oneSplitResult2 = await 
                    // Inverse Swap
                    oneSplitContract
                        .methods
                        .getExpectedReturn(
                            toToken[j],
                            fromToken[i],
                            amountTo, 100, 0
                        )
                    .call()

                // console.log('Inverse Swap'); // Inverse Swap distribution
                for (let index = 0; index < oneSplitResult2.distribution.length; index++) {
                    if (oneSplitResult2.distribution[index] > 0) {
                        // console.log(splitExchanges[index] + ": " + oneSplitResult2.distribution[index] + "%");
                    } 
                }

                const oneSplitRates = {
                    buy: new BigNumber(oneSplitResult1.returnAmount * unitRate).shiftedBy(-toTokenDecimals[j]).toString(),
                    sell: new BigNumber(oneSplitResult2.returnAmount).shiftedBy(-fromTokenDecimals[i]).toString()
                }
                console.log(`1inch Exchange ${targetTokens[j]}/${fromTokens[i]}: ${JSON.stringify(oneSplitRates)}`);

                let profit = (oneSplitRates.sell - oneSplitRates.buy);
                // profit needs to be eth price
                if (fromTokens[i] != 'WETH') {
                    profit = profit / ethPrice;
                    console.log(`Profit: ${profit.toString()}`);
                } else {
                    console.log(`Profit: ${profit.toString()}`);
                }

                if (profit > 0) {
                    const tx = flashloan.methods.initiateFlashLoan(
                        addresses.dydx.solo,
                        fromToken[i],
                        toToken[j],
                        amountFrom
                    );

                    const [gasPrice, gasCost] = await Promise.all([
                        web3.eth.getGasPrice(),
                        web3.eth.estimateGas({data: tx.encodeABI()})
                    ]);

                    // a return cost 
                    const txCost = gasCost * gasPrice / 10 ** 18 * 2 * ethPrice;
                    profit = profit - txCost;

                    if (profit > 0) {
                        console.log(`
                            Block # ${block.number}, ${targetTokens[j]}/${fromTokens[i]}
                            Arbitrage opportunity found! Expected profit: ${profit}
                        `);
                        const data = tx.encodeABI();
                        const txData = {
                            from: admin,
                            to: flashloan.options.address,
                            data,
                            gas: gasCost,
                            gasPrice
                        };
                        const receipt = await web3.eth.sendTransaction(txData);
                        console.log(`Transaction hash: ${receipt.transactionHash}`);
                    } else {
                        console.log(`
                            Block # ${block.number}, ${targetTokens[j]}/${fromTokens[i]}
                            Arbitrage opportunity not found. Expected profit: ${profit}
                        `);
                    }
                }
            }
        }
    })
    .on('error', error => {
        console.log(error);
    });
}

init();

