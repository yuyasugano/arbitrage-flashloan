const Flashloan = artifacts.require("Flashloan");

module.exports = function(deployer) {
  deployer.deploy(
    Flashloan,
    '<beneficiary address>'
  );
};
