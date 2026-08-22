package com.demo.fakenfccard.data

import android.content.Context
import com.google.gson.Gson

class CardRepository(context: Context) {

    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val gson = Gson()

    fun saveCard(card: CardProfile) {
        prefs.edit().putString(KEY_CARD, gson.toJson(card)).apply()
    }

    fun loadCard(): CardProfile? {
        val json = prefs.getString(KEY_CARD, null) ?: return null
        return runCatching { gson.fromJson(json, CardProfile::class.java) }.getOrNull()
    }

    fun isNfcEnabled(): Boolean = prefs.getBoolean(KEY_NFC_ENABLED, false)

    fun setNfcEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_NFC_ENABLED, enabled).apply()
    }

    fun clearCard() {
        prefs.edit().remove(KEY_CARD).remove(KEY_NFC_ENABLED).apply()
    }

    companion object {
        private const val PREFS_NAME = "card_prefs"
        private const val KEY_CARD = "card_profile"
        private const val KEY_NFC_ENABLED = "nfc_enabled"
    }
}
