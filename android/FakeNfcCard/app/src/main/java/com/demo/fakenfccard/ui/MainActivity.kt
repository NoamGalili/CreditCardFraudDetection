package com.demo.fakenfccard.ui

import android.nfc.NfcAdapter
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface

class MainActivity : ComponentActivity() {

    private val viewModel: CardViewModel by viewModels {
        CardViewModelFactory(applicationContext)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val nfcAdapter = NfcAdapter.getDefaultAdapter(this)
        if (nfcAdapter == null) {
            Toast.makeText(this, "NFC not available on this device", Toast.LENGTH_LONG).show()
        } else if (!nfcAdapter.isEnabled) {
            Toast.makeText(this, "Please enable NFC in device settings", Toast.LENGTH_LONG).show()
        }

        setContent {
            MaterialTheme {
                Surface { CardScreen(viewModel = viewModel) }
            }
        }
    }
}
