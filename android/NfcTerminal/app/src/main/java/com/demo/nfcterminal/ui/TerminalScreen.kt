package com.demo.nfcterminal.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle

// Point-of-sale palette
private val PosBg = Color(0xFF0E1524)
private val PosSurface = Color(0xFF16203A)
private val PosLine = Color(0xFF243350)
private val PosText = Color(0xFFEAF0FB)
private val PosDim = Color(0xFF93A4C4)
private val Brand = Color(0xFF3D7BFF)
private val Pay = Color(0xFF1FB85B)
private val PayDeep = Color(0xFF0E7C3A)
private val Fraud = Color(0xFFFF5C52)

@Composable
fun TerminalScreen(viewModel: TerminalViewModel) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    Surface(color = PosBg, modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp)
        ) {
            MerchantHeader(state.merchant)

            when {
                state.result != null -> ResultView(state.result!!, viewModel::reset)
                state.isScanning || state.isSubmitting -> ProcessingView(state.statusMessage)
                else -> SaleView(state, viewModel)
            }
        }
    }
}

@Composable
private fun MerchantHeader(shop: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(
            modifier = Modifier.size(34.dp).clip(RoundedCornerShape(9.dp)).background(Brand),
            contentAlignment = Alignment.Center
        ) { Text("V", color = Color.White, fontWeight = FontWeight.Black) }
        Column {
            Text(shop, color = PosText, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
            Text("Point of sale", color = PosDim, style = MaterialTheme.typography.labelSmall)
        }
    }
}

@Composable
private fun SaleView(state: TerminalUiState, vm: TerminalViewModel) {
    var advanced by remember { mutableStateOf(false) }

    // Amount — the hero of a POS screen.
    Column(
        modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Text("AMOUNT DUE", color = PosDim, style = MaterialTheme.typography.labelMedium)
        Row(verticalAlignment = Alignment.Top) {
            Text("$", color = PosDim, fontSize = 26.sp, modifier = Modifier.padding(top = 8.dp, end = 2.dp))
            BasicAmountField(state.amount, vm::onAmountChanged)
        }
    }

    OutlinedTextField(
        value = state.category,
        onValueChange = vm::onCategoryChanged,
        label = { Text("Category") },
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
        colors = posFieldColors()
    )

    // Contactless prompt — the "tap here" moment.
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = PosSurface),
        border = androidx.compose.foundation.BorderStroke(1.dp, PosLine)
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            ContactlessWaves()
            Text("Tap card or phone to pay", color = PosText,
                fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.titleMedium)
            Text("Hold the device near the reader", color = PosDim,
                style = MaterialTheme.typography.bodySmall)
        }
    }

    Button(
        onClick = vm::simulateTap,
        modifier = Modifier.fillMaxWidth().height(52.dp),
        shape = RoundedCornerShape(14.dp),
        colors = ButtonDefaults.buttonColors(containerColor = Brand)
    ) { Text("Simulate Tap (Demo)", fontWeight = FontWeight.Bold) }

    TextButton(onClick = { advanced = !advanced }, modifier = Modifier.align(Alignment.CenterHorizontally)) {
        Text(if (advanced) "Hide merchant location" else "Merchant location (advanced)", color = PosDim)
    }
    AnimatedVisibility(visible = advanced) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            OutlinedTextField(
                value = state.merchLat, onValueChange = vm::onMerchLatChanged,
                label = { Text("Merchant lat") }, singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                modifier = Modifier.weight(1f), colors = posFieldColors()
            )
            OutlinedTextField(
                value = state.merchLong, onValueChange = vm::onMerchLongChanged,
                label = { Text("Merchant long") }, singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                modifier = Modifier.weight(1f), colors = posFieldColors()
            )
        }
    }
}

@Composable
private fun BasicAmountField(value: String, onChange: (String) -> Unit) {
    // A large, centered amount that stays editable.
    TextField(
        value = value,
        onValueChange = { onChange(it.filter { c -> c.isDigit() || c == '.' }) },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
        textStyle = MaterialTheme.typography.displaySmall.copy(
            fontWeight = FontWeight.Bold, color = PosText
        ),
        colors = TextFieldDefaults.colors(
            focusedContainerColor = Color.Transparent,
            unfocusedContainerColor = Color.Transparent,
            focusedIndicatorColor = Color.Transparent,
            unfocusedIndicatorColor = Color.Transparent,
            cursorColor = Brand
        ),
        modifier = Modifier.widthIn(min = 40.dp)
    )
}

