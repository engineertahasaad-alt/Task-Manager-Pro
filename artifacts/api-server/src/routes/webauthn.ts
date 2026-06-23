import { Router } from "express";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { db, usersTable, webAuthnCredentialsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { signToken } from "../middlewares/auth";
import { serializeUser } from "./auth";
import { logger } from "../lib/logger";

const router = Router();

const RP_NAME = "TaskFlow";
const RP_ID = process.env.REPLIT_DEV_DOMAIN?.replace(/^https?:\/\//, "") ?? "localhost";
const ORIGIN = process.env.REPLIT_DEV_DOMAIN
  ? `https://${RP_ID}`
  : "http://localhost:3000";

const challengeStore = new Map<string, string>();

router.post("/auth/webauthn/register/options", requireAuth, async (req, res): Promise<void> => {
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id));
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const existingCreds = await db
      .select()
      .from(webAuthnCredentialsTable)
      .where(eq(webAuthnCredentialsTable.userId, user.id));

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userName: user.mobile,
      userDisplayName: user.fullName,
      attestationType: "none",
      excludeCredentials: existingCreds.map(c => ({
        id: c.credentialId,
        transports: (c.transports as any[]) ?? [],
      })),
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
      },
    });

    challengeStore.set(`reg_${user.id}`, options.challenge);
    setTimeout(() => challengeStore.delete(`reg_${user.id}`), 5 * 60 * 1000);

    res.json(options);
  } catch (err) {
    logger.error({ err }, "WebAuthn register options error");
    res.status(500).json({ error: "Failed to generate registration options" });
  }
});

router.post("/auth/webauthn/register/verify", requireAuth, async (req, res): Promise<void> => {
  try {
    const { credential } = req.body;
    const challenge = challengeStore.get(`reg_${req.user!.id}`);
    if (!challenge) { res.status(400).json({ error: "No pending registration" }); return; }

    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge: challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      res.status(400).json({ error: "Verification failed" });
      return;
    }

    const { credential: cred } = verification.registrationInfo;
    const credId = Buffer.from(cred.id).toString("base64url");

    await db.insert(webAuthnCredentialsTable).values({
      userId: req.user!.id,
      credentialId: credId,
      publicKey: Buffer.from(cred.publicKey).toString("base64"),
      counter: cred.counter,
      transports: credential.response?.transports ?? [],
    }).onConflictDoNothing();

    challengeStore.delete(`reg_${req.user!.id}`);
    res.json({ message: "Biometric registered successfully" });
  } catch (err) {
    logger.error({ err }, "WebAuthn register verify error");
    res.status(500).json({ error: "Verification failed" });
  }
});

router.post("/auth/webauthn/login/options", async (req, res): Promise<void> => {
  try {
    const { mobile } = req.body;
    if (!mobile) { res.status(400).json({ error: "mobile is required" }); return; }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.mobile, mobile));
    if (!user || !user.isActive) { res.status(404).json({ error: "User not found" }); return; }

    const creds = await db
      .select()
      .from(webAuthnCredentialsTable)
      .where(eq(webAuthnCredentialsTable.userId, user.id));

    if (creds.length === 0) {
      res.status(404).json({ error: "No biometric credentials registered" });
      return;
    }

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      userVerification: "preferred",
      allowCredentials: creds.map(c => ({
        id: c.credentialId,
        transports: (c.transports as any[]) ?? [],
      })),
    });

    challengeStore.set(`auth_${mobile}`, options.challenge);
    setTimeout(() => challengeStore.delete(`auth_${mobile}`), 5 * 60 * 1000);

    res.json({ ...options, userId: user.id });
  } catch (err) {
    logger.error({ err }, "WebAuthn login options error");
    res.status(500).json({ error: "Failed to generate login options" });
  }
});

router.post("/auth/webauthn/login/verify", async (req, res): Promise<void> => {
  try {
    const { mobile, credential } = req.body;
    if (!mobile || !credential) {
      res.status(400).json({ error: "mobile and credential are required" });
      return;
    }

    const challenge = challengeStore.get(`auth_${mobile}`);
    if (!challenge) { res.status(400).json({ error: "No pending authentication" }); return; }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.mobile, mobile));
    if (!user || !user.isActive) { res.status(401).json({ error: "Authentication failed" }); return; }

    const credId = credential.id;
    const [storedCred] = await db
      .select()
      .from(webAuthnCredentialsTable)
      .where(eq(webAuthnCredentialsTable.credentialId, credId));

    if (!storedCred) { res.status(401).json({ error: "Credential not found" }); return; }

    const verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge: challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: storedCred.credentialId,
        publicKey: new Uint8Array(Buffer.from(storedCred.publicKey, "base64")),
        counter: storedCred.counter,
        transports: (storedCred.transports as any[]) ?? [],
      },
    });

    if (!verification.verified) {
      res.status(401).json({ error: "Authentication failed" });
      return;
    }

    await db
      .update(webAuthnCredentialsTable)
      .set({ counter: verification.authenticationInfo.newCounter })
      .where(eq(webAuthnCredentialsTable.id, storedCred.id));

    challengeStore.delete(`auth_${mobile}`);

    const token = signToken(user.id);
    res.json({ token, user: serializeUser(user) });
  } catch (err) {
    logger.error({ err }, "WebAuthn login verify error");
    res.status(500).json({ error: "Authentication failed" });
  }
});

export default router;
