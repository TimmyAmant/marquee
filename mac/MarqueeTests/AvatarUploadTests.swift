import XCTest
import ImageIO
import UniformTypeIdentifiers
@testable import Marquee

// The profile photo as the edit sheet uploads it: decoded on the Mac (HEIC
// included), upright, at most 1600 on the long side, JPEG, no metadata.

final class AvatarUploadTests: XCTestCase {
    private func image(width: Int, height: Int) -> CGImage {
        let context = CGContext(
            data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
            space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
        )!
        context.setFillColor(CGColor(red: 0.9, green: 0.6, blue: 0.2, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        return context.makeImage()!
    }

    /// `image` encoded as `type`, with `properties` (orientation, GPS…); nil
    /// when this Mac has no encoder for it.
    private func encode(_ image: CGImage, as type: UTType, properties: [CFString: Any] = [:]) -> Data? {
        let data = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(data, type.identifier as CFString, 1, nil) else { return nil }
        CGImageDestinationAddImage(destination, image, properties as CFDictionary)
        return CGImageDestinationFinalize(destination) ? data as Data : nil
    }

    private func properties(_ data: Data) throws -> [CFString: Any] {
        let source = try XCTUnwrap(CGImageSourceCreateWithData(data as CFData, nil))
        return try XCTUnwrap(CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any])
    }

    private func size(_ data: Data) throws -> (Int, Int) {
        let properties = try properties(data)
        return (properties[kCGImagePropertyPixelWidth] as? Int ?? 0, properties[kCGImagePropertyPixelHeight] as? Int ?? 0)
    }

    func testALargePhotoIsShrunkToJPEG() throws {
        let png = try XCTUnwrap(encode(image(width: 3000, height: 2000), as: .png))
        let jpeg = try XCTUnwrap(AvatarUpload.jpegData(from: png))
        XCTAssertEqual(Array(jpeg.prefix(2)), [0xFF, 0xD8], "A JPEG")
        let (width, height) = try size(jpeg)
        XCTAssertEqual(width, 1600)
        XCTAssertEqual(height, 1067, accuracy: 1)
    }

    func testASmallPhotoIsNotEnlarged() throws {
        let png = try XCTUnwrap(encode(image(width: 400, height: 300), as: .png))
        let (width, height) = try size(try XCTUnwrap(AvatarUpload.jpegData(from: png)))
        XCTAssertEqual(width, 400)
        XCTAssertEqual(height, 300)
    }

    func testItComesOutUprightWithoutMetadata() throws {
        // Taken with the phone on its side: stored 300×200, shown 200×300.
        let jpeg = try XCTUnwrap(encode(image(width: 300, height: 200), as: .jpeg, properties: [
            kCGImagePropertyOrientation: 6,
            kCGImagePropertyGPSDictionary: [kCGImagePropertyGPSLatitude: 51.5, kCGImagePropertyGPSLongitude: 0.12],
        ]))
        XCTAssertNotNil(try properties(jpeg)[kCGImagePropertyGPSDictionary], "The original has a location")

        let upload = try XCTUnwrap(AvatarUpload.jpegData(from: jpeg))
        let (width, height) = try size(upload)
        XCTAssertEqual(width, 200)
        XCTAssertEqual(height, 300)
        let result = try properties(upload)
        XCTAssertNil(result[kCGImagePropertyGPSDictionary], "The location isn't uploaded")
        XCTAssertEqual(result[kCGImagePropertyOrientation] as? Int ?? 1, 1)
    }

    func testHEICIsConvertedOnTheMac() throws {
        guard let heic = encode(image(width: 800, height: 600), as: .heic) else {
            throw XCTSkip("No HEIC encoder on this Mac")
        }
        let jpeg = try XCTUnwrap(AvatarUpload.jpegData(from: heic), "The server can't read HEIC, so the Mac converts it")
        XCTAssertEqual(Array(jpeg.prefix(2)), [0xFF, 0xD8])
    }

    func testSomethingThatIsntAnImageIsLeftToTheServer() {
        XCTAssertNil(AvatarUpload.jpegData(from: Data("not a photo".utf8)))
    }
}
