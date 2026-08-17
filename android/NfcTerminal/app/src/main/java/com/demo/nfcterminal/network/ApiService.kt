package com.demo.nfcterminal.network

import com.demo.nfcterminal.data.Transaction
import com.demo.nfcterminal.data.TransactionResponse
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.POST

interface ApiService {
    @POST("transactions")
    suspend fun submitTransaction(@Body transaction: Transaction): Response<TransactionResponse>
}
