const { generateIssuerKeyPair, buildJWKS, findKeyInJWKS } = require("../src/keys");

describe("generateIssuerKeyPair", () => {
  it("generates an Ed25519 key pair with a matching, deterministic kid", async () => {
    const { publicKeyJwk, privateKeyJwk, kid } = await generateIssuerKeyPair();

    expect(publicKeyJwk.kty).toBe("OKP");
    expect(publicKeyJwk.crv).toBe("Ed25519");
    expect(publicKeyJwk.d).toBeUndefined(); // public JWK must not carry the private scalar
    expect(privateKeyJwk.d).toBeTypeOf("string"); // private JWK does

    expect(publicKeyJwk.kid).toBe(kid);
    expect(privateKeyJwk.kid).toBe(kid);
    expect(publicKeyJwk.use).toBe("sig");
  });

  it("produces a different key pair (and kid) on every call", async () => {
    const a = await generateIssuerKeyPair();
    const b = await generateIssuerKeyPair();
    expect(a.kid).not.toBe(b.kid);
    expect(a.publicKeyJwk.x).not.toBe(b.publicKeyJwk.x);
  });
});

describe("buildJWKS / findKeyInJWKS", () => {
  it("wraps a list of public JWKs in the RFC 7517 { keys: [...] } shape", async () => {
    const { publicKeyJwk } = await generateIssuerKeyPair();
    const jwks = buildJWKS([publicKeyJwk]);
    expect(jwks).toEqual({ keys: [publicKeyJwk] });
  });

  it("supports rotation: two keys with different kids can coexist", async () => {
    const oldKey = await generateIssuerKeyPair();
    const newKey = await generateIssuerKeyPair();
    const jwks = buildJWKS([oldKey.publicKeyJwk, newKey.publicKeyJwk]);

    expect(findKeyInJWKS(jwks, oldKey.kid)).toEqual(oldKey.publicKeyJwk);
    expect(findKeyInJWKS(jwks, newKey.kid)).toEqual(newKey.publicKeyJwk);
  });

  it("returns undefined for a kid that isn't published", async () => {
    const jwks = buildJWKS([]);
    expect(findKeyInJWKS(jwks, "no-such-kid")).toBeUndefined();
  });
});
