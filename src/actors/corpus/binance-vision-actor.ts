/**
 * BinanceVisionActor - Binance Vision Public Data Repository Extractor
 *
 * Interfaces with Binance Vision Amazon S3 Public Data Store to discover,
 * query, and generate direct download links for historical cryptocurrency market data
 * (klines OHLCV, trades, and aggTrades) across Spot and Futures markets.
 *
 * Storage Base: https://s3-ap-northeast-1.amazonaws.com/data.binance.vision
 */

import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  BinanceVisionActorResult,
  BinanceVisionActorTaskOptions,
  BinanceVisionFileItem,
  IActor,
} from "../../api/types";
import { safeRedirectFetch } from "../../network/safe-redirect-fetcher";
import { SSRFGuard } from "../../network/ssrf-guard";

const BINANCE_S3_BASE = "https://s3-ap-northeast-1.amazonaws.com/data.binance.vision";
const DEFAULT_TIMEOUT_MS = 35_000;
const DEFAULT_LIMIT = 50;

export class BinanceVisionActor implements IActor<BinanceVisionActorResult> {
  public readonly actorType = "binance-vision";
  public readonly description =
    "Streams historical cryptocurrency dataset manifests and file keys from Binance Vision Amazon S3 repository.";

  public async run(
    task: ActorTask,
    _context: ActorRunContext
  ): Promise<ActorResult<BinanceVisionActorResult>> {
    const startTime = Date.now();
    const opts: BinanceVisionActorTaskOptions = task.options?.binanceVisionOptions ?? {};

    const action = opts.action ?? "list_files";
    const market = opts.market ?? "spot";
    const dataType = opts.dataType ?? "klines";
    const symbol = opts.symbol ? opts.symbol.trim().toUpperCase() : "BTCUSDT";
    const interval = opts.interval ?? "1d";
    const periodType = opts.periodType ?? "monthly";
    const limit = opts.limit && opts.limit > 0 ? Math.min(opts.limit, 1000) : DEFAULT_LIMIT;
    const timeoutMs = opts.timeoutMs ?? task.options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const s3Base =
      task.targetUrl && task.targetUrl.trim() !== "" ? task.targetUrl : BINANCE_S3_BASE;
    const isLocalTest = s3Base.includes("127.0.0.1") || s3Base.includes("localhost");

    try {
      if (action === "list_symbols") {
        return await this.handleListSymbols(
          task.taskId,
          market,
          dataType,
          periodType,
          limit,
          timeoutMs,
          startTime,
          s3Base,
          isLocalTest
        );
      }

      if (action === "get_file_info") {
        return await this.handleGetFileInfo(
          task.taskId,
          market,
          dataType,
          symbol,
          interval,
          periodType,
          opts.year,
          opts.month,
          timeoutMs,
          startTime,
          s3Base,
          isLocalTest
        );
      }

      // Default: list_files
      return await this.handleListFiles(
        task.taskId,
        market,
        dataType,
        symbol,
        interval,
        periodType,
        limit,
        timeoutMs,
        startTime,
        s3Base,
        isLocalTest
      );
    } catch (error) {
      const duration = Date.now() - startTime;
      const message = error instanceof Error ? error.message : String(error);

      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        errorMessage: message,
        executionDurationMs: duration,
        data: {
          action,
          market,
          dataType,
          symbol,
          interval,
          periodType,
          totalCount: 0,
          files: [],
          queryUrl: BINANCE_S3_BASE,
          markdown: `### Binance Vision Query Error\n\nFailed to execute action "${action}": ${message}`,
        },
      };
    }
  }

  private buildPrefix(
    market: string,
    dataType: string,
    symbol: string,
    interval: string,
    periodType: string
  ): string {
    const marketPath = market.replace("_", "/");
    if (dataType === "klines") {
      return `data/${marketPath}/${periodType}/${dataType}/${symbol}/${interval}/`;
    }
    return `data/${marketPath}/${periodType}/${dataType}/${symbol}/`;
  }

  private parseXmlContents(
    xmlText: string
  ): Array<{ key: string; size: number; lastModified: string }> {
    const contents: Array<{ key: string; size: number; lastModified: string }> = [];
    const contentRegex = /<Contents>([\s\S]*?)<\/Contents>/g;
    let match = contentRegex.exec(xmlText);

    while (match !== null) {
      const block = match[1];
      const keyMatch = /<Key>(.*?)<\/Key>/.exec(block);
      const sizeMatch = /<Size>(.*?)<\/Size>/.exec(block);
      const lmMatch = /<LastModified>(.*?)<\/LastModified>/.exec(block);

      if (keyMatch?.[1]) {
        contents.push({
          key: keyMatch[1],
          size: sizeMatch ? Number.parseInt(sizeMatch[1], 10) : 0,
          lastModified: lmMatch ? lmMatch[1] : "",
        });
      }
      match = contentRegex.exec(xmlText);
    }
    return contents;
  }

  private parseXmlCommonPrefixes(xmlText: string): string[] {
    const prefixes: string[] = [];
    const prefixRegex = /<CommonPrefixes>\s*<Prefix>(.*?)<\/Prefix>\s*<\/CommonPrefixes>/g;
    let match = prefixRegex.exec(xmlText);

    while (match !== null) {
      if (match[1]) {
        prefixes.push(match[1]);
      }
      match = prefixRegex.exec(xmlText);
    }
    return prefixes;
  }

  private async fetchS3Xml(
    url: string,
    timeoutMs: number,
    allowLocalNetwork = false
  ): Promise<string> {
    const ssrfCheck = await SSRFGuard.validateUrlWithDns(url, { allowLocalNetwork });
    if (!ssrfCheck.valid) {
      throw new Error(`SSRF validation failed for URL: ${url}. Reason: ${ssrfCheck.reason}`);
    }

    const response = await safeRedirectFetch(url, {
      timeoutMs,
      maxRedirects: 3,
      allowLocalNetwork,
      headers: {
        "User-Agent": "protokol-7/1.0.0 (Binance Vision Actor; mailto:l7v-dev@protokol.local)",
        Accept: "application/xml, text/xml, */*",
      },
    });

    if (!response.ok) {
      throw new Error(`Upstream S3 responded with HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.text();
  }

  private async handleListFiles(
    taskId: string,
    market: string,
    dataType: string,
    symbol: string,
    interval: string,
    periodType: string,
    limit: number,
    timeoutMs: number,
    startTime: number,
    s3Base: string = BINANCE_S3_BASE,
    isLocalTest = false
  ): Promise<ActorResult<BinanceVisionActorResult>> {
    const prefix = this.buildPrefix(market, dataType, symbol, interval, periodType);
    const queryUrl = `${s3Base}?prefix=${encodeURIComponent(prefix)}&max-keys=${limit}`;

    const xml = await this.fetchS3Xml(queryUrl, timeoutMs, isLocalTest);
    const parsed = this.parseXmlContents(xml);

    // Filter zip files
    const zipEntries = parsed.filter((entry) => entry.key.endsWith(".zip"));

    const files: BinanceVisionFileItem[] = zipEntries.map((item) => ({
      key: item.key,
      size: item.size,
      lastModified: item.lastModified,
      downloadUrl: `${s3Base}/${encodeURIComponent(item.key)}`,
      checksumUrl: `${s3Base}/${encodeURIComponent(item.key)}.CHECKSUM`,
    }));

    const markdown = this.formatFilesMarkdown(
      market,
      dataType,
      symbol,
      interval,
      periodType,
      files
    );

    return {
      taskId,
      actorType: this.actorType,
      status: "completed",
      statusCode: 200,
      executionDurationMs: Date.now() - startTime,
      data: {
        action: "list_files",
        market,
        dataType,
        symbol,
        interval,
        periodType,
        totalCount: files.length,
        files,
        queryUrl,
        markdown,
      },
    };
  }

  private async handleListSymbols(
    taskId: string,
    market: string,
    dataType: string,
    periodType: string,
    limit: number,
    timeoutMs: number,
    startTime: number,
    s3Base: string = BINANCE_S3_BASE,
    isLocalTest = false
  ): Promise<ActorResult<BinanceVisionActorResult>> {
    const marketPath = market.replace("_", "/");
    const prefix = `data/${marketPath}/${periodType}/${dataType}/`;
    const queryUrl = `${s3Base}?prefix=${encodeURIComponent(prefix)}&delimiter=/&max-keys=${limit}`;

    const xml = await this.fetchS3Xml(queryUrl, timeoutMs, isLocalTest);
    const rawPrefixes = this.parseXmlCommonPrefixes(xml);

    const symbols = rawPrefixes
      .map((p) => {
        const parts = p.replace(prefix, "").replace("/", "").trim();
        return parts;
      })
      .filter(Boolean);

    const markdown = this.formatSymbolsMarkdown(market, dataType, periodType, symbols);

    return {
      taskId,
      actorType: this.actorType,
      status: "completed",
      statusCode: 200,
      executionDurationMs: Date.now() - startTime,
      data: {
        action: "list_symbols",
        market,
        dataType,
        periodType,
        totalCount: symbols.length,
        symbols,
        queryUrl,
        markdown,
      },
    };
  }

  private async handleGetFileInfo(
    taskId: string,
    market: string,
    dataType: string,
    symbol: string,
    interval: string,
    periodType: string,
    year?: string,
    month?: string,
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
    startTime: number = Date.now(),
    s3Base: string = BINANCE_S3_BASE,
    isLocalTest = false
  ): Promise<ActorResult<BinanceVisionActorResult>> {
    const y = year || "2024";
    const m = month || "01";
    const fileName =
      dataType === "klines"
        ? `${symbol}-${interval}-${y}-${m}.zip`
        : `${symbol}-${dataType}-${y}-${m}.zip`;

    const prefix = this.buildPrefix(market, dataType, symbol, interval, periodType);
    const fileKey = `${prefix}${fileName}`;
    const queryUrl = `${s3Base}?prefix=${encodeURIComponent(fileKey)}`;

    const xml = await this.fetchS3Xml(queryUrl, timeoutMs, isLocalTest);
    const parsed = this.parseXmlContents(xml);
    const matched = parsed.find((p) => p.key === fileKey);

    const files: BinanceVisionFileItem[] = matched
      ? [
          {
            key: matched.key,
            size: matched.size,
            lastModified: matched.lastModified,
            downloadUrl: `${s3Base}/${encodeURIComponent(matched.key)}`,
            checksumUrl: `${s3Base}/${encodeURIComponent(matched.key)}.CHECKSUM`,
          },
        ]
      : [];

    const markdown = matched
      ? `### Binance Vision File Info: ${symbol} (${market.toUpperCase()})\n\n` +
        `- **File Key:** \`${matched.key}\`\n` +
        `- **Size:** ${(matched.size / (1024 * 1024)).toFixed(2)} MB (${matched.size} bytes)\n` +
        `- **Last Modified:** ${matched.lastModified}\n` +
        `- **Download URL:** [Download Archive](${s3Base}/${encodeURIComponent(matched.key)})\n` +
        `- **Checksum URL:** [SHA-256 Checksum](${s3Base}/${encodeURIComponent(matched.key)}.CHECKSUM)\n`
      : `### Binance Vision File Not Found\n\nNo file matching key \`${fileKey}\` was discovered on S3.`;

    return {
      taskId,
      actorType: this.actorType,
      status: "completed",
      statusCode: matched ? 200 : 404,
      executionDurationMs: Date.now() - startTime,
      data: {
        action: "get_file_info",
        market,
        dataType,
        symbol,
        interval,
        periodType,
        totalCount: files.length,
        files,
        queryUrl,
        markdown,
      },
    };
  }

  private formatFilesMarkdown(
    market: string,
    dataType: string,
    symbol: string,
    interval: string,
    periodType: string,
    files: BinanceVisionFileItem[]
  ): string {
    const lines: string[] = [
      `### Binance Vision Historical Data: ${symbol} (${market.toUpperCase()})`,
      `**Data Type:** ${dataType} | **Interval:** ${interval} | **Period:** ${periodType} | **Found Files:** ${files.length}`,
      "",
    ];

    if (files.length === 0) {
      lines.push("*No matching dataset archives found for this configuration.*");
      return lines.join("\n");
    }

    lines.push("| File Name | Size (MB) | Last Modified | Archive Link | SHA-256 Checksum |");
    lines.push("| :--- | :--- | :--- | :--- | :--- |");

    for (const f of files.slice(0, 50)) {
      const fileName = f.key.split("/").pop() || f.key;
      const sizeMb = (f.size / (1024 * 1024)).toFixed(2);
      lines.push(
        `| \`${fileName}\` | ${sizeMb} MB | ${f.lastModified || "-"} | [Download ZIP](${f.downloadUrl}) | [CHECKSUM](${f.checksumUrl}) |`
      );
    }

    if (files.length > 50) {
      lines.push("", `*...and ${files.length - 50} more archives.*`);
    }

    return lines.join("\n");
  }

  private formatSymbolsMarkdown(
    market: string,
    dataType: string,
    periodType: string,
    symbols: string[]
  ): string {
    const lines: string[] = [
      `### Binance Vision Available Symbols (${market.toUpperCase()} - ${dataType})`,
      `**Period Granularity:** ${periodType} | **Total Symbols:** ${symbols.length}`,
      "",
    ];

    if (symbols.length === 0) {
      lines.push("*No symbols discovered.*");
      return lines.join("\n");
    }

    lines.push("| Symbol | Prefix Path |");
    lines.push("| :--- | :--- |");

    for (const s of symbols.slice(0, 100)) {
      lines.push(
        `| **${s}** | \`data/${market.replace("_", "/")}/${periodType}/${dataType}/${s}/\` |`
      );
    }

    if (symbols.length > 100) {
      lines.push("", `*...and ${symbols.length - 100} more symbols.*`);
    }

    return lines.join("\n");
  }
}
