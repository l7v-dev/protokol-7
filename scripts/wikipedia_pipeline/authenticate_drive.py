#!/usr/bin/env python3
import os
import sys

from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

SCOPES = ["https://www.googleapis.com/auth/drive"]

def main():
    creds_path = "credentials.json"
    if not os.path.exists(creds_path):
        creds_path = os.path.join(os.path.dirname(__file__), "credentials.json")
    
    if not os.path.exists(creds_path):
        print(f"[ERROR] credentials.json not found at {creds_path}")
        sys.exit(1)

    token_path = "token.json"
    if os.path.exists(token_path):
        print(f"[INFO] Existing token found at {token_path}")

    print("[INFO] Starting OAuth authorization flow...")
    print("[INFO] If your browser does not open automatically, copy and paste the URL below into your browser.")
    
    flow = InstalledAppFlow.from_client_secrets_file(creds_path, SCOPES)
    # run_local_server binds to localhost and opens browser
    creds = flow.run_local_server(port=0, open_browser=True)

    with open(token_path, "w", encoding="utf-8") as f:
        f.write(creds.to_json())

    # Also save to scripts/wikipedia_pipeline/token.json
    script_token = os.path.join(os.path.dirname(__file__), "token.json")
    with open(script_token, "w", encoding="utf-8") as f:
        f.write(creds.to_json())

    print(f"\n[SUCCESS] OAuth2 token successfully obtained and saved to {token_path} and {script_token}!")
    
    # Test Drive access
    service = build("drive", "v3", credentials=creds)
    about = service.about().get(fields="user, storageQuota").execute()
    user_info = about.get("user", {})
    quota = about.get("storageQuota", {})
    
    print(f"[OK] Authenticated user: {user_info.get('displayName')} ({user_info.get('emailAddress')})")
    limit_gb = int(quota.get('limit', 0)) / (1024**3) if quota.get('limit') else 0
    usage_gb = int(quota.get('usage', 0)) / (1024**3) if quota.get('usage') else 0
    print(f"[OK] Storage Quota: {usage_gb:.2f} GB used / {limit_gb:.2f} GB total")

if __name__ == "__main__":
    main()
