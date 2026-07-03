package dev.w3ctech.infralab.ui.qr

import android.content.Context
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning

/**
 * Thin wrapper over Google's code scanner (Play Services). It presents a full-screen, Google-hosted
 * scanning UI and asks only for QR codes — crucially it needs **no** `CAMERA` permission (the
 * scanner module owns the camera), so the app declares none. The decoded string is the web ticket
 * id; callers hand it to [QrApproveViewModel.approve].
 */
object QrScanner {
    fun scan(context: Context, onResult: (String) -> Unit, onError: (String) -> Unit) {
        val options = GmsBarcodeScannerOptions.Builder()
            .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
            .build()
        GmsBarcodeScanning.getClient(context, options)
            .startScan()
            .addOnSuccessListener { barcode ->
                val value = barcode.rawValue
                if (value.isNullOrBlank()) onError("未识别到二维码内容") else onResult(value)
            }
            .addOnCanceledListener {
                // A user cancel is not an error — leave the card untouched.
            }
            .addOnFailureListener { e -> onError(e.message ?: "扫码失败,请重试") }
    }
}
