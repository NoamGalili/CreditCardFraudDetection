package com.demo.nfcterminal.data

import com.google.gson.annotations.SerializedName

/**
 * Transaction body sent to POST /api/dashboard/inject.
 *
 * The first 12 fields are the model's REQUIRED_FIELDS (see server/ensemble.py).
 * The remaining fields are display-only: the model ignores them, but the
 * Command Center feed renders them (cardholder, card number, city/state, …).
 *
 * "long" is a Kotlin keyword, so @SerializedName maps it to the JSON key.
 */
data class Transaction(
    // ── Model features (REQUIRED_FIELDS) ────────────────────────────────
    @SerializedName("trans_date_trans_time") val transDateTransTime: String,
    val merchant: String,
    val category: String,
    val amt: Double,
    val gender: String,
    val lat: Double,
    @SerializedName("long") val longitude: Double,
    @SerializedName("city_pop") val cityPop: Long,
    val job: String,
    val dob: String,
    @SerializedName("merch_lat") val merchLat: Double,
    @SerializedName("merch_long") val merchLong: Double,
    // ── Display-only fields for the feed ────────────────────────────────
    val first: String,
    val last: String,
    @SerializedName("cc_num") val ccNum: String,
    val city: String,
    val state: String,
    val zip: String,
    @SerializedName("trans_num") val transNum: String,
    // Optional ground-truth label (demo fraud card sends 1). 0/1.
    @SerializedName("is_fraud") val isFraud: Int? = null,
)
