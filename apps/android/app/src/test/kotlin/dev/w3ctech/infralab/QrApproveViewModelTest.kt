package dev.w3ctech.infralab

import dev.w3ctech.infralab.data.AuthClient
import dev.w3ctech.infralab.data.AuthException
import dev.w3ctech.infralab.data.contracts.AuthErrorCode
import dev.w3ctech.infralab.data.contracts.AuthTokens
import dev.w3ctech.infralab.data.contracts.AuthUser
import dev.w3ctech.infralab.data.contracts.DeviceDTO
import dev.w3ctech.infralab.data.contracts.LoginEventDTO
import dev.w3ctech.infralab.data.contracts.RequestOtpResponse
import dev.w3ctech.infralab.data.contracts.VerifyOtpResponse
import dev.w3ctech.infralab.ui.qr.QrApproveStatus
import dev.w3ctech.infralab.ui.qr.QrApproveViewModel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test

/** Fake [AuthClient] exercising only the QR approve path; every other call is unused here. */
private class FakeAuthClient(private val approveError: AuthException? = null) : AuthClient {
    var approvedTicket: String? = null
        private set

    override suspend fun approveQrLogin(ticketId: String) {
        approveError?.let { throw it }
        approvedTicket = ticketId
    }

    override suspend fun requestOtp(phone: String): RequestOtpResponse = error("unused")
    override suspend fun verifyOtp(phone: String, code: String): VerifyOtpResponse = error("unused")
    override suspend fun refresh(): AuthTokens? = error("unused")
    override suspend fun me(): AuthUser = error("unused")
    override suspend fun listDevices(): List<DeviceDTO> = error("unused")
    override suspend fun listLoginEvents(): List<LoginEventDTO> = error("unused")
    override suspend fun logout() = error("unused")
}

class QrApproveViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    @Test
    fun `approve marks success and forwards the ticket id`() {
        val client = FakeAuthClient()
        val vm = QrApproveViewModel(client)
        vm.approve("ticket-123")
        assertEquals(QrApproveStatus.SUCCESS, vm.state.value.status)
        assertEquals("ticket-123", client.approvedTicket)
    }

    @Test
    fun `a blank scan is ignored`() {
        val client = FakeAuthClient()
        val vm = QrApproveViewModel(client)
        vm.approve("   ")
        assertEquals(QrApproveStatus.IDLE, vm.state.value.status)
        assertNull(client.approvedTicket)
    }

    @Test
    fun `a rejected ticket surfaces an error message`() {
        val client = FakeAuthClient(
            AuthException(code = AuthErrorCode.QR_ALREADY_USED, status = 409, message = null),
        )
        val vm = QrApproveViewModel(client)
        vm.approve("ticket-123")
        assertEquals(QrApproveStatus.ERROR, vm.state.value.status)
        assertNotNull(vm.state.value.message)
    }

    @Test
    fun `reset returns to idle`() {
        val vm = QrApproveViewModel(FakeAuthClient())
        vm.approve("ticket-123")
        vm.reset()
        assertEquals(QrApproveStatus.IDLE, vm.state.value.status)
        assertNull(vm.state.value.message)
    }
}
