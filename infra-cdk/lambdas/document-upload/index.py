# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

"""Document Upload API Lambda Handler

Handles two endpoints:
  POST /documents/presign  - Generate a presigned S3 PUT URL so the browser
                             can upload files directly to S3.
  POST /documents/extract  - Extract text from an already-uploaded S3 object
                             (PDF via Textract, plain text/CSV via direct read,
                             PNG/JPEG via Textract image analysis).
"""

import base64
import json
import os
import uuid

import boto3
from botocore.exceptions import ClientError

BUCKET_NAME = os.environ["BUCKET_NAME"]
CORS_ALLOWED_ORIGINS = os.environ.get("CORS_ALLOWED_ORIGINS", "*")
REGION = os.environ.get("AWS_REGION", "us-east-1")

s3 = boto3.client("s3", region_name=REGION)
textract = boto3.client("textract", region_name=REGION)

# Allowed MIME types and their extensions
ALLOWED_TYPES = {
    "application/pdf": ".pdf",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "text/csv": ".csv",
    "text/plain": ".txt",
    "application/octet-stream": "",  # fallback
}

cors_origins = [o.strip() for o in CORS_ALLOWED_ORIGINS.split(",") if o.strip()]


def _cors_headers(origin: str) -> dict:
    allowed = origin if origin in cors_origins or "*" in cors_origins else cors_origins[0]
    return {
        "Access-Control-Allow-Origin": allowed,
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
        "Access-Control-Allow-Credentials": "true",
    }


def _respond(status: int, body: dict, origin: str = "*") -> dict:
    return {
        "statusCode": status,
        "headers": {**_cors_headers(origin), "Content-Type": "application/json"},
        "body": json.dumps(body),
    }


def _extract_text_from_s3(s3_key: str, file_type: str) -> str:
    """Extract text from an S3 object depending on its type."""
    if file_type in ("text/plain", "text/csv"):
        obj = s3.get_object(Bucket=BUCKET_NAME, Key=s3_key)
        return obj["Body"].read().decode("utf-8", errors="replace")

    if file_type in ("application/pdf", "image/png", "image/jpeg"):
        # Use Textract synchronous API (supports S3 objects up to 10MB)
        try:
            response = textract.detect_document_text(
                Document={"S3Object": {"Bucket": BUCKET_NAME, "Name": s3_key}}
            )
            lines = [
                block["Text"]
                for block in response.get("Blocks", [])
                if block["BlockType"] == "LINE"
            ]
            return "\n".join(lines)
        except ClientError as e:
            return f"[Text extraction failed: {e.response['Error']['Message']}]"

    # Fallback: try to read as text
    try:
        obj = s3.get_object(Bucket=BUCKET_NAME, Key=s3_key)
        return obj["Body"].read().decode("utf-8", errors="replace")
    except Exception:
        return "[Could not extract text from this file type]"


def handle_presign(body: dict, origin: str) -> dict:
    """Generate a presigned S3 PUT URL."""
    file_name = body.get("fileName", "upload")
    file_type = body.get("fileType", "application/octet-stream")
    agent_id = body.get("agentId", "unknown")
    session_id = body.get("sessionId", "unknown")

    if file_type not in ALLOWED_TYPES:
        return _respond(400, {"error": f"File type not allowed: {file_type}"}, origin)

    ext = ALLOWED_TYPES.get(file_type, "")
    doc_id = str(uuid.uuid4())
    s3_key = f"documents/{agent_id}/{session_id}/{doc_id}{ext}"

    try:
        upload_url = s3.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": BUCKET_NAME,
                "Key": s3_key,
                "ContentType": file_type,
            },
            ExpiresIn=300,  # 5 minutes
        )
    except ClientError as e:
        return _respond(500, {"error": str(e)}, origin)

    return _respond(200, {
        "uploadUrl": upload_url,
        "s3Key": s3_key,
        "documentId": doc_id,
        "fileName": file_name,
    }, origin)


def handle_extract(body: dict, origin: str) -> dict:
    """Extract text from an already-uploaded S3 object."""
    s3_key = body.get("s3Key", "")
    file_type = body.get("fileType", "text/plain")

    if not s3_key:
        return _respond(400, {"error": "s3Key is required"}, origin)

    # Verify the object exists in our bucket (basic security check)
    if not s3_key.startswith("documents/"):
        return _respond(403, {"error": "Invalid s3Key"}, origin)

    text = _extract_text_from_s3(s3_key, file_type)
    return _respond(200, {"text": text, "s3Key": s3_key}, origin)


def handler(event: dict, context) -> dict:
    origin = (event.get("headers") or {}).get("origin", "*")

    if event.get("httpMethod") == "OPTIONS":
        return _respond(200, {}, origin)

    path = event.get("path", "")
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return _respond(400, {"error": "Invalid JSON body"}, origin)

    if path.endswith("/presign"):
        return handle_presign(body, origin)
    if path.endswith("/extract"):
        return handle_extract(body, origin)

    return _respond(404, {"error": "Not found"}, origin)
