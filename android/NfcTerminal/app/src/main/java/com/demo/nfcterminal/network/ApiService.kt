package com.demo.nfcterminal.network

import com.demo.nfcterminal.data.InjectResponse
import com.demo.nfcterminal.data.Transaction
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.POST

interface ApiService {

    /**
     * Injects one scored transaction into the live Command Center feed.
     * The server runs the real ensemble and returns the feed entry
     * (prediction, probability, base-model scores, …).
     */
    @POST("api/dashboard/inject")
    suspend fun injectTransaction(@Body transaction: Transaction): Response<InjectResponse>
}
