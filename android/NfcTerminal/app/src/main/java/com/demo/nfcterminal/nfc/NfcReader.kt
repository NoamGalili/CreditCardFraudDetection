package com.demo.nfcterminal.nfc

import android.nfc.Tag
import android.nfc.tech.IsoDep
import android.util.Log
import com.demo.nfcterminal.data.CardPayload
import com.demo.nfcterminal.nfc.ApduHelper.toHex
import com.google.gson.Gson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Drives the ISO-DEP channel to execute the two-step APDU exchange
 * with the HCE card app. Runs on an IO dispatcher so the calling
 * coroutine can be safely called from the main thread.
 *
 * Flow:
 *   connect()
 *   → transceive(SELECT AID)    → expect SW 90 00
 *   → transceive(GET_CARD_PAYLOAD) → expect JSON + SW 90 00
 *   close()
 */
class NfcReader {

    private val gson = Gson()

    suspend fun readCard(tag: Tag): NfcResult = withContext(Dispatchers.IO) {
        val isoDep = IsoDep.get(tag)
            ?: return@withContext NfcResult.Error("Tag does not support ISO-DEP")

        try {
            isoDep.connect()
            isoDep.timeout = 5_000  // 5 s per command

            // ── Step 1: SELECT AID ─────────────────────────────────────────
            val selectCmd = ApduHelper.buildSelectAid()
            Log.d(TAG, "→ SELECT AID:  ${selectCmd.toHex()}")

            val selectResp = isoDep.transceive(selectCmd)
            Log.d(TAG, "← SELECT resp: ${selectResp.toHex()}")

            if (!ApduHelper.isSuccess(selectResp)) {
                return@withContext NfcResult.Error(
                    "AID selection failed: SW ${selectResp.toHex()}"
                )
            }

            // ── Step 2: GET_CARD_PAYLOAD ───────────────────────────────────
            val getCmd = ApduHelper.buildGetCardPayload()
            Log.d(TAG, "→ GET_PAYLOAD: ${getCmd.toHex()}")

            val getResp = isoDep.transceive(getCmd)
            Log.d(TAG, "← GET resp (${getResp.size} bytes): ${getResp.toHex()}")

            if (!ApduHelper.isSuccess(getResp)) {
                return@withContext NfcResult.Error(
                    "Get payload failed: SW ${getResp.toHex()}"
                )
            }

            // ── Parse JSON ─────────────────────────────────────────────────
            val jsonBytes = ApduHelper.extractData(getResp)
            val json = String(jsonBytes, Charsets.UTF_8)
            Log.d(TAG, "Payload JSON: $json")

            val payload = gson.fromJson(json, CardPayload::class.java)
            NfcResult.Success(payload)

        } catch (e: Exception) {
            Log.e(TAG, "NFC read error", e)
            NfcResult.Error("NFC error: ${e.message ?: e.javaClass.simpleName}")
        } finally {
            runCatching { isoDep.close() }
        }
    }

    companion object {
        private const val TAG = "NfcReader"
    }
}
