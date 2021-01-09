require('dotenv').config();
const Web3 = require('web3');
const web3 = new Web3(
    new Web3.providers.WebsocketProvider(process.env.INFURA_MAIN_DEV)
);

const { mainnet: addresses } = require('./addresses');
const { address: admin } = web3.eth.accounts.wallet.add(process.env.PRIVATE_KEY);
const BigNumber = require('bignumber.js');
BigNumber.config({
    DECIMAL_PLACES: 32,
    ROUNDING_MODE: BigNumber.ROUND_UP
});
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

const fromTokens = ['WETH', 'DAI', 'USDC'];
const fromToken = [
    '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // WETH
    '0x6B175474E89094C44Da98b954EedeAC495271d0F', // DAI
    '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'  // USDC
];
const fromTokenDecimals = [18, 18, 18];

const targetTokens = ['WBTC', 'USDT'];
const toToken = [
    '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', // WBTC
    '0xdac17f958d2ee523a2206206994597c13d831ec7'  // USDT
]; 
const toTokenDecimals = [8, 6];
const amount = process.env.TRADE_AMOUNT;
// const amountFrom = new BigNumber(amount).shiftedBy(fromTokenDecimals).toString();
// const amountTo = new BigNumber(amount * ethPrice).shiftedBy(toTokenDecimals).toString();

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

    // obtain 1 weth price per USDC, why weth? dYdX support WETH not ETH
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
                console.log(`Trading ${targetTokens[j]}/${fromTokens[i]} ...`);

                // obtain the rate for toToken per fromToken
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

                // obtain the token price per 1 unit of fromToken
                let unitRate = new BigNumber(results.returnAmount).shiftedBy(-fromTokenDecimals[i]).toString();
                console.log(`${targetTokens[j]}/${fromTokens[i]}: ${unitRate}`);

                let amountFrom;
                amountFrom = web3.utils.toBN(web3.utils.toWei(amount)).toString(); // stablecoin only
                // amountFrom = new BigNumber(amount).shiftedBy(fromTokenDecimals[i]).toString();

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

                console.log('Forward Swap'); // Forward Swap distribution
                for (let index = 0; index < oneSplitResult1.distribution.length; index++) {
                    if (oneSplitResult1.distribution[index] > 0) {
                        console.log(splitExchanges[index] + ": " + oneSplitResult1.distribution[index] + "%");
                    }
                }

                let amountTo;
                const returnAmount = oneSplitResult1.returnAmount;
                amountTo = web3.utils.toBN(returnAmount.toString());

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

                console.log('Inverse Swap'); // Inverse Swap distribution
                for (let index = 0; index < oneSplitResult2.distribution.length; index++) {
                    if (oneSplitResult2.distribution[index] > 0) {
                        console.log(splitExchanges[index] + ": " + oneSplitResult2.distribution[index] + "%");
                    } 
                }

                const oneSplitRates = {
                    buy: new BigNumber(oneSplitResult1.returnAmount * unitRate).shiftedBy(-toTokenDecimals[j]).toString(),
                    sell: new BigNumber(oneSplitResult2.returnAmount).shiftedBy(-fromTokenDecimals[i]).toString()
                }
                console.log(`1inch Exchange ${targetTokens[j]}/${fromTokens[i]}: ${JSON.stringify(oneSplitRates)}`);

                let [gasPrice, gasCost] = await Promise.all([
                    web3.eth.getGasPrice(),
                    200000 // a temporary gasLimit, need to adjust based on a transaction
                ]);
                gasPrice = parseInt(gasPrice) + 15000000000; // prioritize a tx in mempool
                console.log(`gasPrice: ${gasPrice}`);
                console.log(`gasCost: ${gasCost}`);
                
                const txCost = gasCost * gasPrice / 10 ** 18 * 2 * ethPrice; // a round trip
                const profit = (oneSplitRates.sell - oneSplitRates.buy) - txCost;
                console.log(`profit: ${profit}`);

                if (profit > 0) {
                    console.log(`Block # ${block.number}, ${targetTokens[j]}/${fromTokens[i]}: Arbitrage opportunity found! Expected profit: ${profit}`);
                } else {
                    console.log(`Block # ${block.number}, ${targetTokens[j]}/${fromTokens[i]}: Arbitrage opportunity not found. Expected profit: ${profit}`);
                }
            }
        }
    })
    .on('error', error => {
        console.log(error);
    });
}

init();

