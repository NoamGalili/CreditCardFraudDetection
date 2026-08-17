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
import java.time.Instant

data class TerminalUiState(
    val cardPayload: CardPayload? = null,
    val merchant: String = "",
    val category: String = "",
    val amount: String = "",
    val city: String = "",
    val lat: String = "",
    val lon: String = "",
    val isScanning: Boolean = false,
    val isSubmitting: Boolean = false,
    val statusMessage: String = "Hold a demo card near the device",
    val result: SubmitResult? = null
)

data class SubmitResult(
    val success: Boolean,
    val fraudScore: Double?,
    val isFraud: Boolean?,
    val message: String
)

class TerminalViewModel : ViewModel() {

    private val _uiState = MutableStateFlow(TerminalUiState())
    val uiState: StateFlow<TerminalUiState> = _uiState

    private val nfcReader = NfcReader()

    fun onTagDiscovered(tag: Tag) {
        viewModelScope.launch {
            _uiState.update { it.copy(isScanning = true, statusMessage = "Reading card…") }

            when (val result = nfcReader.readCard(tag)) {
                is NfcResult.Success -> _uiState.update {
                    it.copy(
                        cardPayload = result.payload,
                        isScanning = false,
                        statusMessage = "Card read — fill in transaction details"
                    )
                }
                is NfcResult.Error -> _uiState.update {
                    it.copy(isScanning = false, statusMessage = "Read error: ${result.message}")
                }
            }
        }
    }

    fun onMerchantChanged(v: String)  = _uiState.update { it.copy(merchant = v) }
    fun onCategoryChanged(v: String)  = _uiState.update { it.copy(category = v) }
    fun onAmountChanged(v: String)    = _uiState.update { it.copy(amount = v) }
    fun onCityChanged(v: String)      = _uiState.update { it.copy(city = v) }
    fun onLatChanged(v: String)       = _uiState.update { it.copy(lat = v) }
    fun onLonChanged(v: String)       = _uiState.update { it.copy(lon = v) }

    fun submitTransaction() {
        val state = _uiState.value
        val payload = state.cardPayload ?: return

        val amount = state.amount.toDoubleOrNull() ?: run {
            _uiState.update { it.copy(statusMessage = "Enter a valid amount") }
            return
        }

        val transaction = Transaction(
            cardId    = payload.card_id,
            merchant  = state.merchant.ifBlank { "Demo Merchant" },
            category  = state.category.ifBlank { "general" },
            amount    = amount,
            city      = state.city.ifBlank { "Unknown" },
            lat       = state.lat.toDoubleOrNull() ?: 0.0,
            longitude = state.lon.toDoubleOrNull() ?: 0.0,
            timestamp = Instant.now().toString()
        )

        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true, statusMessage = "Submitting…") }
            try {
                val response = RetrofitClient.api.submitTransaction(transaction)
                if (response.isSuccessful) {
                    val body = response.body()
                    val label = when {
                        body?.is_fraud == true  -> "FLAGGED AS FRAUD"
                        body?.is_fraud == false -> "APPROVED"
                        else                    -> "SUBMITTED"
                    }
                    _uiState.update {
                        it.copy(
                            isSubmitting = false,
                            statusMessage = label,
                            result = SubmitResult(
                                success    = true,
                                fraudScore = body?.fraud_score,
                                isFraud    = body?.is_fraud,
                                message    = body?.message ?: label
                            )
                        )
                    }
                } else {
                    _uiState.update {
                        it.copy(
                            isSubmitting = false,
                            result = SubmitResult(false, null, null, "Server error ${response.code()}")
                        )
                    }
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isSubmitting = false,
                        result = SubmitResult(false, null, null, "Network error: ${e.message}")
                    )
                }
            }
        }
    }

    fun reset() { _uiState.value = TerminalUiState() }
}
