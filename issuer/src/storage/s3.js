const crypto = require("crypto");
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const BUCKET = process.env.S3_BUCKET || "hotelverify-kyc";

// Two endpoints, deliberately: the issuer talks to MinIO over the internal
// docker network (S3_ENDPOINT), but a presigned URL is followed by the
// guest's own browser, which can't resolve an internal hostname like
// "minio" — it needs S3_PUBLIC_ENDPOINT (Section 9.6).
const internalClient = new S3Client({
  endpoint: process.env.S3_ENDPOINT || "http://localhost:9000",
  region: process.env.S3_REGION || "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || "hotelverify",
    secretAccessKey: process.env.S3_SECRET_KEY || "hotelverify_dev_only",
  },
});

const publicClient = new S3Client({
  endpoint: process.env.S3_PUBLIC_ENDPOINT || process.env.S3_ENDPOINT || "http://localhost:9000",
  region: process.env.S3_REGION || "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || "hotelverify",
    secretAccessKey: process.env.S3_SECRET_KEY || "hotelverify_dev_only",
  },
});

async function ensureBucket() {
  try {
    await internalClient.send(new HeadBucketCommand({ Bucket: BUCKET }));
  } catch {
    await internalClient.send(new CreateBucketCommand({ Bucket: BUCKET }));
  }
}

function newObjectKey(prefix, extension) {
  return `${prefix}/${crypto.randomUUID()}.${extension}`;
}

// Never make the bucket public, never hand out a permanent URL (Section
// 9.6) — every access is a short-lived signed URL for one specific
// operation.
async function presignedPutUrl(key, contentType, expiresInSeconds = 300) {
  return getSignedUrl(
    publicClient,
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: expiresInSeconds }
  );
}

// 60s per Section 9.6, and only ever generated for an authorised reviewer.
async function presignedGetUrl(key, expiresInSeconds = 60) {
  return getSignedUrl(publicClient, new GetObjectCommand({ Bucket: BUCKET, Key: key }), {
    expiresIn: expiresInSeconds,
  });
}

async function getObjectBuffer(key) {
  const result = await internalClient.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const chunks = [];
  for await (const chunk of result.Body) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// Raw docs/selfies are deleted right after issuance (or rejection) —
// only a hash of the document survives, for duplicate detection
// (Section 9.6).
async function deleteObject(key) {
  await internalClient.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

async function objectExists(key) {
  try {
    await internalClient.send(new HeadBucketCommand({ Bucket: BUCKET }));
    await internalClient.send(new GetObjectCommand({ Bucket: BUCKET, Key: key, Range: "bytes=0-0" }));
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  BUCKET,
  ensureBucket,
  newObjectKey,
  presignedPutUrl,
  presignedGetUrl,
  getObjectBuffer,
  deleteObject,
  objectExists,
};
