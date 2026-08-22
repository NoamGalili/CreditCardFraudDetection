package com.demo.nfcterminal.nfc

/**
 * Builds the two APDU commands for the custom demo protocol.
 *
 * CUSTOM AID: F0 01 02 03 04 05 06
 *   - Starts with F0 → proprietary/experimental range, never conflicts with real AIDs.
 *
 * Protocol:
 *   Step 1 — SELECT AID
 *     C-APDU: 00 A4 04 00 07 F0 01 02 03 04 05 06 00
 *     R-APDU: 90 00
 *
 *   Step 2 — GET_CARD_PAYLOAD
 *     C-APDU: 80 CA 00 00 00
 *     R-APDU: <UTF-8 JSON bytes> 90 00
 */
object ApduHelper {

    // SELECT AID: CLA INS P1 P2 Lc AID(7 bytes) Le
    fun buildSelectAid(): ByteArray = byteArrayOf(
        0x00.toByte(),  // CLA: ISO/IEC 7816 class
        0xA4.toByte(),  // INS: SELECT FILE
        0x04.toByte(),  // P1:  select by name (DF name / AID)
        0x00.toByte(),  // P2:  first or only occurrence
        0x07.toByte(),  // Lc:  length of AID = 7 bytes
        0xF0.toByte(), 0x01, 0x02, 0x03, 0x04, 0x05, 0x06,  // AID
        0x00.toByte()   // Le:  no max length constraint on response
    )

    // GET_CARD_PAYLOAD: proprietary CLA, GET DATA INS
    fun buildGetCardPayload(): ByteArray = byteArrayOf(
        0x80.toByte(),  // CLA: proprietary class (bit 7 set)
        0xCA.toByte(),  // INS: GET DATA
        0x00.toByte(),  // P1
        0x00.toByte(),  // P2
        0x00.toByte()   // Le:  accept any response length
    )

    /** Returns true when the last two bytes are SW 90 00 (success). */
    fun isSuccess(response: ByteArray): Boolean {
        if (response.size < 2) return false
        return response[response.size - 2] == 0x90.toByte() &&
               response[response.size - 1] == 0x00.toByte()
    }

    /** Strips the trailing 2-byte status word and returns the data body. */
    fun extractData(response: ByteArray): ByteArray =
        if (response.size > 2) response.copyOfRange(0, response.size - 2)
        else ByteArray(0)

    fun ByteArray.toHex(): String = joinToString(" ") { "%02X".format(it) }
}
