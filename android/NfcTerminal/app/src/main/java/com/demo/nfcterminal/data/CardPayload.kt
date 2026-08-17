package com.demo.nfcterminal.data

/** JSON payload received from the HCE card over NFC. */
data class CardPayload(
    val card_id: String,
    val user_id: String,
    val card_type: String,
    val nonce: String,
    val created_at: String
)
