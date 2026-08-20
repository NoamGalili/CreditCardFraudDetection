package com.demo.nfcterminal.data

/**
 * Response from POST /api/dashboard/inject — the feed entry the server
 * created for this tap. "prediction" is 1 for fraud, 0 for legitimate.
 */
data class InjectResponse(
    val sequence: Int? = null,
    val source: String? = null,
    val transaction_id: String? = null,
    val prediction: Int? = null,
    val probability: Double? = null,
    val threshold: Double? = null,
    val base_models: Map<String, Double>? = null,
    val inference_ms: Double? = null,
    val ground_truth: Int? = null,
    val error: String? = null,
) {
    val isFraud: Boolean get() = prediction == 1
}
