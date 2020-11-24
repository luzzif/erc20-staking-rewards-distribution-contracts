const chai = require("chai");
const { isBN } = require("bn.js");

chai.util.addMethod(chai.Assertion.prototype, "close", function (
    bn2,
    maximumVariance
) {
    const bn1 = chai.util.flag(this, "object");
    if (!isBN(bn1) || !isBN(bn2) || !isBN(maximumVariance)) {
        throw new Error("Not a BN instance");
    }
    new chai.Assertion(bn2.sub(bn1).abs().lte(maximumVariance)).to.be.true;
});
