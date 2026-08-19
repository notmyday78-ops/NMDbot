"use strict";
import crypto from "crypto";
import { logger } from "../utils/logger";
export class CryptoUtils {
  static ALGORITHM = "aes-256-gcm";
  static SALT_LENGTH = 32;
  static TAG_LENGTH = 16;
  static IV_LENGTH = 16;
  static KEY_LENGTH = 32;
  static ITERATIONS = 1e5;
  /**
   * Generate secure random string
   */
  static generateSecureToken(length = 32) {
    return crypto.randomBytes(length).toString("hex");
  }
  /**
   * Generate secure random ID
   */
  static generateSecureId() {
    return crypto.randomUUID();
  }
  /**
   * Hash password with salt
   */
  static async hashPassword(password) {
    const salt = crypto.randomBytes(this.SALT_LENGTH);
    const hash = await this.pbkdf2(password, salt, this.ITERATIONS, this.KEY_LENGTH);
    return Buffer.concat([
      salt,
      Buffer.from([this.ITERATIONS / 1e3]),
      // Store iterations/1000 as single byte
      hash
    ]).toString("base64");
  }
  /**
   * Verify password against hash
   */
  static async verifyPassword(password, storedHash) {
    try {
      const buffer = Buffer.from(storedHash, "base64");
      const salt = buffer.slice(0, this.SALT_LENGTH);
      const iterations = buffer[this.SALT_LENGTH] * 1e3;
      const hash = buffer.slice(this.SALT_LENGTH + 1);
      const testHash = await this.pbkdf2(password, salt, iterations, hash.length);
      return crypto.timingSafeEqual(hash, testHash);
    } catch (error) {
      logger.error("Password verification error:", error);
      return false;
    }
  }
  /**
   * Encrypt data
   */
  static encrypt(text, key) {
    const iv = crypto.randomBytes(this.IV_LENGTH);
    const salt = crypto.randomBytes(this.SALT_LENGTH);
    const derivedKey = crypto.pbkdf2Sync(key, salt, this.ITERATIONS, this.KEY_LENGTH, "sha256");
    const cipher = crypto.createCipheriv(this.ALGORITHM, derivedKey, iv);
    const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([salt, iv, tag, encrypted]).toString("base64");
  }
  /**
   * Decrypt data
   */
  static decrypt(encryptedData, key) {
    try {
      const buffer = Buffer.from(encryptedData, "base64");
      const salt = buffer.slice(0, this.SALT_LENGTH);
      const iv = buffer.slice(this.SALT_LENGTH, this.SALT_LENGTH + this.IV_LENGTH);
      const tag = buffer.slice(
        this.SALT_LENGTH + this.IV_LENGTH,
        this.SALT_LENGTH + this.IV_LENGTH + this.TAG_LENGTH
      );
      const encrypted = buffer.slice(this.SALT_LENGTH + this.IV_LENGTH + this.TAG_LENGTH);
      const derivedKey = crypto.pbkdf2Sync(key, salt, this.ITERATIONS, this.KEY_LENGTH, "sha256");
      const decipher = crypto.createDecipheriv(this.ALGORITHM, derivedKey, iv);
      decipher.setAuthTag(tag);
      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      return decrypted.toString("utf8");
    } catch (error) {
      logger.error("Decryption error:", error);
      return null;
    }
  }
  /**
   * Generate HMAC signature
   */
  static generateHMAC(data, secret) {
    return crypto.createHmac("sha256", secret).update(data).digest("hex");
  }
  /**
   * Verify HMAC signature
   */
  static verifyHMAC(data, signature, secret) {
    const expectedSignature = this.generateHMAC(data, secret);
    return crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expectedSignature, "hex")
    );
  }
  /**
   * Hash data with SHA256
   */
  static hash(data) {
    return crypto.createHash("sha256").update(data).digest("hex");
  }
  /**
   * Generate time-based OTP
   */
  static generateTOTP(secret, window = 30, counterOverride) {
    const counter = counterOverride ?? Math.floor(Date.now() / 1e3 / window);
    const base32Decode = (str) => {
      const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
      let bits = "";
      for (const char of str.toUpperCase()) {
        const val = alphabet.indexOf(char);
        if (val === -1) continue;
        bits += val.toString(2).padStart(5, "0");
      }
      const bytes = [];
      for (let i = 0; i + 8 <= bits.length; i += 8) {
        bytes.push(parseInt(bits.substr(i, 8), 2));
      }
      return Buffer.from(bytes);
    };
    const hmac = crypto.createHmac("sha1", base32Decode(secret));
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigInt64BE(BigInt(counter));
    const hash = hmac.update(counterBuffer).digest();
    const offset = hash[hash.length - 1] & 15;
    const code = (hash.readUInt32BE(offset) & 2147483647) % 1e6;
    return code.toString().padStart(6, "0");
  }
  /**
   * Verify time-based OTP
   */
  static verifyTOTP(token, secret, window = 30, tolerance = 1) {
    const baseCounter = Math.floor(Date.now() / 1e3 / window);
    for (let i = -tolerance; i <= tolerance; i++) {
      const testToken = this.generateTOTP(secret, window, baseCounter + i);
      if (crypto.timingSafeEqual(Buffer.from(token), Buffer.from(testToken))) {
        return true;
      }
    }
    return false;
  }
  /**
   * Generate API key
   */
  static generateApiKey() {
    const key = `pk_${this.generateSecureToken(32)}`;
    const hash = this.hash(key);
    return { key, hash };
  }
  /**
   * Mask sensitive data
   */
  static maskSensitive(data, visibleChars = 4) {
    if (data.length <= visibleChars * 2) {
      return "*".repeat(data.length);
    }
    const start = data.slice(0, visibleChars);
    const end = data.slice(-visibleChars);
    const masked = "*".repeat(Math.max(4, data.length - visibleChars * 2));
    return `${start}${masked}${end}`;
  }
  /**
   * Constant-time string comparison
   */
  static secureCompare(a, b) {
    if (a.length !== b.length) {
      return false;
    }
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }
  /**
   * PBKDF2 promise wrapper
   */
  static pbkdf2(password, salt, iterations, keylen) {
    return new Promise((resolve, reject) => {
      crypto.pbkdf2(password, salt, iterations, keylen, "sha256", (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey);
      });
    });
  }
  /**
   * Generate secure session token
   */
  static generateSessionToken() {
    const timestamp = Date.now().toString(36);
    const random = this.generateSecureToken(16);
    return `${timestamp}.${random}`;
  }
  /**
   * Validate session token age
   */
  static isSessionTokenValid(token, maxAge = 864e5) {
    try {
      const [timestamp] = token.split(".");
      const tokenTime = parseInt(timestamp, 36);
      return Date.now() - tokenTime < maxAge;
    } catch {
      return false;
    }
  }
  /**
   * Encrypt sensitive configuration
   */
  static encryptConfig(config, masterKey) {
    const jsonString = JSON.stringify(config);
    return this.encrypt(jsonString, masterKey);
  }
  /**
   * Decrypt sensitive configuration
   */
  static decryptConfig(encryptedConfig, masterKey) {
    const decrypted = this.decrypt(encryptedConfig, masterKey);
    if (!decrypted) return null;
    try {
      return JSON.parse(decrypted);
    } catch {
      return null;
    }
  }
}
