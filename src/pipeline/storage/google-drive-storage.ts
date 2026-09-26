/**
 * Google Drive Storage Backend.
 * Uploads artifacts to Google Drive folders via Drive API v3 with service account authentication.
 */

import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { google } from "googleapis";
import type { StorageBackend, StorageReceipt } from "./index";
import { detectMimeType } from "./s3-storage";

export interface DriveClientLike {
  files: {
    create(params: {
      requestBody: {
        name: string;
        parents?: string[];
      };
      media: {
        mimeType: string;
        body: Readable;
      };
      fields?: string;
    }): Promise<{
      data: { id?: string | null; name?: string | null; md5Checksum?: string | null };
    }>;
  };
}

export interface GoogleDriveStorageOptions {
  folderId?: string;
  credentialsJson?: string | Record<string, unknown>;
  keyFile?: string;
  driveClient?: DriveClientLike;
}

export class GoogleDriveStorage implements StorageBackend {
  readonly backend: string = "drive";
  private readonly folderId?: string;
  private readonly client: DriveClientLike;

  constructor(options: GoogleDriveStorageOptions) {
    this.folderId = options.folderId;

    if (options.driveClient) {
      this.client = options.driveClient;
    } else {
      let auth: unknown;

      if (options.credentialsJson) {
        const creds =
          typeof options.credentialsJson === "string"
            ? JSON.parse(options.credentialsJson)
            : options.credentialsJson;
        auth = new google.auth.JWT({
          email: creds.client_email,
          key: creds.private_key,
          scopes: ["https://www.googleapis.com/auth/drive"],
        });
      } else {
        auth = new google.auth.GoogleAuth({
          keyFile: options.keyFile || process.env.GOOGLE_APPLICATION_CREDENTIALS,
          scopes: ["https://www.googleapis.com/auth/drive"],
        });
      }

      this.client = google.drive({
        version: "v3",
        auth: auth as never,
      }) as unknown as DriveClientLike;
    }
  }

  async upload(fileName: string, data: Buffer, prefix = ""): Promise<StorageReceipt> {
    const hash = createHash("sha256").update(data).digest("hex");
    const mimeType = detectMimeType(fileName);

    const targetFolder = this.folderId || (prefix ? prefix.replace(/\/+$/, "") : undefined);

    const stream = Readable.from(data);

    const res = await this.client.files.create({
      requestBody: {
        name: fileName,
        parents: targetFolder ? [targetFolder] : undefined,
      },
      media: {
        mimeType,
        body: stream,
      },
      fields: "id, name, md5Checksum",
    });

    const fileId = res.data.id || "unknown";
    const uri = `drive://${targetFolder || "root"}/${fileName}#${fileId}`;

    return {
      backend: "drive",
      uri,
      bytesWritten: data.length,
      checksumSha256: hash,
      timestamp: new Date().toISOString(),
    };
  }

  getFolderId(): string | undefined {
    return this.folderId;
  }
}
