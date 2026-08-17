package com.demo.nfcterminal.data

import com.google.gson.annotations.SerializedName

/**
 * Transaction body sent to POST /transactions.
 * Field names match the existing backend schema exactly.
 * "long" is a Kotlin keyword so we use @SerializedName.
 */
data class Transaction(
    @SerializedName("card_id")  val cardId: String,
    val merchant: String,
    val category: String,
    val amount: Double,
    val city: String,
    val lat: Double,
    @SerializedName("long")     val longitude: Double,
    val timestamp: String
)
