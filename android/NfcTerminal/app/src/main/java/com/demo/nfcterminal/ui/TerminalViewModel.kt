package com.demo.nfcterminal.ui

import android.nfc.Tag
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.demo.nfcterminal.data.CardPayload
import com.demo.nfcterminal.data.Transaction
import com.demo.nfcterminal.network.RetrofitClient
import com.demo.nfcterminal.nfc.NfcReader
import com.demo.nfcterminal.nfc.NfcResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.UUID

data class TerminalUiState(
    val cardPayload: CardPayload? = null,
    // Sale context set at the terminal. Defaults describe the demo "risky"
    // purchase (far-away, high-value, online) that the real model flags.
    val merchant: String = "Vivus Cafe",
    val category: String = "shopping_net",
    val amount: String = "1287.55",
    val merchLat: String = "33.9",
    val merchLong: String = "-118.2",
    val isScanning: Boolean = false,
    val isSubmitting: Boolean = false,
    val statusMessage: String = "Enter the amount, then tap card or phone to pay",
    val result: SubmitResult? = null
)

data class SubmitResult(
    val success: Boolean,
    /** The payment "went through" (the Google-Pay ✓) — true on any successful submit. */
    val paymentApproved: Boolean,
    val isFraud: Boolean?,
    val fraudScore: Double?,
    val message: String
)

class TerminalViewModel : ViewModel() {

    private val _uiState = MutableStateFlow(TerminalUiState())
    val uiState: StateFlow<TerminalUiState> = _uiState

    private val nfcReader = NfcReader()

    private val tsFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")

    /** Real NFC tap: read the card over ISO-DEP, then wait for submit. */
    fun onTagDiscovered(tag: Tag) {
        viewModelScope.launch {
            _uiState.update { it.copy(isScanning = true, statusMessage = "Reading card…") }

            when (val result = nfcReader.readCard(tag)) {
                is NfcResult.Success -> {
                    _uiState.update {
                        it.copy(cardPayload = result.payload, isScanning = false)
                    }
                    submitTransaction()   // POS: a tap charges immediately
                }
                is NfcResult.Error -> _uiState.update {
                    it.copy(isScanning = false, statusMessage = "Read error: ${result.message}")
                }
            }
        }
    }

    /**
     * Demo path with no NFC hardware: load the built-in "fraud persona" card
     * (a New York cardholder) exactly as if it had been tapped. Lets the whole
     * flow be demoed on the emulator or a single phone.
     */
    fun simulateTap() {
        val demoCard = CardPayload(
            card_id = "CARD_DEMO_NFC01",
            user_id = "USER_DEMO_NFC01",
            card_type = "demo",
            nonce = UUID.randomUUID().toString(),
            created_at = LocalDateTime.now().format(tsFormatter),
            first = "Alex",
            last = "Morgan",
            cc_num = "4539821004567890",
            gender = "M",
            dob = "1988-03-11",
            job = "Systems analyst",
            city = "New York",
            state = "NY",
            zip = "10001",
            city_pop = 8_400_000,
            lat = 40.7128,
            long = -74.0060,
        )
        _uiState.update {
            it.copy(cardPayload = demoCard, isScanning = false, result = null)
        }
        submitTransaction()   // POS: a tap charges immediately
    }

    fun onMerchantChanged(v: String)  = _uiState.update { it.copy(merchant = v) }
    fun onCategoryChanged(v: String)  = _uiState.update { it.copy(category = v) }
    fun onAmountChanged(v: String)    = _uiState.update { it.copy(amount = v) }
    fun onMerchLatChanged(v: String)  = _uiState.update { it.copy(merchLat = v) }
    fun onMerchLongChanged(v: String) = _uiState.update { it.copy(merchLong = v) }

    fun submitTransaction() {
        val state = _uiState.value
        val payload = state.cardPayload ?: return

        val amount = state.amount.toDoubleOrNull() ?: run {
            _uiState.update { it.copy(statusMessage = "Enter a valid amount") }
            return
        }

        val transaction = Transaction(
            transDateTransTime = LocalDateTime.now().format(tsFormatter),
            merchant  = state.merchant.ifBlank { "Demo Merchant" },
            category  = state.category.ifBlank { "misc_net" },
            amt       = amount,
            // Cardholder attributes come from the tapped card:
            gender    = payload.gender,
            lat       = payload.lat,
            longitude = payload.long,
            cityPop   = payload.city_pop,
            job       = payload.job,
            dob       = payload.dob,
            // Merchant location comes from the terminal:
            merchLat  = state.merchLat.toDoubleOrNull() ?: 0.0,
            merchLong = state.merchLong.toDoubleOrNull() ?: 0.0,
            // Display fields:
            first     = payload.first,
            last      = payload.last,
            ccNum     = payload.cc_num,
            city      = payload.city,
            state     = payload.state,
            zip       = payload.zip,
            transNum  = "NFC_${System.currentTimeMillis()}",
        )

        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true, statusMessage = "Charging card…") }
            try {
                val response = RetrofitClient.api.injectTransaction(transaction)
                if (response.isSuccessful) {
                    val body = response.body()
                    val fraud = body?.isFraud
                    val label = when (fraud) {
                        true  -> "FRAUD DETECTED"
                        false -> "LEGITIMATE"
                        else  -> "SUBMITTED"
                    }
                    _uiState.update {
                        it.copy(
                            isSubmitting = false,
                            statusMessage = "Payment approved · $label",
                            result = SubmitResult(
                                success = true,
                                paymentApproved = true,
                                isFraud = fraud,
                                fraudScore = body?.probability,
                                message = if (fraud == true)
                                    "The bank's model flagged this payment as fraud."
                                else
                                    "The bank's model cleared this payment."
                            )
                        )
                    }
                } else {
                    _uiState.update {
                        it.copy(
                            isSubmitting = false,
                            statusMessage = "Server error ${response.code()}",
                            result = SubmitResult(false, false, null, null, "Server error ${response.code()}")
                        )
                    }
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isSubmitting = false,
                        statusMessage = "Network error",
                        result = SubmitResult(false, false, null, null, "Network error: ${e.message}")
                    )
                }
            }
        }
    }

    fun reset() { _uiState.value = TerminalUiState() }
}
