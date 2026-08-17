package com.demo.fakenfccard.hce

import android.nfc.cardemulation.HostApduService
import android.os.Bundle
import android.util.Log
import com.demo.fakenfccard.data.CardPayload
import com.demo.fakenfccard.data.CardRepository
import com.google.gson.Gson
import java.util.UUID

/**
 * Custom HCE service implementing a two-command APDU protocol:
 *
 *   1. SELECT AID  (00 A4 04 00 07 F0 01 02 03 04 05 06 00)
 *      → Response: 90 00
 *
 *   2. GET_CARD_PAYLOAD  (80 CA 00 00 00)
 *      → Response: <UTF-8 JSON bytes> + 90 00
 *
 * This is NOT EMV and NOT a real payment protocol.
 * AID F0xxxxxx is in the proprietary/experimental range.
 */
class CardEmulationService : HostApduService() {

    companion object {
        private const val TAG = "CardEmulationService"

        // Custom AID bytes: F0 01 02 03 04 05 06
        private val EXPECTED_AID = byteArrayOf(
            0xF0.toByte(), 0x01, 0x02, 0x03, 0x04, 0x05, 0x06
        )

        // Status words
        val SW_OK                       = byteArrayOf(0x90.toByte(), 0x00)
        val SW_UNKNOWN_CMD              = byteArrayOf(0x6F.toByte(), 0x00)
        val SW_FILE_NOT_FOUND           = byteArrayOf(0x6A.toByte(), 0x82.toByte())
        val SW_CONDITIONS_NOT_SATISFIED = byteArrayOf(0x69.toByte(), 0x85.toByte())
    }

    private val gson = Gson()
    private lateinit var repository: CardRepository

    // Tracks whether SELECT AID was received first (guards GET_CARD_PAYLOAD)
    private var appSelected = false

    override fun onCreate() {
        super.onCreate()
        repository = CardRepository(this)
        Log.d(TAG, "Service created")
    }

    override fun processCommandApdu(commandApdu: ByteArray, extras: Bundle?): ByteArray {
        Log.d(TAG, "APDU IN  → ${commandApdu.toHex()}")

        if (!repository.isNfcEnabled()) {
            Log.d(TAG, "NFC disabled by user — rejecting")
            return SW_CONDITIONS_NOT_SATISFIED
        }

        val response = when {
            isSelectAid(commandApdu)      -> handleSelectAid()
            isGetCardPayload(commandApdu) -> handleGetCardPayload()
            else -> {
                Log.w(TAG, "Unknown command: ${commandApdu.toHex()}")
                SW_UNKNOWN_CMD
            }
        }

        Log.d(TAG, "APDU OUT ← ${response.toHex()}")
        return response
    }

    override fun onDeactivated(reason: Int) {
        appSelected = false
        Log.d(TAG, "Deactivated: ${if (reason == DEACTIVATION_LINK_LOSS) "LINK_LOSS" else "DESELECTED"}")
    }

    // ── APDU matchers ───────────────────────────────────────────────────────

    private fun isSelectAid(apdu: ByteArray): Boolean {
        // Minimum valid SELECT AID: CLA INS P1 P2 Lc AID(7) = 12 bytes
        if (apdu.size < 12) return false
        if (apdu[0] != 0x00.toByte()) return false  // CLA
        if (apdu[1] != 0xA4.toByte()) return false  // INS: SELECT
        if (apdu[2] != 0x04.toByte()) return false  // P1: select by name
        if (apdu[4] != 0x07.toByte()) return false  // Lc: AID length = 7
        val aidBytes = apdu.slice(5 until 12).toByteArray()
        return aidBytes.contentEquals(EXPECTED_AID)
    }

    private fun isGetCardPayload(apdu: ByteArray): Boolean {
        // GET_CARD_PAYLOAD: 80 CA 00 00 [Le]
        if (apdu.size < 4) return false
        return apdu[0] == 0x80.toByte() &&  // CLA: proprietary
               apdu[1] == 0xCA.toByte() &&  // INS: GET DATA
               apdu[2] == 0x00.toByte() &&  // P1
               apdu[3] == 0x00.toByte()     // P2
    }

    // ── Handlers ────────────────────────────────────────────────────────────

    private fun handleSelectAid(): ByteArray {
        appSelected = true
        Log.d(TAG, "AID selected OK")
        return SW_OK
    }

    private fun handleGetCardPayload(): ByteArray {
        if (!appSelected) {
            Log.w(TAG, "GET_CARD_PAYLOAD before SELECT — rejecting")
            return SW_CONDITIONS_NOT_SATISFIED
        }

        val card = repository.loadCard() ?: run {
            Log.w(TAG, "No card profile stored")
            return SW_FILE_NOT_FOUND
        }

        val payload = CardPayload(
            card_id    = card.cardId,
            user_id    = card.userId,
            card_type  = card.cardType,
            nonce      = UUID.randomUUID().toString(),
            created_at = java.time.Instant.now().toString()
        )

        val jsonBytes = gson.toJson(payload).toByteArray(Charsets.UTF_8)
        Log.d(TAG, "Sending payload (${jsonBytes.size} bytes): ${gson.toJson(payload)}")

        // Response layout: [JSON bytes][SW1 90][SW2 00]
        return jsonBytes + SW_OK
    }

    private fun ByteArray.toHex(): String = joinToString(" ") { "%02X".format(it) }
}
