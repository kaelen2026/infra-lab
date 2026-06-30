import { huks } from "@kit.UniversalKeystoreKit";
import { cryptoFramework } from "@kit.CryptoArchitectureKit";
import { preferences } from "@kit.ArkData";
import { util } from "@kit.ArkTS";
import { common } from "@kit.AbilityKit";
import { AuthTokens } from "../common/contracts";
import { TokenStore } from "./AuthClient";

/**
 * {@link TokenStore} that encrypts the token blob with a non-exportable AES-256-GCM
 * key held in HUKS, then persists the ciphertext (base64) in Preferences. The key
 * never leaves the secure keystore; Preferences only ever sees opaque bytes.
 *
 * Stored layout: base64( nonce[12] ‖ ciphertext ‖ tag[16] ).
 */
const KEY_ALIAS: string = "infra.auth.tokens.aes";
const PREFS_STORE: string = "infra_auth";
const TOKENS_KEY: string = "auth.tokens";
const AAD: string = "infra.auth.v1";
const NONCE_LEN: number = 12;
const TAG_LEN: number = 16;

function strToBytes(value: string): Uint8Array {
  return new util.TextEncoder().encodeInto(value);
}

function bytesToStr(bytes: Uint8Array): string {
  return util.TextDecoder.create("utf-8").decodeToString(bytes);
}

function emptyOptions(): huks.HuksOptions {
  return { properties: [] };
}

function baseCipherProps(purpose: number): Array<huks.HuksParam> {
  return [
    { tag: huks.HuksTag.HUKS_TAG_ALGORITHM, value: huks.HuksKeyAlg.HUKS_ALG_AES },
    { tag: huks.HuksTag.HUKS_TAG_KEY_SIZE, value: huks.HuksKeySize.HUKS_AES_KEY_SIZE_256 },
    { tag: huks.HuksTag.HUKS_TAG_PURPOSE, value: purpose },
    { tag: huks.HuksTag.HUKS_TAG_PADDING, value: huks.HuksKeyPadding.HUKS_PADDING_NONE },
    { tag: huks.HuksTag.HUKS_TAG_BLOCK_MODE, value: huks.HuksCipherMode.HUKS_MODE_GCM },
    { tag: huks.HuksTag.HUKS_TAG_DIGEST, value: huks.HuksKeyDigest.HUKS_DIGEST_NONE },
  ];
}

async function ensureKey(): Promise<void> {
  // `hasKeyItem` returns a boolean; the older `isKeyItemExist` is deprecated and
  // *rejects* with HUKS_ERR_CODE_ITEM_NOT_EXIST (12000011) when the key is absent,
  // which would make the check-then-create logic throw on every fresh install.
  let exists = false;
  try {
    exists = await huks.hasKeyItem(KEY_ALIAS, emptyOptions());
  } catch (_e) {
    exists = false;
  }
  if (exists) {
    return;
  }
  const props: Array<huks.HuksParam> = [
    { tag: huks.HuksTag.HUKS_TAG_ALGORITHM, value: huks.HuksKeyAlg.HUKS_ALG_AES },
    { tag: huks.HuksTag.HUKS_TAG_KEY_SIZE, value: huks.HuksKeySize.HUKS_AES_KEY_SIZE_256 },
    {
      tag: huks.HuksTag.HUKS_TAG_PURPOSE,
      value: huks.HuksKeyPurpose.HUKS_KEY_PURPOSE_ENCRYPT | huks.HuksKeyPurpose.HUKS_KEY_PURPOSE_DECRYPT,
    },
    { tag: huks.HuksTag.HUKS_TAG_PADDING, value: huks.HuksKeyPadding.HUKS_PADDING_NONE },
    { tag: huks.HuksTag.HUKS_TAG_BLOCK_MODE, value: huks.HuksCipherMode.HUKS_MODE_GCM },
    { tag: huks.HuksTag.HUKS_TAG_DIGEST, value: huks.HuksKeyDigest.HUKS_DIGEST_NONE },
  ];
  await huks.generateKeyItem(KEY_ALIAS, { properties: props });
}

