/**
 * Server-only password helpers — bcrypt hashing + a strong-password
 * generator used when an owner creates a user without specifying one.
 */
import "server-only";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

const BCRYPT_COST = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Generate a memorable-but-strong initial password. URL-safe base64
 * gives us ~6 bits/char, so 16 chars ≈ 96 bits of entropy — plenty for
 * a password that will be changed on first sign-in.
 */
export function generatePassword(): string {
  return randomBytes(12).toString("base64url");
}

/**
 * Minimum-viable password policy. Tighten later if needed.
 */
export function validatePasswordStrength(plain: string): string | null {
  if (plain.length < 12) return "Password must be at least 12 characters.";
  if (plain.length > 200) return "Password is too long (max 200).";
  return null;
}
