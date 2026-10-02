#!/usr/bin/env python3
"""
Google Drive OAuth2 Authentication Helper -- protokol-7

Interactive CLI that generates and validates token.json from credentials.json
for Google Drive pipeline uploads.
"""

import os
import sys

from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = ["https://www.googleapis.com/auth/drive"]


def main():
    creds_path = os.path.abspath("credentials.json")
    token_path = os.path.abspath("token.json")

    if not os.path.exists(creds_path):
        print(f"[ERROR] credentials.json not found at {creds_path}")
        sys.exit(1)

    print("[INFO] Starting Google Drive OAuth authentication flow...")
    print("[INFO] A browser window will open automatically for authorization.")

    flow = InstalledAppFlow.from_client_secrets_file(creds_path, SCOPES)
    creds = flow.run_local_server(port=8080)

    with open(token_path, "w", encoding="utf-8") as f:
        f.write(creds.to_json())

    print(f"[OK] Authentication successful! Saved active token to: {token_path}")


if __name__ == "__main__":
    main()
