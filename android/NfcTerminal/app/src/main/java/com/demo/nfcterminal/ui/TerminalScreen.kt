package com.demo.nfcterminal.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle

@Composable
fun TerminalScreen(viewModel: TerminalViewModel) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text(
            text = "NFC Terminal",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold
        )

        StatusBar(state)

        if (state.cardPayload != null && state.result == null) {
            CardInfoSection(state)
            TransactionForm(state, viewModel)
            Button(
                onClick = viewModel::submitTransaction,
                enabled = !state.isSubmitting && state.amount.isNotBlank(),
                modifier = Modifier.fillMaxWidth()
            ) {
                if (state.isSubmitting) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        color = MaterialTheme.colorScheme.onPrimary,
                        strokeWidth = 2.dp
                    )
                    Spacer(Modifier.width(8.dp))
                    Text("Submitting…")
                } else {
                    Text("Submit Transaction")
                }
            }
        }

        state.result?.let { result ->
            ResultSection(result)
            Spacer(Modifier.height(8.dp))
            OutlinedButton(
                onClick = viewModel::reset,
                modifier = Modifier.fillMaxWidth()
            ) { Text("New Transaction") }
        }
    }
}

@Composable
private fun StatusBar(state: TerminalUiState) {
    val bgColor = when {
        state.isScanning || state.isSubmitting -> MaterialTheme.colorScheme.secondaryContainer
        state.result?.success == true && state.result.isFraud == false -> Color(0xFFE8F5E9)
        state.result?.success == true && state.result.isFraud == true  -> Color(0xFFFFF3E0)
        state.result?.success == false -> MaterialTheme.colorScheme.errorContainer
        else -> MaterialTheme.colorScheme.surfaceVariant
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = bgColor)
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            if (state.isScanning || state.isSubmitting) {
                CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
            }
            Text(state.statusMessage, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
private fun CardInfoSection(state: TerminalUiState) {
    val payload = state.cardPayload ?: return
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Text(
                text = "Card Identified",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.primary
            )
            Text(
                text = payload.card_id,
                style = MaterialTheme.typography.bodyLarge,
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.Bold
            )
            Text("User: ${payload.user_id}", style = MaterialTheme.typography.bodySmall)
            Text(
                text = "Type: ${payload.card_type}   Nonce: ${payload.nonce.take(8)}…",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun TransactionForm(state: TerminalUiState, vm: TerminalViewModel) {
    OutlinedTextField(
        value = state.merchant,
        onValueChange = vm::onMerchantChanged,
        label = { Text("Merchant") },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true
    )
    OutlinedTextField(
        value = state.category,
        onValueChange = vm::onCategoryChanged,
        label = { Text("Category  (e.g. shopping, food, travel)") },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true
    )
    OutlinedTextField(
        value = state.amount,
        onValueChange = vm::onAmountChanged,
        label = { Text("Amount") },
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
        modifier = Modifier.fillMaxWidth(),
        singleLine = true
    )
    OutlinedTextField(
        value = state.city,
        onValueChange = vm::onCityChanged,
        label = { Text("City") },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true
    )
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(
            value = state.lat,
            onValueChange = vm::onLatChanged,
            label = { Text("Latitude") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
            modifier = Modifier.weight(1f),
            singleLine = true
        )
        OutlinedTextField(
            value = state.lon,
            onValueChange = vm::onLonChanged,
            label = { Text("Longitude") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
            modifier = Modifier.weight(1f),
            singleLine = true
        )
    }
}

@Composable
private fun ResultSection(result: SubmitResult) {
    val (bg, headline) = when {
        result.success && result.isFraud == false -> Color(0xFFE8F5E9) to "APPROVED"
        result.success && result.isFraud == true  -> Color(0xFFFFF3E0) to "FRAUD ALERT"
        result.success                            -> Color(0xFFE3F2FD) to "SUBMITTED"
        else                                      -> MaterialTheme.colorScheme.errorContainer to "ERROR"
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = bg)
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Text(headline, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            result.fraudScore?.let {
                Text(
                    text = "Fraud score: ${"%.4f".format(it)}",
                    style = MaterialTheme.typography.bodyLarge
                )
            }
            if (result.message.isNotBlank() && result.message != headline) {
                Text(result.message, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}
