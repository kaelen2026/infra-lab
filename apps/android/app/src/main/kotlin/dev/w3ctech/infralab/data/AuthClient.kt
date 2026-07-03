package dev.w3ctech.infralab.data

import dev.w3ctech.infralab.data.contracts.AuthTokens
import dev.w3ctech.infralab.data.contracts.AuthUser
import dev.w3ctech.infralab.data.contracts.DeviceDTO
import dev.w3ctech.infralab.data.contracts.LoginEventDTO
import dev.w3ctech.infralab.data.contracts.RequestOtpResponse
import dev.w3ctech.infralab.data.contracts.VerifyOtpResponse

/**
 * The shape every platform SDK implements (mirrors the shared `AuthClient` interface). Android's
 * transport is OkHttp/Retrofit + Bearer tokens persisted in EncryptedSharedPreferences, with an
 * OkHttp Authenticator transparently refreshing on 401.
 *
 * Calls throw [AuthException] on a non-2xx response.
 */
interface AuthClient {
    suspend fun requestOtp(phone: String): RequestOtpResponse

    /** Login == register: a brand-new phone is created on the server on first verify. */
    suspend fun verifyOtp(phone: String, code: String): VerifyOtpResponse

    /** Rotate the stored refresh token, or null when there is none / it is expired/revoked. */
    suspend fun refresh(): AuthTokens?

    suspend fun me(): AuthUser

    /** Registered client installs for the current user (account dashboard). */
    suspend fun listDevices(): List<DeviceDTO>

    /** Recent OTP verification attempts for the current user (account dashboard). */
    suspend fun listLoginEvents(): List<LoginEventDTO>

    /**
     * Approve a QR login ticket scanned from the web, signing that browser in as this
     * (already-authenticated) user. [ticketId] is the value decoded from the scanned QR.
     */
    suspend fun approveQrLogin(ticketId: String)

    suspend fun logout()
}
