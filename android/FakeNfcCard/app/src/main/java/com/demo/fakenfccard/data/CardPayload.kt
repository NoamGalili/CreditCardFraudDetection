package com.demo.fakenfccard.data

/**
 * JSON payload transmitted over NFC to the terminal.
 * Serialised to UTF-8 bytes and appended with SW 90 00.
 *
 * Carries the cardholder attributes the fraud model needs plus display fields.
 * Must stay structurally identical to the terminal app's CardPayload so Gson
 * on the reader side deserialises it cleanly.
 */
data class CardPayload(
    val card_id: String,
    val user_id: String,
    val card_type: String,
    val nonce: String,
    val created_at: String,
    // Cardholder identity / display
    val first: String,
    val last: String,
    val cc_num: String,
    val gender: String,
    val dob: String,
    val job: String,
    // Home location + demographics used by the model
    val city: String,
    val state: String,
    val zip: String,
    val city_pop: Long,
    val lat: Double,
    val long: Double,
)
