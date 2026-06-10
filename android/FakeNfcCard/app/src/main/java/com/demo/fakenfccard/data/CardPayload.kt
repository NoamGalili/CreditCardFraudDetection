package com.demo.fakenfccard.data

/**
 * JSON payload transmitted over NFC to the terminal.
 * Serialised to UTF-8 bytes and appended with SW 90 00.
 */
data class CardPayload(
    val card_id: String,
    val user_id: String,
    val card_type: String,
    val nonce: String,
    val created_at: String
)
