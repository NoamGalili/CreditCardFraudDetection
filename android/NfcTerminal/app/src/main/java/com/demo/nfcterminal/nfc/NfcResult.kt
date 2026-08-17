package com.demo.nfcterminal.nfc

import com.demo.nfcterminal.data.CardPayload

sealed class NfcResult {
    data class Success(val payload: CardPayload) : NfcResult()
    data class Error(val message: String) : NfcResult()
}
