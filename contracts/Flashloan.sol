pragma solidity ^0.5.0;
pragma experimental ABIEncoderV2;

import "@studydefi/money-legos/dydx/contracts/DydxFlashloanBase.sol";
import "@studydefi/money-legos/dydx/contracts/ICallee.sol";
import "@studydefi/money-legos/onesplit/contracts/IOneSplit.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./IWeth.sol";

contract Flashloan is ICallee, DydxFlashloanBase {

    struct Arbitrage {
        address source;
        address destination;
        uint256 repayAmount;
    }

    address beneficiary;

    event NewArbitrage(
        uint256 settlement,
        uint256 profit,
        uint256 date
    );

    constructor (
        address beneficiaryAddress
    ) public {
        beneficiary = beneficiaryAddress;
    }

    address constant OneSplitAddress = 0xC586BeF4a0992C495Cf22e1aeEE4E446CECDee0E;

    // https://money-legos.studydefi.com/#/dydx?id=flashloan-logic-solidity
    function _swap(
        address from,
        address to,
        uint256 amountWei
    ) internal returns (uint256) 
    {
        IERC20 fromIERC20 = IERC20(from);
        IERC20 toIERC20 = IERC20(to);

        (uint256 returnAmount, uint256[] memory distribution) = IOneSplit(
            OneSplitAddress
        ).getExpectedReturn(
            fromIERC20,
            toIERC20,
            amountWei,
            100,
            0
        );

        IOneSplit(OneSplitAddress).swap(
            fromIERC20,
            toIERC20,
            amountWei,
            returnAmount,
            distribution,
            0
        );

        return returnAmount;
    }

    // This is the function that will be called postLoan
    // i.e. Encode the logic to handle your flashloaned funds here
    function callFunction(
        address sender,
        Account.Info memory account,
        bytes memory data
    ) public 
    {
        Arbitrage memory ar = abi.decode(data, (Arbitrage));
        uint256 balanceLoanedToken = IERC20(ar.source).balanceOf(address(this));

        // TODO: Encode your logic here
        // E.g. arbitrage, liquidate accounts, etc
        // revert("Hello, you haven't encoded your logic");
        uint256 returnAmount = _swap(ar.source, ar.destination, balanceLoanedToken);
        uint256 settleAmount = _swap(ar.destination, ar.source, returnAmount);

        // Note that you can ignore the line below
        // if your dydx account (this contract in this case)
        // has deposited at least ~2 Wei of assets into the account
        // to balance out the collaterization ratio
        require(
            IERC20(ar.source).balanceOf(address(this)) >= ar.repayAmount,
            "Not enough funds to repay dYdX loans back!"
        );

        uint256 profit = IERC20(ar.source).balanceOf(address(this)) - ar.repayAmount;
        IERC20(ar.source).transfer(beneficiary, profit);
        emit NewArbitrage(settleAmount, profit, now);
    }

    function initiateFlashLoan(
        address _solo,
        address _source,
        address _destination,
        uint256 _amount
    ) external 
    {
        ISoloMargin solo = ISoloMargin(_solo);

        // Get marketId from token address
        uint256 marketId = _getMarketIdFromTokenAddress(_solo, _source);

        // Calculate repay amount (_amount + (2 wei))
        // Approve transfer from
        uint256 repayAmount = _getRepaymentAmountInternal(_amount);
        IERC20(_source).approve(_solo, repayAmount);

        // 1. Withdraw $
        // 2. Call callFunction(...)
        // 3. Deposit back $
        Actions.ActionArgs[] memory operations = new Actions.ActionArgs[](3);

        operations[0] = _getWithdrawAction(marketId, _amount);
        operations[1] = _getCallAction(
            // Encode Arbitrage for callFunction
            abi.encode(Arbitrage({source: _source, destination: _destination, repayAmount: repayAmount}))
        );
        operations[2] = _getDepositAction(marketId, repayAmount);

        Account.Info[] memory accountInfos = new Account.Info[](1);
        accountInfos[0] = _getAccountInfo();

        solo.operate(accountInfos, operations);
    }

    function() external payable {}
}
