#if os(iOS)
import Foundation

/// Friendly names for the model identifiers iOS reports (`hw.machine`,
/// "iPhone18,1"), for the device list on the server. From the Simulator's
/// device profiles: the iPhones and iPads that run iOS 18 or later. A model
/// this table doesn't know yet is just "iPhone" or "iPad".
enum DeviceModels {
    static let names: [String: String] = [
        "iPad8,1": "iPad Pro (11-inch) (1st generation)", // i18n-ignore
        "iPad8,5": "iPad Pro (12.9-inch) (3rd generation)", // i18n-ignore
        "iPad8,9": "iPad Pro (11-inch) (2nd generation)", // i18n-ignore
        "iPad8,12": "iPad Pro (12.9-inch) (4th generation)", // i18n-ignore
        "iPad11,1": "iPad mini (5th generation)", // i18n-ignore
        "iPad11,3": "iPad Air (3rd generation)", // i18n-ignore
        "iPad11,7": "iPad (8th generation)", // i18n-ignore
        "iPad12,2": "iPad (9th generation)", // i18n-ignore
        "iPad13,2": "iPad Air (4th generation)", // i18n-ignore
        "iPad13,5": "iPad Pro (11-inch) (3rd generation)", // i18n-ignore
        "iPad13,10": "iPad Pro (12.9-inch) (5th generation)", // i18n-ignore
        "iPad13,17": "iPad Air (5th generation)", // i18n-ignore
        "iPad13,18": "iPad (10th generation)", // i18n-ignore
        "iPad14,1": "iPad mini (6th generation)", // i18n-ignore
        "iPad14,3": "iPad Pro (11-inch) (4th generation)", // i18n-ignore
        "iPad14,4": "iPad Pro (11-inch) (4th generation)", // i18n-ignore
        "iPad14,5": "iPad Pro (12.9-inch) (6th generation)", // i18n-ignore
        "iPad14,9": "iPad Air 11-inch (M2)", // i18n-ignore
        "iPad14,11": "iPad Air 13-inch (M2)", // i18n-ignore
        "iPad15,3": "iPad Air 11-inch (M3)", // i18n-ignore
        "iPad15,5": "iPad Air 13-inch (M3)", // i18n-ignore
        "iPad15,7": "iPad (A16)", // i18n-ignore
        "iPad16,2": "iPad mini (A17 Pro)", // i18n-ignore
        "iPad16,4": "iPad Pro 11-inch (M4)", // i18n-ignore
        "iPad16,6": "iPad Pro 13-inch (M4)", // i18n-ignore
        "iPad16,9": "iPad Air 11-inch (M4)", // i18n-ignore
        "iPad16,11": "iPad Air 13-inch (M4)", // i18n-ignore
        "iPad17,2": "iPad Pro 11-inch (M5)", // i18n-ignore
        "iPad17,4": "iPad Pro 13-inch (M5)", // i18n-ignore
        "iPhone11,2": "iPhone Xs", // i18n-ignore
        "iPhone11,4": "iPhone Xs Max", // i18n-ignore
        "iPhone11,8": "iPhone XR", // i18n-ignore
        "iPhone12,1": "iPhone 11", // i18n-ignore
        "iPhone12,3": "iPhone 11 Pro", // i18n-ignore
        "iPhone12,5": "iPhone 11 Pro Max", // i18n-ignore
        "iPhone12,8": "iPhone SE (2nd generation)", // i18n-ignore
        "iPhone13,1": "iPhone 12 mini", // i18n-ignore
        "iPhone13,2": "iPhone 12", // i18n-ignore
        "iPhone13,3": "iPhone 12 Pro", // i18n-ignore
        "iPhone13,4": "iPhone 12 Pro Max", // i18n-ignore
        "iPhone14,2": "iPhone 13 Pro", // i18n-ignore
        "iPhone14,3": "iPhone 13 Pro Max", // i18n-ignore
        "iPhone14,4": "iPhone 13 mini", // i18n-ignore
        "iPhone14,5": "iPhone 13", // i18n-ignore
        "iPhone14,6": "iPhone SE (3rd generation)", // i18n-ignore
        "iPhone14,7": "iPhone 14", // i18n-ignore
        "iPhone14,8": "iPhone 14 Plus", // i18n-ignore
        "iPhone15,2": "iPhone 14 Pro", // i18n-ignore
        "iPhone15,3": "iPhone 14 Pro Max", // i18n-ignore
        "iPhone15,4": "iPhone 15", // i18n-ignore
        "iPhone15,5": "iPhone 15 Plus", // i18n-ignore
        "iPhone16,1": "iPhone 15 Pro", // i18n-ignore
        "iPhone16,2": "iPhone 15 Pro Max", // i18n-ignore
        "iPhone17,1": "iPhone 16 Pro", // i18n-ignore
        "iPhone17,2": "iPhone 16 Pro Max", // i18n-ignore
        "iPhone17,3": "iPhone 16", // i18n-ignore
        "iPhone17,4": "iPhone 16 Plus", // i18n-ignore
        "iPhone17,5": "iPhone 16e", // i18n-ignore
        "iPhone18,1": "iPhone 17 Pro", // i18n-ignore
        "iPhone18,2": "iPhone 17 Pro Max", // i18n-ignore
        "iPhone18,3": "iPhone 17", // i18n-ignore
        "iPhone18,4": "iPhone Air", // i18n-ignore
        "iPhone18,5": "iPhone 17e", // i18n-ignore
        "iPhone19,2": "iPhone 18 Pro", // i18n-ignore
        "iPhone19,3": "iPhone 18 Pro Max", // i18n-ignore
    ]

    /// The identifier of the hardware this runs on (the Simulator reports
    /// the device it's simulating).
    static var currentIdentifier: String? {
        if let simulated = ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"] {
            return simulated
        }
        var info = utsname()
        uname(&info)
        let machine = withUnsafeBytes(of: &info.machine) { bytes in
            String(decoding: bytes.prefix { $0 != 0 }, as: UTF8.self)
        }
        return machine.isEmpty ? nil : machine
    }
}
#endif
