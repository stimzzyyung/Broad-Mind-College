const crypto = require('crypto');

const ENCRYPTION_KEY_ENV = 'PAYMENT_REFERENCE_ENCRYPTION_KEY';
const REFERENCE_HASH_PREFIX = 'hmac-v1:';

function encryptionKey() {
  const configuredKey = process.env[ENCRYPTION_KEY_ENV] || '';
  if (/^[a-fA-F0-9]{64}$/.test(configuredKey)) {
    return Buffer.from(configuredKey, 'hex');
  }
  if (process.env.JWT_SECRET) {
    return crypto.createHash('sha256').update(process.env.JWT_SECRET).digest();
  }
  return crypto.createHash('sha256').update('bms-default-portal-encryption-key-fallback').digest();
}

function hashReference(reference) {
  const key = encryptionKey();
  const hashKey = crypto.createHmac('sha256', key).update('payment-reference-hash-v1').digest();
  const hash = crypto.createHmac('sha256', hashKey).update(reference, 'utf8').digest('hex');
  return `${REFERENCE_HASH_PREFIX}${hash}`;
}

function encryptReference(reference) {
  const key = encryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(reference, 'utf8'),
    cipher.final(),
  ]);
  const payload = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');

  return {
    reference: hashReference(reference),
    encryptedReference: `v1:${payload}`,
  };
}

function decryptReference(encryptedReference) {
  if (typeof encryptedReference !== 'string' || !encryptedReference.startsWith('v1:')) {
    throw new Error('Unsupported encrypted payment reference format');
  }

  const payload = Buffer.from(encryptedReference.slice(3), 'base64');
  if (payload.length < 28) throw new Error('Encrypted payment reference is invalid');

  const key = encryptionKey();
  const iv = payload.subarray(0, 12);
  const authTag = payload.subarray(12, 28);
  const ciphertext = payload.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

function paymentReference(payment) {
  return payment.encryptedReference
    ? decryptReference(payment.encryptedReference)
    : payment.reference;
}

module.exports = { encryptReference, decryptReference, hashReference, paymentReference };
