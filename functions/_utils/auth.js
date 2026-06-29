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

export async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const saltBuffer = salt ? hexToBuffer(salt) : crypto.getRandomValues(new Uint8Array(16));
  const passwordBuffer = encoder.encode(password);
  
  const combined = new Uint8Array(saltBuffer.byteLength + passwordBuffer.byteLength);
  combined.set(new Uint8Array(saltBuffer));
  combined.set(passwordBuffer, saltBuffer.byteLength);
  
  const hashBuffer = await crypto.subtle.digest("SHA-256", combined);
  
  return {
    hash: bufferToHex(hashBuffer),
    salt: bufferToHex(saltBuffer)
  };
}
