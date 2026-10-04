// Prints an HS256 JWT for a role (test-only). node scripts/local-jwt.mjs service_role
import crypto from "node:crypto";
const secret = process.env.LOCAL_JWT_SECRET || "local-test-jwt-secret-at-least-32-characters";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const body = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ role: process.argv[2] || "anon", iss: "local", exp: 4102444800 })}`;
process.stdout.write(`${body}.${crypto.createHmac("sha256", secret).update(body).digest("base64url")}`);
