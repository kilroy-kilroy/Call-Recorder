import Testing
@testable import MeetingRecorder

@Suite("KeychainHelper Tests")
struct KeychainHelperTests {
    let helper = KeychainHelper(service: "com.meetingrecorder.test")

    @Test("Save and retrieve server URL")
    func saveAndGetServerURL() {
        helper.setServerURL("https://example.com")
        let url = helper.getServerURL()
        #expect(url == "https://example.com")
        helper.deleteServerURL()
    }

    @Test("Save and retrieve API key")
    func saveAndGetAPIKey() {
        helper.setAPIKey("test-key-123")
        let key = helper.getAPIKey()
        #expect(key == "test-key-123")
        helper.deleteAPIKey()
    }

    @Test("Returns nil when not set")
    func returnsNilWhenEmpty() {
        helper.deleteServerURL()
        helper.deleteAPIKey()
        #expect(helper.getServerURL() == nil)
        #expect(helper.getAPIKey() == nil)
    }
}
