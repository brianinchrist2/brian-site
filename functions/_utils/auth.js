function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBuffer(hex) {
  const view = new Uint8Array(hex.length / 2);
  for (let i = 0; i < view.length; i++) {
    view[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return view.buffer;
}

const PBKDF2_ITERATIONS = 100000;
const PBKDF2_PREFIX = "pbkdf2:";

async function hashPBKDF2(password, saltBuffer) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBuffer, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial, 256
  );
  return PBKDF2_PREFIX + bufferToHex(bits);
}

async function hashSHA256(password, saltBuffer) {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);
  const combined = new Uint8Array(saltBuffer.byteLength + passwordBuffer.byteLength);
  combined.set(new Uint8Array(saltBuffer));
  combined.set(passwordBuffer, saltBuffer.byteLength);
  const hashBuffer = await crypto.subtle.digest("SHA-256", combined);
  return bufferToHex(hashBuffer);
}

export async function hashPassword(password, salt) {
  const saltBuffer = salt ? hexToBuffer(salt) : crypto.getRandomValues(new Uint8Array(16));
  const hash = await hashPBKDF2(password, saltBuffer);
  return { hash, salt: bufferToHex(saltBuffer) };
}

export function needsRehash(storedHash) {
  return !storedHash.startsWith(PBKDF2_PREFIX);
}

export async function verifyPassword(password, salt, storedHash) {
  const saltBuffer = hexToBuffer(salt);
  if (storedHash.startsWith(PBKDF2_PREFIX)) {
    const newHash = await hashPBKDF2(password, saltBuffer);
    return newHash === storedHash;
  }
  const legacyHash = await hashSHA256(password, saltBuffer);
  return legacyHash === storedHash;
}
