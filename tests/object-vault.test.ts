import assert from "node:assert/strict";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { ObjectVault } from "../src/storage/object-vault";

describe("ObjectVault Subsystem", () => {
  const testVaultDir = join(process.cwd(), "data", "test-vault");

  it("resolves structured paths deterministically", () => {
    const vault = new ObjectVault({ vaultRoot: testVaultDir });
    const resolved = vault.resolvePath(
      "instagram",
      "pratik.psikoloji",
      "images",
      "post123_slide_01.webp"
    );

    assert.strictEqual(
      resolved.relativePath,
      join("instagram", "pratik.psikoloji", "images", "post123_slide_01.webp")
    );
    assert.strictEqual(resolved.absolutePath, join(testVaultDir, resolved.relativePath));
  });

  it("stores and deduplicates in-memory buffers with SHA-256 calculation", async () => {
    const vault = new ObjectVault({ vaultRoot: testVaultDir });
    const buffer = Buffer.from("test image content binary payload");

    const receipt = await vault.saveBuffer(buffer, {
      actor: "test_actor",
      targetId: "target_001",
      category: "thumbnails",
      filename: "cover.png",
      mimeType: "image/png",
    });

    assert.ok(existsSync(receipt.absolutePath));
    assert.strictEqual(receipt.sizeBytes, buffer.length);
    assert.strictEqual(receipt.actor, "test_actor");
    assert.strictEqual(receipt.category, "thumbnails");
    assert.ok(receipt.sha256.length === 64);

    // Verify hasAsset
    assert.strictEqual(vault.hasAsset("test_actor", "target_001", "thumbnails", "cover.png"), true);

    // Clean up test vault dir
    rmSync(testVaultDir, { recursive: true, force: true });
  });
});