async function encrypt(plain: Uint8Array): Promise<Uint8Array> {
  const nonce: Uint8Array = cryptoFramework.createRandom().generateRandomSync(NONCE_LEN).data;
  const props: Array<huks.HuksParam> = baseCipherProps(huks.HuksKeyPurpose.HUKS_KEY_PURPOSE_ENCRYPT);
  props.push({ tag: huks.HuksTag.HUKS_TAG_NONCE, value: nonce });
  props.push({ tag: huks.HuksTag.HUKS_TAG_ASSOCIATED_DATA, value: strToBytes(AAD) });

  const options: huks.HuksOptions = { properties: props, inData: plain };
  const session: huks.HuksSessionHandle = await huks.initSession(KEY_ALIAS, options);
  const result: huks.HuksReturnResult = await huks.finishSession(session.handle, options);
  // GCM finishSession output is ciphertext ‖ tag(16). Prepend the nonce for storage.
  const cipherAndTag: Uint8Array = result.outData as Uint8Array;
  const blob: Uint8Array = new Uint8Array(NONCE_LEN + cipherAndTag.length);
  blob.set(nonce, 0);
  blob.set(cipherAndTag, NONCE_LEN);
  return blob;
}

async function decrypt(blob: Uint8Array): Promise<Uint8Array> {
  const nonce: Uint8Array = blob.slice(0, NONCE_LEN);
  const body: Uint8Array = blob.slice(NONCE_LEN);
  const cipher: Uint8Array = body.slice(0, body.length - TAG_LEN);
  const tag: Uint8Array = body.slice(body.length - TAG_LEN);

  const props: Array<huks.HuksParam> = baseCipherProps(huks.HuksKeyPurpose.HUKS_KEY_PURPOSE_DECRYPT);
  props.push({ tag: huks.HuksTag.HUKS_TAG_NONCE, value: nonce });
  props.push({ tag: huks.HuksTag.HUKS_TAG_ASSOCIATED_DATA, value: strToBytes(AAD) });
  props.push({ tag: huks.HuksTag.HUKS_TAG_AE_TAG, value: tag });

  const options: huks.HuksOptions = { properties: props, inData: cipher };
  const session: huks.HuksSessionHandle = await huks.initSession(KEY_ALIAS, options);
  const result: huks.HuksReturnResult = await huks.finishSession(session.handle, options);
  return result.outData as Uint8Array;
}

export class HuksTokenStore implements TokenStore {
  private readonly context: common.Context;
  private prefs: preferences.Preferences | null = null;
  private readonly base64: util.Base64Helper = new util.Base64Helper();

  constructor(context: common.Context) {
    this.context = context;
  }

  private async store(): Promise<preferences.Preferences> {
    if (this.prefs === null) {
      this.prefs = await preferences.getPreferences(this.context, PREFS_STORE);
    }
    return this.prefs;
  }

  async load(): Promise<AuthTokens | null> {
    const store: preferences.Preferences = await this.store();
    const encoded: string = (await store.get(TOKENS_KEY, "")) as string;
    if (encoded.length === 0) {
      return null;
    }
    try {
      const blob: Uint8Array = this.base64.decodeSync(encoded);
      const plain: Uint8Array = await decrypt(blob);
      return JSON.parse(bytesToStr(plain)) as AuthTokens;
    } catch (_e) {
      // Corrupt/undecryptable blob (e.g. key rotated) — treat as logged out.
      return null;
    }
  }

  async save(tokens: AuthTokens): Promise<void> {
    await ensureKey();
    const blob: Uint8Array = await encrypt(strToBytes(JSON.stringify(tokens)));
    const encoded: string = this.base64.encodeToStringSync(blob);
    const store: preferences.Preferences = await this.store();
    await store.put(TOKENS_KEY, encoded);
    await store.flush();
  }

  async clear(): Promise<void> {
    const store: preferences.Preferences = await this.store();
    await store.delete(TOKENS_KEY);
    await store.flush();
  }
}
