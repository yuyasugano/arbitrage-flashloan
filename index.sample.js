require('dotenv').config();
const Web3 = require('web3');
const web3 = new Web3(
    new Web3.providers.WebsocketProvider(process.env.INFURA_MAIN_URL)
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

const fromToken = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'; // Ether
const fromTokenDecimals = 18;
const targetTokens = ['USDC'];
const toToken = [
    '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' // USDC
]; 
const toTokenDecimals = [6];
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
    const flashloan = new web3.eth.Contract(
        Flashloan.abi,
        Flashloan.networks[networkId].address
    );

    // obtain 1 eth price per USDC
    let ethPrice;
    const updateEthPrice = async() => {
        const results = await oneSplitContract
            .methods
            .getExpectedReturn(
                '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
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

        for (let i = 0; i < targetTokens.length; i++) {
            console.log(`Trading ${targetTokens[i]} ...`);

            let amountFrom;
            amountFrom = web3.utils.toBN(web3.utils.toWei(amount)).toString();

            const oneSplitResult1 = await 
                // Forward Swap
                oneSplitContract
                    .methods
                    .getExpectedReturn(
                        fromToken,
                        toToken[i],
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
                        toToken[i],
                        fromToken,
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
                buy: new BigNumber(oneSplitResult1.returnAmount).shiftedBy(-toTokenDecimals[i]).toString(),
                sell: new BigNumber(oneSplitResult2.returnAmount * ethPrice).shiftedBy(-fromTokenDecimals).toString()
            }
            console.log(`1inch Exchange ${targetTokens[i]}/ETH: ${JSON.stringify(oneSplitRates)}`);

            const tx = flashloan.methods.initiateFlashLoan(
                addresses.dydx.solo,
                addresses.tokens.weth,
                toToken[i],
                amountFrom
            );
            const [gasPrice, gasCost] = await Promise.all([
                web3.eth.getGasPrice(),
                web3.eth.estimateGas({data: tx.encodeABI()})
            ]);
                
            const txCost = gasCost * gasPrice / 10 ** 18 * ethPrice;
            const profit = (oneSplitRates.sell - oneSplitRates.buy) - txCost;

            if (profit > 0) {
                console.log('Arbitrage opportunity found!');
                console.log(`Expected profit: ${profit}`);

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
                console.log('Arbitrage opportunity not found.');
            }
        }
    })
    .on('error', error => {
        console.log(error);
    });
}

init();

