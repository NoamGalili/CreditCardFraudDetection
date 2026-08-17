package com.demo.fakenfccard.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle

@Composable
fun CardScreen(viewModel: CardViewModel) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text(
            text = "NFC Demo Card",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold
        )

        if (state.card != null) {
            CardVisual(state)
            NfcToggleRow(state.isNfcEnabled, viewModel::toggleNfc)
            ActionButtons(
                onNewCard = viewModel::openDialog,
                onDelete  = viewModel::deleteCard
            )
        } else {
            EmptyState(onGenerate = viewModel::openDialog)
        }
    }

    if (state.showNewCardDialog) {
        NewCardDialog(
            nameValue = state.inputName,
            onNameChange = viewModel::onNameInput,
            onConfirm = { viewModel.generateCard(state.inputName) },
            onDismiss = viewModel::closeDialog
        )
    }
}

@Composable
private fun CardVisual(state: CardUiState) {
    val card = state.card ?: return
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
    ) {
        Column(
            modifier = Modifier.padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Text(
                text = "SIMULATION CARD — NOT REAL",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.error
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text = card.holderName,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold
            )
            Text(
                text = card.cardId,
                style = MaterialTheme.typography.bodyLarge,
                fontFamily = FontFamily.Monospace
            )
            Text(
                text = card.userId,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.7f)
            )
            Divider(modifier = Modifier.padding(vertical = 6.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text("Type: ${card.cardType}", style = MaterialTheme.typography.bodySmall)
                val nfcColor = if (state.isNfcEnabled) Color(0xFF2E7D32) else MaterialTheme.colorScheme.error
                Text(
                    text = if (state.isNfcEnabled) "NFC ACTIVE" else "NFC OFF",
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.SemiBold,
                    color = nfcColor
                )
            }
        }
    }
}

@Composable
private fun NfcToggleRow(enabled: Boolean, onToggle: (Boolean) -> Unit) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    text = "NFC Card Mode",
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium
                )
                Text(
                    text = if (enabled) "Card will respond to terminal taps"
                           else "Card is inactive — tap to enable",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Switch(checked = enabled, onCheckedChange = onToggle)
        }
    }
}

@Composable
private fun ActionButtons(onNewCard: () -> Unit, onDelete: () -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedButton(
            onClick = onNewCard,
            modifier = Modifier.weight(1f)
        ) { Text("New Card") }

        Button(
            onClick = onDelete,
            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
            modifier = Modifier.weight(1f)
        ) { Text("Delete Card") }
    }
}

@Composable
private fun EmptyState(onGenerate: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 48.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text("No card configured", style = MaterialTheme.typography.titleMedium)
        Text(
            text = "Generate a simulated card to begin.\nThis is for demo purposes only.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center
        )
        Button(onClick = onGenerate) { Text("Generate Demo Card") }
    }
}

@Composable
private fun NewCardDialog(
    nameValue: String,
    onNameChange: (String) -> Unit,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("New Demo Card") },
        text = {
            OutlinedTextField(
                value = nameValue,
                onValueChange = onNameChange,
                label = { Text("Cardholder Name") },
                placeholder = { Text("e.g. Alice Demo") },
                singleLine = true
            )
        },
        confirmButton = {
            TextButton(onClick = onConfirm, enabled = nameValue.isNotBlank()) {
                Text("Generate")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}
