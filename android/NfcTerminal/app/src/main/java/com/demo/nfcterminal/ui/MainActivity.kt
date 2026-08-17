package com.demo.nfcterminal.ui

import android.nfc.NfcAdapter
import android.nfc.Tag
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface

/**
 * Owns the NFC adapter lifecycle.
 *
 * enableReaderMode is called in onResume so the terminal is always active
 * while the app is in the foreground. disableReaderMode is called in onPause
 * to release the hardware when backgrounded.
 *
 * FLAG_READER_SKIP_NDEF_CHECK prevents the system from wasting time trying
 * to parse NDEF records before handing the tag to us.
 */
class MainActivity : ComponentActivity(), NfcAdapter.ReaderCallback {

    private val viewModel: TerminalViewModel by viewModels()
    private var nfcAdapter: NfcAdapter? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        nfcAdapter = NfcAdapter.getDefaultAdapter(this)
        if (nfcAdapter == null) {
            Toast.makeText(this, "NFC not available on this device", Toast.LENGTH_LONG).show()
        }

        setContent {
            MaterialTheme {
                Surface { TerminalScreen(viewModel = viewModel) }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        nfcAdapter?.enableReaderMode(
            this,
            this,
            NfcAdapter.FLAG_READER_NFC_A or
            NfcAdapter.FLAG_READER_NFC_B or
            NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK,
            null
        ) ?: Toast.makeText(this, "Please enable NFC in device settings", Toast.LENGTH_SHORT).show()
    }

    override fun onPause() {
        super.onPause()
        nfcAdapter?.disableReaderMode(this)
    }

    // Called on a binder thread — forward to coroutine on ViewModel
    override fun onTagDiscovered(tag: Tag) {
        viewModel.onTagDiscovered(tag)
    }
}