@Composable
private fun ContactlessWaves() {
    val wave = Brand
    Canvas(modifier = Modifier.size(56.dp)) {
        val stroke = Stroke(width = size.minDimension * 0.07f)
        val cx = size.width * 0.28f
        val cy = size.height / 2f
        // three nested arcs opening to the right — the contactless symbol
        for (i in 1..3) {
            val r = size.minDimension * (0.16f * i)
            drawArc(
                color = wave,
                startAngle = -55f,
                sweepAngle = 110f,
                useCenter = false,
                topLeft = Offset(cx - r, cy - r),
                size = Size(r * 2, r * 2),
                style = stroke
            )
        }
    }
}

@Composable
private fun ProcessingView(msg: String) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = 60.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(20.dp)
    ) {
        CircularProgressIndicator(color = Brand, strokeWidth = 3.dp, modifier = Modifier.size(52.dp))
        Text(msg, color = PosText, style = MaterialTheme.typography.titleMedium)
        Text("Do not remove the card", color = PosDim, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun ResultView(result: SubmitResult, onReset: () -> Unit) {
    if (!result.success) {
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(18.dp),
            colors = CardDefaults.cardColors(containerColor = PosSurface)
        ) {
            Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Payment Failed", color = Fraud, style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold)
                Text(result.message, color = PosDim)
            }
        }
        Spacer(Modifier.height(4.dp))
        NewSaleButton(onReset)
        return
    }

    // 1) The payment cleared — the Google-Pay-style ✓ (always on success).
    Column(
        modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Box(
            modifier = Modifier.size(76.dp).clip(CircleShape).background(Pay),
            contentAlignment = Alignment.Center
        ) { Text("✓", color = Color.White, fontSize = 44.sp, fontWeight = FontWeight.Black) }
        Text("Payment Approved", color = PosText, style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold)
        result.fraudScore?.let {
            Text("Charged · sent to the bank", color = PosDim, style = MaterialTheme.typography.bodyMedium)
        }
    }

    // 2) The bank's fraud verdict — the reason this demo exists.
    val fraud = result.isFraud == true
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = PosSurface),
        border = androidx.compose.foundation.BorderStroke(1.dp, if (fraud) Fraud else PayDeep)
    ) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(
                    modifier = Modifier.size(28.dp).clip(CircleShape)
                        .background(if (fraud) Fraud else Pay),
                    contentAlignment = Alignment.Center
                ) { Text(if (fraud) "!" else "✓", color = Color.White, fontWeight = FontWeight.Black) }
                Text(
                    if (fraud) "FRAUD DETECTED" else "LEGITIMATE",
                    color = if (fraud) Fraud else Pay,
                    style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold
                )
            }
            result.fraudScore?.let {
                LinearProgressIndicator(
                    progress = { it.toFloat().coerceIn(0f, 1f) },
                    color = if (fraud) Fraud else Pay,
                    trackColor = PosLine,
                    modifier = Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(4.dp))
                )
                Text("Model fraud score: ${"%.1f".format(it * 100)}%   ·   threshold 69%",
                    color = PosText, style = MaterialTheme.typography.bodyMedium)
            }
            Text(result.message, color = PosDim, style = MaterialTheme.typography.bodySmall)
            Text("Shown live in the FraudGuard Command Center.",
                color = PosDim, style = MaterialTheme.typography.bodySmall)
        }
    }

    NewSaleButton(onReset)
}

@Composable
private fun NewSaleButton(onReset: () -> Unit) {
    OutlinedButton(
        onClick = onReset,
        modifier = Modifier.fillMaxWidth().height(50.dp),
        shape = RoundedCornerShape(14.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, PosLine)
    ) { Text("New Sale", color = PosText, fontWeight = FontWeight.SemiBold) }
}

@Composable
private fun posFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedTextColor = PosText,
    unfocusedTextColor = PosText,
    focusedBorderColor = Brand,
    unfocusedBorderColor = PosLine,
    focusedLabelColor = Brand,
    unfocusedLabelColor = PosDim,
    cursorColor = Brand
)
