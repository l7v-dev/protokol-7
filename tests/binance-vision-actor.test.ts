import assert from "node:assert/strict";
import * as http from "node:http";
import test from "node:test";
import { BinanceVisionActor } from "../src/actors/corpus/binance-vision-actor";
import { createServer } from "../src/server";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

const MOCK_S3_LIST_FILES_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
    <Name>data.binance.vision</Name>
    <Prefix>data/spot/monthly/klines/BTCUSDT/1d/</Prefix>
    <Contents>
        <Key>data/spot/monthly/klines/BTCUSDT/1d/BTCUSDT-1d-2024-01.zip</Key>
        <LastModified>2024-02-01T00:15:32.000Z</LastModified>
        <Size>123456</Size>
    </Contents>
    <Contents>
        <Key>data/spot/monthly/klines/BTCUSDT/1d/BTCUSDT-1d-2024-02.zip</Key>
        <LastModified>2024-03-01T00:14:10.000Z</LastModified>
        <Size>134567</Size>
    </Contents>
    <Contents>
        <Key>data/spot/monthly/klines/BTCUSDT/1d/BTCUSDT-1d-2024-02.zip.CHECKSUM</Key>
        <LastModified>2024-03-01T00:14:11.000Z</LastModified>
        <Size>64</Size>
    </Contents>
    <IsTruncated>false</IsTruncated>
</ListBucketResult>`;

const MOCK_S3_LIST_SYMBOLS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
    <Name>data.binance.vision</Name>
    <Prefix>data/spot/monthly/klines/</Prefix>
    <CommonPrefixes>
        <Prefix>data/spot/monthly/klines/1INCHBTC/</Prefix>
    </CommonPrefixes>
    <CommonPrefixes>
        <Prefix>data/spot/monthly/klines/BTCUSDT/</Prefix>
    </CommonPrefixes>
    <CommonPrefixes>
        <Prefix>data/spot/monthly/klines/ETHUSDT/</Prefix>
    </CommonPrefixes>
    <IsTruncated>false</IsTruncated>
</ListBucketResult>`;

test("BinanceVisionActor list_files action queries S3 and formats markdown", async () => {
  const actor = new BinanceVisionActor();

  // Mock fetchS3Xml via private method override
  (
    actor as unknown as { fetchS3Xml: (url: string, timeout: number) => Promise<string> }
  ).fetchS3Xml = async (_url: string, _timeout: number) => {
    return MOCK_S3_LIST_FILES_XML;
  };

  const result = await actor.run(
    {
      taskId: "test-task-1",
      actorType: "binance-vision",
      targetUrl: "",
      options: {
        binanceVisionOptions: {
          action: "list_files",
          market: "spot",
          dataType: "klines",
          symbol: "BTCUSDT",
          interval: "1d",
          periodType: "monthly",
        },
      },
    },
    {}
  );

  assert.equal(result.status, "completed");
  assert.equal(result.data?.action, "list_files");
  assert.equal(result.data?.symbol, "BTCUSDT");
  assert.equal(result.data?.totalCount, 2); // 2 zip files (excluding CHECKSUM)
  assert.equal(result.data?.files?.length, 2);
  assert.ok(result.data?.files?.[0].downloadUrl.includes("BTCUSDT-1d-2024-01.zip"));
  assert.ok(result.data?.files?.[0].checksumUrl?.includes(".CHECKSUM"));
  assert.ok(result.data?.markdown.includes("Binance Vision Historical Data: BTCUSDT"));
  assert.ok(result.data?.markdown.includes("| File Name | Size (MB) |"));
});

test("BinanceVisionActor list_symbols action queries CommonPrefixes", async () => {
  const actor = new BinanceVisionActor();

  (
    actor as unknown as { fetchS3Xml: (url: string, timeout: number) => Promise<string> }
  ).fetchS3Xml = async (_url: string, _timeout: number) => {
    return MOCK_S3_LIST_SYMBOLS_XML;
  };

  const result = await actor.run(
    {
      taskId: "test-task-2",
      actorType: "binance-vision",
      targetUrl: "",
      options: {
        binanceVisionOptions: {
          action: "list_symbols",
          market: "spot",
          dataType: "klines",
          periodType: "monthly",
        },
      },
    },
    {}
  );

  assert.equal(result.status, "completed");
  assert.equal(result.data?.action, "list_symbols");
  assert.equal(result.data?.totalCount, 3);
  assert.deepEqual(result.data?.symbols, ["1INCHBTC", "BTCUSDT", "ETHUSDT"]);
  assert.ok(result.data?.markdown.includes("Available Symbols"));
});

test("BinanceVisionActor get_file_info action returns specific metadata", async () => {
  const actor = new BinanceVisionActor();

  (
    actor as unknown as { fetchS3Xml: (url: string, timeout: number) => Promise<string> }
  ).fetchS3Xml = async (_url: string, _timeout: number) => {
    return MOCK_S3_LIST_FILES_XML;
  };

  const result = await actor.run(
    {
      taskId: "test-task-3",
      actorType: "binance-vision",
      targetUrl: "",
      options: {
        binanceVisionOptions: {
          action: "get_file_info",
          market: "spot",
          dataType: "klines",
          symbol: "BTCUSDT",
          interval: "1d",
          periodType: "monthly",
          year: "2024",
          month: "01",
        },
      },
    },
    {}
  );

  assert.equal(result.status, "completed");
  assert.equal(result.data?.action, "get_file_info");
  assert.equal(result.data?.files?.length, 1);
  assert.equal(
    result.data?.files?.[0].key,
    "data/spot/monthly/klines/BTCUSDT/1d/BTCUSDT-1d-2024-01.zip"
  );
  assert.ok(result.data?.markdown.includes("File Key:"));
});

test("Server REST endpoint POST /api/v1/binance-vision returns 200 with structured response", async (t) => {
  const mockS3Api = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/xml" });
    res.end(MOCK_S3_LIST_FILES_XML);
  });

  await new Promise<void>((resolve) => mockS3Api.listen(0, "127.0.0.1", resolve));
  const mockPort = (mockS3Api.address() as { port: number }).port;
  const mockS3Url = `http://127.0.0.1:${mockPort}/data.binance.vision`;

  const appServer = createServer();
  await new Promise<void>((resolve) => appServer.listen(0, "127.0.0.1", resolve));
  const appPort = (appServer.address() as { port: number }).port;

  t.after(() => {
    mockS3Api.close();
    appServer.close();
  });

  const response = await fetch(`http://127.0.0.1:${appPort}/api/v1/binance-vision`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "list_files",
      market: "spot",
      dataType: "klines",
      symbol: "BTCUSDT",
      interval: "1d",
      periodType: "monthly",
      targetUrl: mockS3Url,
    }),
  });

  assert.equal(response.status, 200);
  const json = (await response.json()) as {
    success: boolean;
    actorType: string;
    data: { action: string; totalCount: number; files: Array<{ key: string }> };
  };

  assert.equal(json.success, true);
  assert.equal(json.actorType, "binance-vision");
  assert.equal(json.data.action, "list_files");
  assert.equal(json.data.totalCount, 2);
  assert.equal(json.data.files.length, 2);
});
