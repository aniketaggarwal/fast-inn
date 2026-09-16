// A smoke test for the package's actual public entry point (what
// `require("credentials")` resolves to from another workspace), separate
// from the src/*.test.js files that import internals directly — this is
// the one place a broken re-export in index.js would actually show up.
const credentials = require("../src/index");

describe("package entry point", () => {
  it("re-exports the sdjwt and keys modules together", async () => {
    const { generateIssuerKeyPair, issueCredential, verifyCredential } = credentials;
    const { publicKeyJwk, privateKeyJwk, kid } = await generateIssuerKeyPair();

    const { jwt, disclosures } = await issueCredential({
      claims: { fullName: "Test Guest" },
      issuerPrivateKeyJwk: privateKeyJwk,
      kid,
      issuer: "test-issuer",
      subject: "test-subject",
      expiresInSeconds: 60,
    });

    const { claims } = await verifyCredential({ jwt, disclosures, issuerPublicKeyJwk: publicKeyJwk });
    expect(claims).toEqual({ fullName: "Test Guest" });
  });
});
