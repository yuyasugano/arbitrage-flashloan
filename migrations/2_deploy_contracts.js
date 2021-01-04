const Flashloan = artifacts.require("Flashloan");

module.exports = function(deployer) {
  deployer.deploy(
    Flashloan,
    '0xe4f9576dd012842E8B203186AE8f728425E355C2'
  );
};
