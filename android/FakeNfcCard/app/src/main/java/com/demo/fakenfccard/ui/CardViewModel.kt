package com.demo.fakenfccard.ui

import androidx.lifecycle.ViewModel
import com.demo.fakenfccard.data.CardProfile
import com.demo.fakenfccard.data.CardRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update

data class CardUiState(
    val card: CardProfile? = null,
    val isNfcEnabled: Boolean = false,
    val showNewCardDialog: Boolean = false,
    val inputName: String = ""
)

class CardViewModel(private val repository: CardRepository) : ViewModel() {

    private val _uiState = MutableStateFlow(CardUiState())
    val uiState: StateFlow<CardUiState> = _uiState

    init {
        _uiState.update {
            it.copy(
                card = repository.loadCard(),
                isNfcEnabled = repository.isNfcEnabled()
            )
        }
    }

    fun generateCard(name: String) {
        val card = CardProfile.generate(name)
        repository.saveCard(card)
        _uiState.update { it.copy(card = card, showNewCardDialog = false, inputName = "") }
    }

    fun toggleNfc(enabled: Boolean) {
        repository.setNfcEnabled(enabled)
        _uiState.update { it.copy(isNfcEnabled = enabled) }
    }

    fun onNameInput(value: String) = _uiState.update { it.copy(inputName = value) }
    fun openDialog()  = _uiState.update { it.copy(showNewCardDialog = true) }
    fun closeDialog() = _uiState.update { it.copy(showNewCardDialog = false) }

    fun deleteCard() {
        repository.clearCard()
        _uiState.value = CardUiState()
    }
}
