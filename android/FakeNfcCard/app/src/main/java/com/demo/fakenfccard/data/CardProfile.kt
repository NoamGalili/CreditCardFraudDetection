package com.demo.fakenfccard.data

import java.time.Instant
import java.util.UUID

/**
 * The simulated card. Beyond the ID it now carries the cardholder attributes
 * the fraud model consumes (gender, dob, job, home location, city population)
 * plus display fields (name, masked card number, city/state/zip) so the
 * backend Command Center can render a realistic row for the tap.
 *
 * NONE of this is real payment data — the card number is a demo Luhn-style
 * placeholder and the AID used over NFC is in the experimental range.
 */
data class CardProfile(
    val cardId: String,
    val userId: String,
    val cardType: String = "demo",
    val holderName: String,
    val createdAt: String,
    // Cardholder identity / display
    val firstName: String = "Alex",
    val lastName: String = "Morgan",
    val ccNum: String = "4539821004567890",
    val gender: String = "M",
    val dob: String = "1988-03-11",
    val job: String = "Systems analyst",
    // Home location (the model compares this to the merchant location)
    val city: String = "New York",
    val state: String = "NY",
    val zip: String = "10001",
    val cityPop: Long = 8_400_000,
    val homeLat: Double = 40.7128,
    val homeLong: Double = -74.0060,
) {
    companion object {
        /**
         * Generates the demo "fraud persona": a New York cardholder. When the
         * terminal defaults are used (a far-away, high-value online purchase),
         * the real ensemble scores this above the 0.69 threshold — the model
         * earns the flag, nothing is forced. See android/README.md.
         */
        fun generate(holderName: String): CardProfile {
            val suffix = UUID.randomUUID().toString().replace("-", "").take(6).uppercase()
            val name = holderName.trim().ifBlank { "Alex Morgan" }
            val parts = name.split(" ", limit = 2)
            return CardProfile(
                cardId = "CARD_DEMO_$suffix",
                userId = "USER_DEMO_$suffix",
                holderName = name,
                createdAt = Instant.now().toString(),
                firstName = parts.getOrElse(0) { "Alex" },
                lastName = parts.getOrElse(1) { "Morgan" },
            )
        }
    }
}
