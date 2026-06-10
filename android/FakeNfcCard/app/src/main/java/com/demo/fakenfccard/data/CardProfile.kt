package com.demo.fakenfccard.data

import java.time.Instant
import java.util.UUID

data class CardProfile(
    val cardId: String,
    val userId: String,
    val cardType: String = "demo",
    val holderName: String,
    val createdAt: String
) {
    companion object {
        fun generate(holderName: String): CardProfile {
            val suffix = UUID.randomUUID().toString().replace("-", "").take(6).uppercase()
            return CardProfile(
                cardId = "CARD_DEMO_$suffix",
                userId = "USER_DEMO_$suffix",
                holderName = holderName.trim().ifBlank { "Demo User" },
                createdAt = Instant.now().toString()
            )
        }
    }
}
