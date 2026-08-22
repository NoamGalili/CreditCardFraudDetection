package com.demo.fakenfccard.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle

// Wallet palette (light, Google-Pay-like)
private val WalletBg = Color(0xFFFFFFFF)
private val WalletSurface = Color(0xFFF3F4F7)
private val WalletText = Color(0xFF1B1F27)
private val WalletDim = Color(0xFF6B7280)
private val WalletLine = Color(0xFFE3E6EC)
private val CardTop = Color(0xFF2B50E0)
private val CardBottom = Color(0xFF152a73)
private val Ready = Color(0xFF1E8E3E)

@Composable
fun CardScreen(viewModel: CardViewModel) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    Surface(color = WalletBg, modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 20.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp)
        ) {
            WalletHeader()

            if (state.card != null) {
                CardArt(state)
                if (state.isNfcEnabled) ReadyToTapPill()
                RecentActivity()
                Spacer(Modifier.weight(1f))
                ContactlessToggle(state.isNfcEnabled, viewModel::toggleNfc)
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                    OutlinedButton(
                        onClick = viewModel::openDialog,
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(24.dp),
                        border = androidx.compose.foundation.BorderStroke(1.dp, WalletLine)
                    ) { Text("Details", color = WalletText) }
                    OutlinedButton(
                        onClick = viewModel::deleteCard,
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(24.dp),
                        border = androidx.compose.foundation.BorderStroke(1.dp, WalletLine)
                    ) { Text("Remove", color = Color(0xFFB3261E)) }
                }
            } else {
                EmptyState(onGenerate = viewModel::openDialog)
            }
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
private fun WalletHeader() {
    Row(
        modifier = Modifier.fillMaxWidth().padding(bottom = 4.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier.size(24.dp).clip(RoundedCornerShape(7.dp))
                .background(Brush.linearGradient(listOf(CardTop, Color(0xFF00A15C)))),
            contentAlignment = Alignment.Center
        ) { Text("P", color = Color.White, fontWeight = FontWeight.Black, fontSize = 14.sp) }
        Spacer(Modifier.width(8.dp))
        Text("Pay", color = WalletText, fontWeight = FontWeight.Bold,
            style = MaterialTheme.typography.titleLarge)
    }
}

@Composable
private fun CardArt(state: CardUiState) {
    val card = state.card ?: return
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(200.dp)
            .clip(RoundedCornerShape(18.dp))
            .background(Brush.linearGradient(listOf(CardTop, CardBottom)))
            .padding(22.dp)
    ) {
        // Brand + "not real" tag
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("FraudGuard", color = Color.White, fontWeight = FontWeight.Black,
                style = MaterialTheme.typography.titleLarge)
            Text("SIMULATION — NOT A REAL CARD", color = Color(0xFFB9C6FF),
                fontSize = 9.sp, fontWeight = FontWeight.SemiBold)
        }

        Text("business debit", color = Color(0xFFC7D2FF), fontSize = 12.sp,
            modifier = Modifier.align(Alignment.CenterEnd).padding(top = 4.dp))

        // Bottom: masked number + holder + network mark
        Row(
            modifier = Modifier.align(Alignment.BottomStart).fillMaxWidth(),
            verticalAlignment = Alignment.Bottom,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column {
                Text("•••• ${card.ccNum.takeLast(4)}", color = Color.White,
                    fontFamily = FontFamily.Monospace, fontSize = 18.sp, fontWeight = FontWeight.Medium)
                Spacer(Modifier.height(4.dp))
                Text(card.holderName.uppercase(), color = Color(0xFFDBE3FF),
                    fontSize = 12.sp, letterSpacing = 1.sp)
            }
            NetworkMark()
        }
    }
}

@Composable
private fun NetworkMark() {
    Box(modifier = Modifier.width(46.dp).height(30.dp)) {
        Box(Modifier.size(28.dp).clip(CircleShape).background(Color(0xFFEB001B))
            .align(Alignment.CenterStart))
        Box(Modifier.size(28.dp).clip(CircleShape).background(Color(0xE6F79E1B))
            .align(Alignment.CenterEnd))
    }
}

@Composable
private fun ReadyToTapPill() {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(20.dp))
            .background(Color(0xFFE6F4EA))
            .padding(horizontal = 14.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Box(Modifier.size(8.dp).clip(CircleShape).background(Ready))
        Text("Ready to tap · hold near the reader", color = Color(0xFF14612A),
            style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun RecentActivity() {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Recent activity", color = WalletDim, style = MaterialTheme.typography.labelMedium)
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(Modifier.size(38.dp).clip(CircleShape).background(WalletSurface),
                    contentAlignment = Alignment.Center) {
                    Text("☕", fontSize = 18.sp)
                }
                Column {
                    Text("Vivus Cafe", color = WalletText, fontWeight = FontWeight.SemiBold)
                    Text("Tuesday", color = WalletDim, style = MaterialTheme.typography.bodySmall)
                }
            }
            Text("$25.98", color = WalletText, fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
private fun ContactlessToggle(enabled: Boolean, onToggle: (Boolean) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(WalletSurface)
            .padding(16.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column {
            Text("Contactless payments", color = WalletText, fontWeight = FontWeight.Medium)
            Text(
                if (enabled) "This phone responds to terminal taps"
                else "Turn on to pay by tapping",
                color = WalletDim, style = MaterialTheme.typography.bodySmall
            )
        }
        Switch(checked = enabled, onCheckedChange = onToggle)
    }
}

@Composable
private fun EmptyState(onGenerate: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(vertical = 48.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Spacer(Modifier.height(40.dp))
        Text("No card yet", color = WalletText, style = MaterialTheme.typography.titleMedium)
        Text(
            "Add a simulated card to pay by tapping.\nFor demo purposes only.",
            color = WalletDim, textAlign = TextAlign.Center,
            style = MaterialTheme.typography.bodyMedium
        )
        Button(onClick = onGenerate, shape = RoundedCornerShape(24.dp),
            colors = ButtonDefaults.buttonColors(containerColor = CardTop)) {
            Text("Add a card")
        }
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
        title = { Text("New demo card") },
        text = {
            OutlinedTextField(
                value = nameValue,
                onValueChange = onNameChange,
                label = { Text("Cardholder name") },
                placeholder = { Text("e.g. Alex Morgan") },
                singleLine = true
            )
        },
        confirmButton = {
            TextButton(onClick = onConfirm, enabled = nameValue.isNotBlank()) { Text("Add") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}
