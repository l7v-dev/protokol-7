import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SSRFGuard } from "@/ssrf-guard";

describe("SSRFGuard - Network Perimeter & Private Subnet Protection", () => {
  it("blocks private RFC 1918 IPv4 addresses", () => {
    const classA = SSRFGuard.validateUrl("http://10.0.0.1/api");
    assert.equal(classA.valid, false);
    assert.ok(classA.reason?.includes("prohibited"));

    const classB = SSRFGuard.validateUrl("https://172.16.5.10:8080");
    assert.equal(classB.valid, false);
    assert.ok(classB.reason?.includes("prohibited"));

    const classC = SSRFGuard.validateUrl("http://192.168.1.254/status");
    assert.equal(classC.valid, false);
    assert.ok(classC.reason?.includes("prohibited"));
  });

  it("blocks loopback addresses and localhost hostnames by default", () => {
    const loopbackIpv4 = SSRFGuard.validateUrl("http://127.0.0.1:3000");
    assert.equal(loopbackIpv4.valid, false);
    assert.ok(loopbackIpv4.reason?.includes("prohibited"));

    const zeroIp = SSRFGuard.validateUrl("http://0.0.0.0:80");
    assert.equal(zeroIp.valid, false);
    assert.ok(zeroIp.reason?.includes("prohibited"));

    const localhostHost = SSRFGuard.validateUrl("http://localhost:8000/internal");
    assert.equal(localhostHost.valid, false);
    assert.ok(localhostHost.reason?.includes("localhost"));

    const subLocalhost = SSRFGuard.validateUrl("http://api.localhost:8000");
    assert.equal(subLocalhost.valid, false);
  });

  it("blocks cloud instance metadata endpoints and hostnames", () => {
    const awsMetadata = SSRFGuard.validateUrl("http://169.254.169.254/latest/meta-data/");
    assert.equal(awsMetadata.valid, false);
    assert.ok(awsMetadata.reason?.includes("metadata"));

    const gcpMetadata = SSRFGuard.validateUrl(
      "http://metadata.google.internal/computeMetadata/v1/"
    );
    assert.equal(gcpMetadata.valid, false);
    assert.ok(gcpMetadata.reason?.includes("metadata"));
  });

  it("blocks private IPv6 addresses", () => {
    const loopbackV6 = SSRFGuard.validateUrl("http://[::1]:8080");
    assert.equal(loopbackV6.valid, false);

    const ulaV6 = SSRFGuard.validateUrl("http://[fc00::1]/admin");
    assert.equal(ulaV6.valid, false);

    const linkLocalV6 = SSRFGuard.validateUrl("http://[fe80::1ff:fe00:1]");
    assert.equal(linkLocalV6.valid, false);

    // IPv4-compatible IPv6 addresses (RFC 4291 ::/96)
    const compatLoopback = SSRFGuard.validateUrl("http://[::127.0.0.1]/");
    assert.equal(compatLoopback.valid, false);

    const compatPrivateA = SSRFGuard.validateUrl("http://[::10.0.0.1]/");
    assert.equal(compatPrivateA.valid, false);

    // 6to4 private address encapsulation (2002::/16)
    const sixToFourLoopback = SSRFGuard.validateUrl("http://[2002:7f00:1::]/");
    assert.equal(sixToFourLoopback.valid, false);

    // NAT64 private address encapsulation (64:ff9b::/96)
    const nat64Private = SSRFGuard.validateUrl("http://[64:ff9b::192.168.1.1]/");
    assert.equal(nat64Private.valid, false);
  });

  it("rejects non-HTTP protocols", () => {
    const fileUrl = SSRFGuard.validateUrl("file:///etc/passwd");
    assert.equal(fileUrl.valid, false);
    assert.ok(fileUrl.reason?.includes("Unsupported protocol"));

    const ftpUrl = SSRFGuard.validateUrl("ftp://ftp.example.com/file.txt");
    assert.equal(ftpUrl.valid, false);

    const gopherUrl = SSRFGuard.validateUrl("gopher://127.0.0.1:70");
    assert.equal(gopherUrl.valid, false);
  });

  it("permits legitimate public web URLs", () => {
    const example = SSRFGuard.validateUrl("https://example.com/docs/api");
    assert.equal(example.valid, true);
    assert.equal(example.hostname, "example.com");

    const github = SSRFGuard.validateUrl("https://github.com/trending");
    assert.equal(github.valid, true);

    const publicIp = SSRFGuard.validateUrl("http://93.184.216.34");
    assert.equal(publicIp.valid, true);
  });

  it("permits local addresses when allowLocalNetwork option is explicitly enabled", () => {
    const local = SSRFGuard.validateUrl("http://127.0.0.1:8080/test", { allowLocalNetwork: true });
    assert.equal(local.valid, true);
    assert.equal(local.hostname, "127.0.0.1");

    const host = SSRFGuard.validateUrl("http://localhost:3000", { allowLocalNetwork: true });
    assert.equal(host.valid, true);
    assert.equal(host.hostname, "localhost");
  });
});
