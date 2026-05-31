import Foundation
import KeychainAccess

// MARK: - Keychain Manager
class KeychainManager {
    static let shared = KeychainManager()
    private let keychain = KeychainAccess.Keychain(service: "com.roua.trading")

    private init() {}

    // MARK: - Keys
    enum Key: String {
        case sessionToken = "roua_session"
        case refreshToken = "roua_refresh"
        case userId = "roua_user_id"
        case userEmail = "roua_user_email"
        case userTier = "roua_user_tier"
    }

    // MARK: - CRUD
    func set(key: String, value: String) { keychain[key] = value }
    func get(key: String) -> String? { keychain[key] }
    func delete(key: String) {
        do {
            try keychain.remove(key)
        } catch {
            print("[Keychain] Failed to delete key \(key): \(error.localizedDescription)")
        }
    }
    func deleteAll() {
        do {
            try keychain.removeAll()
        } catch {
            print("[Keychain] Failed to delete all keys: \(error.localizedDescription)")
        }
    }

    // MARK: - Convenience Methods
    func saveSession(token: String, refresh: String?, userId: String?) {
        set(key: Key.sessionToken.rawValue, value: token)
        if let refresh = refresh { set(key: Key.refreshToken.rawValue, value: refresh) }
        if let userId = userId { set(key: Key.userId.rawValue, value: userId) }
    }

    var sessionToken: String? { get(key: Key.sessionToken.rawValue) }
    var refreshToken: String? { get(key: Key.refreshToken.rawValue) }
    var savedUserId: String? { get(key: Key.userId.rawValue) }

    func clearSession() {
        delete(key: Key.sessionToken.rawValue)
        delete(key: Key.refreshToken.rawValue)
        delete(key: Key.userId.rawValue)
    }
}
