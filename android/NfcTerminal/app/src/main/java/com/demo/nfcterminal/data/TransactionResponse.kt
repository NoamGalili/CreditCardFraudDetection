package com.demo.nfcterminal.data

/** Response envelope from the existing backend. */
data class TransactionResponse(
    val status: String,
    val transaction_id: String? = null,
    val fraud_score: Double? = null,
    val is_fraud: Boolean? = null,
    val message: String? = null
)
